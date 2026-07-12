/**
 * 场地烘焙服务（site-bake）
 *
 * 给定赛事 bbox，复用已有的 terrain / osm 服务采样地形与白模，叠加正射卫星底图，
 * 组装为前端 buildFocusZoneStudioScene 可直接消费的 focusZone 形状对象。
 *
 * 设计取舍：不穿过既有的异步 export-job / publish 管线（那套偏 3D 打印导出），
 * 这里走聚焦的同步烘焙，复用底层 service 函数，对既有 studio/导出流程零侵入。
 */

import { buildTerrainPatchForZone } from './inventory.spatial.terrain.service.js';
import { fetchOsmBuildingsForFocusZone } from './inventory.spatial.osm.service.js';
import { describeOrthophotoForBbox } from './inventory.spatial.orthophoto.service.js';

const EMPTY_OSM_BUILDINGS = {
    kind: 'osm-building-footprints',
    source: 'none',
    count: 0,
    buildings: [],
};
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;
const MAX_SITE_BBOX_SPAN_DEGREES = 0.25;

function pickNumber(value, fallback = 0) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
}

export function parseSiteBakeBbox(body) {
    const bbox = body?.bbox || body;
    const west = Number(bbox?.west);
    const south = Number(bbox?.south);
    const east = Number(bbox?.east);
    const north = Number(bbox?.north);
    if (![west, south, east, north].every(Number.isFinite)) return null;
    if (east <= west || north <= south) return null;
    if (west < -180 || east > 180) return null;
    if (south < -WEB_MERCATOR_MAX_LATITUDE || north > WEB_MERCATOR_MAX_LATITUDE) return null;
    if (east - west > MAX_SITE_BBOX_SPAN_DEGREES) return null;
    if (north - south > MAX_SITE_BBOX_SPAN_DEGREES) return null;
    return { west, south, east, north };
}

/** bbox → 闭合 GeoJSON 矩形多边形（顺时针，首尾点相同） */
export function bboxToClipPolygon(bbox) {
    const west = pickNumber(bbox?.west);
    const south = pickNumber(bbox?.south);
    const east = pickNumber(bbox?.east);
    const north = pickNumber(bbox?.north);
    return {
        type: 'Polygon',
        coordinates: [
            [
                [west, north],
                [east, north],
                [east, south],
                [west, south],
                [west, north],
            ],
        ],
    };
}

/** bbox 几何中心（含 height=0），作为本地 ENU 坐标系原点 */
export function bboxCenter(bbox) {
    return {
        longitude: (pickNumber(bbox?.west) + pickNumber(bbox?.east)) / 2,
        latitude: (pickNumber(bbox?.south) + pickNumber(bbox?.north)) / 2,
        height: 0,
    };
}

/**
 * 把已采样的地形/建筑/正射图组装为 focusZone 形状对象（纯函数，无网络）。
 * 缺省地形/建筑时仍能组装（终端鲁棒，前端按缺省渲染）。
 */
export function assembleSiteFocusZone({
    bbox,
    name = 'GIS 场地',
    id = null,
    terrainPatch = null,
    osmBuildings = null,
    orthophoto = null,
} = {}) {
    return {
        id: id || `site-bake-${Date.now()}`,
        name,
        zoneType: 'site',
        clipPolygonWgs84: bboxToClipPolygon(bbox),
        originWgs84: bboxCenter(bbox),
        terrainResolution: 2,
        snapshotJson: {
            terrainPatch: terrainPatch || null,
            osmBuildings: osmBuildings || { ...EMPTY_OSM_BUILDINGS },
        },
        orthophoto: orthophoto || null,
    };
}

/**
 * 编排：从 bbox 烘焙完整场地场景。复用底层 service；地形/建筑任一失败均优雅降级，
 * 不让整次烘焙失败（现场弱网常态）。返回 { focusZone, warnings }。
 */
export async function bakeSiteScene(bbox, options = {}, fetchImpl = globalThis.fetch) {
    const name = options.name || 'GIS 场地';
    const warnings = [];

    const zone = {
        id: options.id || null,
        name,
        zoneType: 'site',
        clipPolygonWgs84: bboxToClipPolygon(bbox),
        originWgs84: bboxCenter(bbox),
        terrainResolution: pickNumber(options.terrainResolution, 2),
    };

    let terrainPatch = null;
    try {
        terrainPatch = await buildTerrainPatchForZone(zone, options.terrain || {}, fetchImpl);
    } catch (error) {
        warnings.push(`地形采样失败：${error.message}`);
    }

    let osmBuildings = null;
    try {
        osmBuildings = await fetchOsmBuildingsForFocusZone(zone, options.osm || {});
    } catch (error) {
        warnings.push(`OSM 建筑获取失败：${error.message}`);
    }

    const orthophoto = describeOrthophotoForBbox(bbox, options.orthophoto || {});

    const focusZone = assembleSiteFocusZone({
        bbox,
        name,
        id: options.id || null,
        terrainPatch,
        osmBuildings,
        orthophoto,
    });

    return { focusZone, warnings };
}

/**
 * 场地烘焙组装单元测试 — 纯组装逻辑（不含网络），覆盖 site-bake 把
 * terrainPatch + osmBuildings + orthophoto 组装为前端可消费的 focusZone 形状。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    bboxToClipPolygon,
    bboxCenter,
    assembleSiteFocusZone,
    parseSiteBakeBbox,
} from '../src/modules/inventory/inventory.spatial.site-bake.service.js';

const BBOX = { west: 104.06, south: 30.645, east: 104.074, north: 30.656 };

describe('parseSiteBakeBbox', () => {
    it('接受合法的小范围 WGS84 bbox', () => {
        assert.deepEqual(parseSiteBakeBbox({ bbox: BBOX }), BBOX);
    });

    it('拒绝越界、倒置或跨度过大的 bbox', () => {
        assert.equal(parseSiteBakeBbox({ west: 181, south: 30, east: 182, north: 31 }), null);
        assert.equal(parseSiteBakeBbox({ west: 104.1, south: 30, east: 104, north: 31 }), null);
        assert.equal(parseSiteBakeBbox({ west: 104, south: 30, east: 104.3, north: 30.1 }), null);
    });
});

describe('bboxToClipPolygon', () => {
    it('返回闭合的 GeoJSON 矩形多边形（5 点，首尾相同）', () => {
        const polygon = bboxToClipPolygon(BBOX);
        assert.equal(polygon.type, 'Polygon');
        const ring = polygon.coordinates[0];
        assert.equal(ring.length, 5);
        assert.deepEqual(ring[0], ring[4]);
    });

    it('四角与 bbox 一致', () => {
        const ring = bboxToClipPolygon(BBOX).coordinates[0];
        const lngs = ring.map((p) => p[0]);
        const lats = ring.map((p) => p[1]);
        assert.equal(Math.min(...lngs), BBOX.west);
        assert.equal(Math.max(...lngs), BBOX.east);
        assert.equal(Math.min(...lats), BBOX.south);
        assert.equal(Math.max(...lats), BBOX.north);
    });
});

describe('bboxCenter', () => {
    it('返回 bbox 几何中心', () => {
        const center = bboxCenter(BBOX);
        assert.ok(Math.abs(center.longitude - 104.067) < 1e-9);
        assert.ok(Math.abs(center.latitude - 30.6505) < 1e-9);
    });
});

describe('assembleSiteFocusZone', () => {
    const terrainPatch = { kind: 'terrain-grid-patch', rows: 4, cols: 4, heightsRelative: [] };
    const osmBuildings = {
        buildings: [{ footprintWgs84: { coordinates: [[[104.06, 30.65]]] } }],
        count: 1,
    };
    const orthophoto = {
        provider: 'esri_world_imagery',
        zoom: 16,
        tiles: [],
        coverBounds: BBOX,
        requestedBbox: BBOX,
    };

    it('组装出 site 类型、含 clip 多边形与中心 origin 的 focusZone', () => {
        const zone = assembleSiteFocusZone({
            bbox: BBOX,
            name: '测试赛场',
            terrainPatch,
            osmBuildings,
            orthophoto,
        });
        assert.equal(zone.zoneType, 'site');
        assert.equal(zone.name, '测试赛场');
        assert.equal(zone.clipPolygonWgs84.type, 'Polygon');
        assert.ok(Math.abs(zone.originWgs84.longitude - 104.067) < 1e-9);
        assert.ok(Math.abs(zone.originWgs84.latitude - 30.6505) < 1e-9);
    });

    it('snapshotJson 携带 terrainPatch 与 osmBuildings，顶层携带 orthophoto', () => {
        const zone = assembleSiteFocusZone({
            bbox: BBOX,
            name: 'x',
            terrainPatch,
            osmBuildings,
            orthophoto,
        });
        assert.equal(zone.snapshotJson.terrainPatch, terrainPatch);
        assert.equal(zone.snapshotJson.osmBuildings, osmBuildings);
        assert.equal(zone.orthophoto, orthophoto);
    });

    it('缺省地形/建筑时仍组装成功（终端鲁棒）', () => {
        const zone = assembleSiteFocusZone({ bbox: BBOX, name: 'x', orthophoto });
        assert.equal(zone.zoneType, 'site');
        assert.equal(zone.snapshotJson.terrainPatch, null);
        assert.deepEqual(zone.snapshotJson.osmBuildings.buildings, []);
    });
});

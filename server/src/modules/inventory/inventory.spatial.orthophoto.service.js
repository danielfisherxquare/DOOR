/**
 * 正射卫星底图服务
 *
 * 给定地理 bbox，计算覆盖该区域的 Web Mercator (XYZ) 卫星瓦片清单及每片地理边界，
 * 前端据此把瓦片合成为一张纹理，贴到地形网格上作为「场地模式」的卫星底图。
 *
 * 纯数学 + URL 构造，无网络/数据库依赖；瓦片图源默认 Esri World Imagery（WGS84，
 * 与 Cesium 白模/地形同坐标系，避免 GCJ 偏移）。
 */

const TILE_PROVIDER = 'esri_world_imagery';
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;
const MAX_ORTHOPHOTO_TILES = 256;
const ESRI_WORLD_IMAGERY_TEMPLATE =
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
// 天地图影像 img_w：WGS84 / Web Mercator（与 OSM/Cesium 同坐标系，无 GCJ 偏移），需 tk
const TIANDITU_IMAGERY_TEMPLATE =
    'https://t{s}.tianditu.gov.cn/DataServer?T=img_w&x={x}&y={y}&l={z}&tk={tk}';

function clampLatitude(latitude) {
    return Math.max(Math.min(latitude, WEB_MERCATOR_MAX_LATITUDE), -WEB_MERCATOR_MAX_LATITUDE);
}

function clampTileIndex(value, tilesPerAxis) {
    return Math.max(0, Math.min(tilesPerAxis - 1, value));
}

function clampInteger(value, low, high, fallback) {
    const next = Math.floor(Number(value));
    if (!Number.isFinite(next)) return fallback;
    return Math.max(low, Math.min(high, next));
}

/** 经纬度 → 指定 zoom 下所属瓦片的整数 (x, y) 索引 */
export function lngLatToTile(longitude, latitude, zoom) {
    const tilesPerAxis = 2 ** zoom;
    const x = Math.floor(((longitude + 180) / 360) * tilesPerAxis);
    const latitudeRad = (clampLatitude(latitude) * Math.PI) / 180;
    const y = Math.floor(((1 - Math.asinh(Math.tan(latitudeRad)) / Math.PI) / 2) * tilesPerAxis);
    return {
        z: zoom,
        x: clampTileIndex(x, tilesPerAxis),
        y: clampTileIndex(y, tilesPerAxis),
    };
}

function tileLatitude(y, tilesPerAxis) {
    const n = Math.PI * (1 - (2 * y) / tilesPerAxis);
    return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

/** 瓦片 (x, y, z) → 其 WGS84 地理边界 */
export function tileToBoundsWgs84(x, y, zoom) {
    const tilesPerAxis = 2 ** zoom;
    return {
        west: (x / tilesPerAxis) * 360 - 180,
        east: ((x + 1) / tilesPerAxis) * 360 - 180,
        north: tileLatitude(y, tilesPerAxis),
        south: tileLatitude(y + 1, tilesPerAxis),
    };
}

/** Esri World Imagery 瓦片 URL（注意 ArcGIS 模板次序为 {z}/{y}/{x}） */
export function buildEsriWorldImageryTileUrl({ z, x, y }) {
    return ESRI_WORLD_IMAGERY_TEMPLATE.replace('{z}', String(z))
        .replace('{y}', String(y))
        .replace('{x}', String(x));
}

/** 天地图影像 img_w 瓦片 URL（需 tk；子域 t0-t7 按瓦片分散） */
export function buildTiandituImageryTileUrl({ z, x, y }, tiandituKey) {
    return TIANDITU_IMAGERY_TEMPLATE.replace('{s}', String((x + y) % 8))
        .replace('{x}', String(x))
        .replace('{y}', String(y))
        .replace('{z}', String(z))
        .replace('{tk}', String(tiandituKey || ''));
}

function tileRangeForBbox(bbox, zoom) {
    const topLeft = lngLatToTile(bbox.west, bbox.north, zoom);
    const bottomRight = lngLatToTile(bbox.east, bbox.south, zoom);
    const minX = Math.min(topLeft.x, bottomRight.x);
    const maxX = Math.max(topLeft.x, bottomRight.x);
    const minY = Math.min(topLeft.y, bottomRight.y);
    const maxY = Math.max(topLeft.y, bottomRight.y);
    return { minX, maxX, minY, maxY };
}

/** 不分配瓦片对象即可计算 bbox 覆盖数量，供服务端预算检查使用。 */
export function countTilesCoveringBbox(bbox, zoom) {
    const { minX, maxX, minY, maxY } = tileRangeForBbox(bbox, zoom);
    return (maxX - minX + 1) * (maxY - minY + 1);
}

/** 覆盖 bbox 的瓦片 {z,x,y} 列表（含边界瓦片） */
export function tilesCoveringBbox(bbox, zoom) {
    const { minX, maxX, minY, maxY } = tileRangeForBbox(bbox, zoom);

    const tiles = [];
    for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
            tiles.push({ z: zoom, x, y });
        }
    }
    return tiles;
}

function unionTileBounds(tiles) {
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const tile of tiles) {
        west = Math.min(west, tile.west);
        south = Math.min(south, tile.south);
        east = Math.max(east, tile.east);
        north = Math.max(north, tile.north);
    }
    return { west, south, east, north };
}

/** 在瓦片预算内自动挑选最高 zoom（瓦片越多越清晰，但要受 maxTiles 约束） */
function pickZoomForBbox(bbox, maxTiles, maxZoom = 21) {
    for (let zoom = maxZoom; zoom >= 1; zoom -= 1) {
        if (countTilesCoveringBbox(bbox, zoom) <= maxTiles) return zoom;
    }
    return null;
}

/**
 * 描述一块 bbox 的正射底图：图源、zoom、瓦片清单（含 URL 与地理边界）、
 * 实际覆盖边界 coverBounds（瓦片并集，>= 请求 bbox）以及原始请求 bbox。
 */
export function describeOrthophotoForBbox(bbox, options = {}) {
    const maxTiles = clampInteger(options.maxTiles, 1, MAX_ORTHOPHOTO_TILES, 48);
    const requestedZoom = options.zoom != null
        ? clampInteger(options.zoom, 1, 21, 16)
        : 21;
    const zoom = pickZoomForBbox(bbox, maxTiles, requestedZoom);
    if (zoom === null) {
        const error = new Error(`正射影像范围至少需要 ${countTilesCoveringBbox(bbox, 1)} 张瓦片，超过预算 ${maxTiles}`);
        error.statusCode = 400;
        error.expose = true;
        throw error;
    }

    // 天地图需要 tk；缺 tk 时回退 Esri（保证总能出图）
    const useTianditu = options.provider === 'tianditu' && Boolean(options.tiandituKey);
    const provider = useTianditu ? 'tianditu' : TILE_PROVIDER;
    const buildUrl = useTianditu
        ? (tile) => buildTiandituImageryTileUrl(tile, options.tiandituKey)
        : (tile) => buildEsriWorldImageryTileUrl(tile);

    const tiles = tilesCoveringBbox(bbox, zoom).map((tile) => ({
        ...tile,
        url: buildUrl(tile),
        ...tileToBoundsWgs84(tile.x, tile.y, tile.z),
    }));

    return {
        provider,
        zoom,
        tiles,
        coverBounds: unionTileBounds(tiles),
        requestedBbox: bbox,
    };
}

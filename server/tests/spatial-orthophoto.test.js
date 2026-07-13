/**
 * 正射卫星底图服务单元测试 — 纯 Web Mercator 瓦片数学，无需网络/PG
 * 覆盖 inventory.spatial.orthophoto.service.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    lngLatToTile,
    tileToBoundsWgs84,
    tilesCoveringBbox,
    buildEsriWorldImageryTileUrl,
    buildTiandituImageryTileUrl,
    countTilesCoveringBbox,
    describeOrthophotoForBbox,
} from '../src/modules/inventory/inventory.spatial.orthophoto.service.js';

describe('orthophoto tile math', () => {
    it('z=0 单瓦片覆盖整个 Web Mercator 世界', () => {
        const bounds = tileToBoundsWgs84(0, 0, 0);
        assert.equal(Math.round(bounds.west), -180);
        assert.equal(Math.round(bounds.east), 180);
        assert.ok(Math.abs(bounds.north - 85.0511) < 0.01, `north=${bounds.north}`);
        assert.ok(Math.abs(bounds.south + 85.0511) < 0.01, `south=${bounds.south}`);
    });

    it('点落在它自己所属瓦片的地理边界内', () => {
        const lng = 104.0668;
        const lat = 30.6505;
        const z = 14;
        const { x, y } = lngLatToTile(lng, lat, z);
        assert.ok(Number.isInteger(x) && Number.isInteger(y), 'tile 索引应为整数');
        const b = tileToBoundsWgs84(x, y, z);
        assert.ok(lng >= b.west && lng <= b.east, `lng ${lng} 不在 [${b.west}, ${b.east}]`);
        assert.ok(lat >= b.south && lat <= b.north, `lat ${lat} 不在 [${b.south}, ${b.north}]`);
    });

    it('瓦片 y 索引随纬度升高而减小（北半球）', () => {
        const z = 12;
        const low = lngLatToTile(104, 20, z);
        const high = lngLatToTile(104, 40, z);
        assert.ok(high.y < low.y, '更高纬度的 y 应更小');
    });
});

describe('tilesCoveringBbox', () => {
    const bbox = { west: 104.06, south: 30.645, east: 104.074, north: 30.656 };

    it('返回的瓦片并集完整覆盖请求 bbox', () => {
        const z = 16;
        const tiles = tilesCoveringBbox(bbox, z);
        assert.ok(tiles.length >= 1);
        let west = Infinity,
            south = Infinity,
            east = -Infinity,
            north = -Infinity;
        for (const t of tiles) {
            const b = tileToBoundsWgs84(t.x, t.y, t.z);
            west = Math.min(west, b.west);
            south = Math.min(south, b.south);
            east = Math.max(east, b.east);
            north = Math.max(north, b.north);
        }
        assert.ok(west <= bbox.west && east >= bbox.east, '经度未覆盖');
        assert.ok(south <= bbox.south && north >= bbox.north, '纬度未覆盖');
    });

    it('所有瓦片 z 与请求一致', () => {
        const z = 15;
        const tiles = tilesCoveringBbox(bbox, z);
        assert.ok(tiles.every((t) => t.z === z));
    });
});

describe('buildEsriWorldImageryTileUrl', () => {
    it('使用 {z}/{y}/{x} 次序的 ArcGIS World_Imagery 模板', () => {
        const url = buildEsriWorldImageryTileUrl({ z: 12, x: 3232, y: 1623 });
        assert.equal(
            url,
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/1623/3232'
        );
    });
});

describe('buildTiandituImageryTileUrl', () => {
    it('生成带 tk 的天地图 img_w DataServer URL（WGS84，无 GCJ）', () => {
        const url = buildTiandituImageryTileUrl({ z: 12, x: 3232, y: 1623 }, 'MY_TK');
        assert.match(url, /tianditu\.gov\.cn/);
        assert.match(url, /T=img_w/);
        assert.match(url, /x=3232/);
        assert.match(url, /y=1623/);
        assert.match(url, /l=12/);
        assert.match(url, /tk=MY_TK/);
    });
});

describe('describeOrthophotoForBbox', () => {
    const bbox = { west: 104.06, south: 30.645, east: 104.074, north: 30.656 };

    it('返回 provider/zoom/tiles/coverBounds/requestedBbox', () => {
        const desc = describeOrthophotoForBbox(bbox, { zoom: 16 });
        assert.equal(desc.provider, 'esri_world_imagery');
        assert.equal(desc.zoom, 16);
        assert.ok(Array.isArray(desc.tiles) && desc.tiles.length >= 1);
        assert.ok(desc.tiles[0].url.startsWith('https://server.arcgisonline.com/'));
        assert.ok(
            desc.coverBounds.west <= bbox.west && desc.coverBounds.east >= bbox.east,
            'coverBounds 应包含请求 bbox'
        );
        assert.deepEqual(desc.requestedBbox, bbox);
    });

    it('自动选择 zoom 时瓦片数量受上限约束', () => {
        const desc = describeOrthophotoForBbox(bbox, { maxTiles: 64 });
        assert.ok(desc.tiles.length <= 64, `tiles=${desc.tiles.length}`);
        assert.ok(desc.zoom >= 1 && desc.zoom <= 21);
    });

    it('显式高 zoom 也会降级到瓦片预算内，且计数不先分配百万对象', () => {
        const largeBbox = { west: 104, south: 30, east: 104.25, north: 30.25 };
        assert.ok(countTilesCoveringBbox(largeBbox, 21) > 1_000_000);

        const desc = describeOrthophotoForBbox(largeBbox, { zoom: 21, maxTiles: 8 });
        assert.ok(desc.zoom < 21);
        assert.ok(desc.tiles.length <= 8, `tiles=${desc.tiles.length}`);
    });

    it('服务端硬上限不允许客户端请求无限瓦片对象', () => {
        const largeBbox = { west: 104, south: 30, east: 104.25, north: 30.25 };
        const desc = describeOrthophotoForBbox(largeBbox, { zoom: 21, maxTiles: 1_000_000_000 });
        assert.ok(desc.tiles.length <= 256, `tiles=${desc.tiles.length}`);
    });

    it('provider=tianditu 时输出天地图瓦片 URL（带 tk）', () => {
        const desc = describeOrthophotoForBbox(bbox, {
            zoom: 15,
            provider: 'tianditu',
            tiandituKey: 'TK123',
        });
        assert.equal(desc.provider, 'tianditu');
        assert.ok(desc.tiles.every((t) => /tianditu\.gov\.cn/.test(t.url)));
        assert.ok(desc.tiles.every((t) => /tk=TK123/.test(t.url)));
    });

    it('provider=tianditu 但缺 tk 时回退到 esri', () => {
        const desc = describeOrthophotoForBbox(bbox, { zoom: 15, provider: 'tianditu' });
        assert.equal(desc.provider, 'esri_world_imagery');
        assert.ok(desc.tiles.every((t) => /arcgisonline\.com/.test(t.url)));
    });
});

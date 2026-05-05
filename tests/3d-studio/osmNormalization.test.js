import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildOverpassBuildingQuery,
    normalizeOverpassBuildings,
    normalizeOverpassBuildingsWithDiagnostics,
} from '../../server/src/modules/inventory/inventory.spatial.osm.service.js';

const focusZone = {
    id: 'zone-1',
    projectId: 'project-1',
    name: '测试固定区域',
    zoneType: 'focus-zone',
    updatedAt: '2026-04-16T10:00:00.000Z',
    originWgs84: { longitude: 120, latitude: 30, height: 0 },
    clipPolygonWgs84: {
        type: 'Polygon',
        coordinates: [[
            [119.99995, 29.99995],
            [120.00005, 29.99995],
            [120.00005, 30.00005],
            [119.99995, 30.00005],
            [119.99995, 29.99995],
        ]],
    },
};

test('OSM normalization query includes building parts and relations', () => {
    const query = buildOverpassBuildingQuery(focusZone.clipPolygonWgs84);

    assert.match(query, /relation\["building"\]/);
    assert.match(query, /way\["building:part"\]/);
    assert.match(query, /relation\["building:part"\]/);
    assert.doesNotMatch(query, /poly:/);
    assert.match(query, /way\["building"\]\(29\.99995,119\.99995,30\.00005,120\.00005\)/);
});

test('OSM normalization prefers building parts over parent outlines', () => {
    const buildings = normalizeOverpassBuildings({
        elements: [{
            type: 'way',
            id: 410,
            tags: { building: 'yes', name: '父级建筑外轮廓' },
            geometry: [
                { lon: 119.999965, lat: 29.999965 },
                { lon: 120.000035, lat: 29.999965 },
                { lon: 120.000035, lat: 30.000035 },
                { lon: 119.999965, lat: 30.000035 },
                { lon: 119.999965, lat: 29.999965 },
            ],
        }, {
            type: 'way',
            id: 411,
            tags: { 'building:part': 'yes', 'building:levels': '3', name: '楼体 A' },
            geometry: [
                { lon: 119.999972, lat: 29.999972 },
                { lon: 120.000002, lat: 29.999972 },
                { lon: 120.000002, lat: 30.000028 },
                { lon: 119.999972, lat: 30.000028 },
                { lon: 119.999972, lat: 29.999972 },
            ],
        }, {
            type: 'way',
            id: 412,
            tags: { 'building:part': 'yes', 'building:levels': '5', name: '楼体 B' },
            geometry: [
                { lon: 120.000004, lat: 29.999972 },
                { lon: 120.000028, lat: 29.999972 },
                { lon: 120.000028, lat: 30.000028 },
                { lon: 120.000004, lat: 30.000028 },
                { lon: 120.000004, lat: 29.999972 },
            ],
        }],
    }, focusZone);

    assert.equal(buildings.length, 2);
    assert.deepEqual(buildings.map((building) => building.osmId).sort((left, right) => left - right), [411, 412]);
    assert.ok(buildings.every((building) => building.renderKind === 'building-part'));
});

test('OSM normalization rejects oversized footprints', () => {
    const buildings = normalizeOverpassBuildings({
        elements: [{
            type: 'way',
            id: 301,
            tags: { building: 'yes', name: '异常超大建筑' },
            geometry: [
                { lon: 119.998, lat: 29.998 },
                { lon: 120.002, lat: 29.998 },
                { lon: 120.002, lat: 30.002 },
                { lon: 119.998, lat: 30.002 },
                { lon: 119.998, lat: 29.998 },
            ],
        }, {
            type: 'way',
            id: 302,
            tags: { building: 'yes', name: '正常建筑' },
            geometry: [
                { lon: 119.99999, lat: 29.99999 },
                { lon: 120.00001, lat: 29.99999 },
                { lon: 120.00001, lat: 30.00001 },
                { lon: 119.99999, lat: 30.00001 },
                { lon: 119.99999, lat: 29.99999 },
            ],
        }],
    }, focusZone);

    assert.equal(buildings.length, 1);
    assert.equal(buildings[0].osmId, 302);
});

test('OSM normalization reports diagnostic counts for filtered buildings', () => {
    const { buildings, diagnostics } = normalizeOverpassBuildingsWithDiagnostics({
        elements: [{
            type: 'way',
            id: 701,
            tags: { building: 'yes', name: '异常超大建筑' },
            geometry: [
                { lon: 119.998, lat: 29.998 },
                { lon: 120.002, lat: 29.998 },
                { lon: 120.002, lat: 30.002 },
                { lon: 119.998, lat: 30.002 },
                { lon: 119.998, lat: 29.998 },
            ],
        }, {
            type: 'way',
            id: 702,
            tags: { building: 'yes', name: '正常建筑' },
            geometry: [
                { lon: 119.99999, lat: 29.99999 },
                { lon: 120.00001, lat: 29.99999 },
                { lon: 120.00001, lat: 30.00001 },
                { lon: 119.99999, lat: 30.00001 },
                { lon: 119.99999, lat: 29.99999 },
            ],
        }],
    }, focusZone);

    assert.equal(buildings.length, 1);
    assert.equal(diagnostics.rawElementCount, 2);
    assert.equal(diagnostics.renderableElementCount, 2);
    assert.equal(diagnostics.filters.majorTooLong, 1);
    assert.equal(diagnostics.returnedCount, 1);
    assert.equal(diagnostics.samples[0].reason, 'majorTooLong');
});

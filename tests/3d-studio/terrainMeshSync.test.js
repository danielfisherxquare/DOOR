import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTerrainPatchForZone, terrainPatchToTerrainMesh } from '../../server/src/modules/inventory/inventory.spatial.terrain.service.js';

test('terrain patch can be sampled from public DEM service shape via backend helper', async () => {
    const zone = {
        id: 'zone-1',
        terrainResolution: 2,
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

    const fetchCalls = [];
    const terrainPatch = await buildTerrainPatchForZone(zone, {}, async (_url, request) => {
        const body = JSON.parse(String(request?.body || '{}'));
        const points = String(body.locations || '').split('|').filter(Boolean);
        fetchCalls.push(points.length);
        return {
            ok: true,
            async json() {
                return {
                    status: 'OK',
                    results: points.map((_point, index) => ({
                        elevation: 500 + index,
                    })),
                };
            },
        };
    });

    assert.equal(terrainPatch.kind, 'terrain-grid-patch');
    assert.equal(terrainPatch.source, 'opentopodata-srtm90m');
    assert.equal(terrainPatch.rows * terrainPatch.cols, terrainPatch.heightsRelative.length);
    assert.ok(fetchCalls.length >= 1);
});

test('terrain patch converts into indexed terrain mesh', () => {
    const mesh = terrainPatchToTerrainMesh({
        sampledAt: '2026-04-18T10:00:00.000Z',
        rows: 3,
        cols: 3,
        resolutionMeters: 2,
        boundsMeters: {
            minX: -2,
            maxX: 2,
            minZ: -2,
            maxZ: 2,
            width: 4,
            depth: 4,
        },
        heightsRelative: [
            0, 1, 0,
            1, 2, 1,
            0, 1, 0,
        ],
        cellMask: [1, 1, 1, 1],
        elevationOffsetMeters: 16,
    });

    assert.equal(mesh.kind, 'terrain-grid');
    assert.equal(mesh.vertices.length, 27);
    assert.equal(mesh.indices.length, 24);
    assert.equal(mesh.metadata.rows, 3);
    assert.equal(mesh.metadata.cols, 3);
});

test('terrain patch conversion skips masked cells', () => {
    const mesh = terrainPatchToTerrainMesh({
        rows: 3,
        cols: 3,
        boundsMeters: {
            minX: 0,
            maxX: 2,
            minZ: 0,
            maxZ: 2,
            width: 2,
            depth: 2,
        },
        heightsRelative: [
            0, 0, 0,
            0, 0, 0,
            0, 0, 0,
        ],
        cellMask: [1, 0, 0, 0],
    });

    assert.equal(mesh.indices.length, 6);
});

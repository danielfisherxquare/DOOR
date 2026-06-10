import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFocusZoneStudioScene } from '../../src/utils/map/focusZoneStudioScene.js';
import { buildGeometryPreflight } from '../../src/utils/exportManifest.js';
import { buildGeometryBatchFromStudioScene } from '../../server/src/modules/inventory/inventory.spatial.studio-export.js';
import { buildGlbFromBatchFile } from '../../server/src/modules/inventory/inventory.spatial.export.js';

const focusZone = {
    id: 'zone-1',
    projectId: 'project-1',
    name: '测试固定区域',
    zoneType: 'focus-zone',
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
    snapshotJson: {
        terrainPatch: {
            sampledAt: '2026-04-18T10:00:00.000Z',
            boundsMeters: { minX: -5, maxX: 5, minZ: -5, maxZ: 5, width: 10, depth: 10 },
            resolutionMeters: 2,
            rows: 2,
            cols: 2,
            heightsRelative: [0, 0, 0, 0],
            cellMask: [1],
        },
        osmBuildings: {
            buildings: [{
                id: 'osm-101',
                osmId: 101,
                osmType: 'way',
                renderKind: 'building-outline',
                isBuildingPart: false,
                name: 'OSM 测试楼',
                buildingType: 'yes',
                heightMeters: 12.8,
                minHeightMeters: 0,
                footprintWgs84: {
                    type: 'Polygon',
                    coordinates: [[
                        [119.99998, 29.99998],
                        [120.00002, 29.99998],
                        [120.00002, 30.00002],
                        [119.99998, 30.00002],
                        [119.99998, 29.99998],
                    ]],
                },
            }],
        },
    },
};

test('generated scene package can build studio scene, geometry batch and glb', () => {
    const studioScene = buildFocusZoneStudioScene({ focusZone, objects: [] });
    const geometryBatch = buildGeometryBatchFromStudioScene({
        zone: {
            ...focusZone,
            snapshotJson: {
                ...focusZone.snapshotJson,
                warehouseScene: studioScene,
            },
        },
        warehouseScene: studioScene,
        resource: { id: 'generated-scene-zone-1' },
    });
    const glbBuffer = buildGlbFromBatchFile(geometryBatch);

    assert.equal(studioScene.sceneType, 'focus-zone-studio-scene');
    assert.ok(geometryBatch.meshes.length >= 2);
    assert.ok(glbBuffer.length > 20);
    assert.equal(glbBuffer.readUInt32LE(0), 0x46546c67);
    assert.equal(geometryBatch.metadata.preflight.status, 'ok');
    assert.equal(geometryBatch.metadata.preflight.meshCount, geometryBatch.stats.meshCount);
    assert.equal(geometryBatch.metadata.export.diagnostics.geometry.status, 'ok');
});

test('geometry preflight reports invalid indices before GLB export', () => {
    const preflight = buildGeometryPreflight([
        {
            id: 'bad-mesh',
            vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
            indices: [0, 1, 4],
        },
    ]);

    assert.equal(preflight.status, 'error');
    assert.equal(preflight.meshCount, 1);
    assert.equal(preflight.invalidMeshCount, 1);
    assert.equal(preflight.meshes[0].invalidIndexCount, 1);
    assert.ok(preflight.meshes[0].warnings.includes('mesh-index-out-of-range'));
});

test('GLB builder rejects geometry that fails preflight', () => {
    assert.throws(() => buildGlbFromBatchFile({
        meshes: [{
            id: 'bad-glb-mesh',
            color: '#ffffff',
            vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
            indices: [0, 1, 4],
        }],
    }), /geometry preflight failed/i);
});

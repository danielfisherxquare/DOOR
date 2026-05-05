import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFocusZoneStudioScene } from '../../src/utils/map/focusZoneStudioScene.js';
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
});

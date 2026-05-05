import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFocusZoneStudioScene } from '../../src/utils/map/focusZoneStudioScene.js';
import { buildGeneratedSceneStudioSnapshot } from '../../server/src/modules/inventory/inventory.spatial.generated-scene.service.js';

const focusZone = {
    id: 'zone-import-1',
    projectId: 'project-import-1',
    name: '导入测试区域',
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
            sampledAt: '2026-04-19T10:00:00.000Z',
            boundsMeters: { minX: -6, maxX: 6, minZ: -4, maxZ: 4, width: 12, depth: 8 },
            resolutionMeters: 2,
            rows: 2,
            cols: 2,
            heightsRelative: [0, 0.3, 0.1, 0.2],
            cellMask: [1],
        },
        osmBuildings: {
            buildings: [{
                id: 'osm-import-101',
                osmId: 101,
                osmType: 'way',
                renderKind: 'building-outline',
                isBuildingPart: false,
                name: 'OSM 导入测试楼',
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

test('generated scene can be converted into a valid outdoor-event studio snapshot', () => {
    const studioScene = buildFocusZoneStudioScene({ focusZone, objects: [] });
    const snapshot = buildGeneratedSceneStudioSnapshot(studioScene, {
        projectName: 'GIS Test Site',
        geoAnchor: focusZone.originWgs84,
    });

    assert.equal(snapshot.sceneType, 'outdoor-event');
    assert.equal(snapshot.projectType, 'site');
    assert.equal(snapshot.site?.name, 'GIS Test Site');
    assert.deepEqual(snapshot.site?.geoAnchor, focusZone.originWgs84);
    assert.equal(snapshot.buildings.length, 1);
    assert.equal(snapshot.warehouses.length, 1);
    assert.equal(snapshot.editorState.activeWarehouseId, snapshot.warehouses[0].id);
    assert.equal(snapshot.editorState.activeWorkspaceMode, 'warehouse');
    assert.ok(snapshot.editorState.legacyScene?.editorDocument);
    assert.ok((snapshot.editorState.legacyScene?.editorDocument?.terrainMeshes || []).length >= 1);
    assert.ok((snapshot.editorState.legacyScene?.editorDocument?.solids || []).length >= 1);
    assert.equal(snapshot.editorState.legacyScene?.metadata?.importedFrom, 'generated-scene');
    assert.equal(snapshot.editorState.legacyScene?.editorDocument?.metadata?.source, 'gis-focus-zone');
});

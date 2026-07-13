import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildSiteProviderStatus,
    getProjectSiteMode,
    polygonToSiteBbox,
    saveProjectFocusZoneWorkbench,
    saveProjectSiteMode,
} from '../src/modules/inventory/inventory.spatial.site-mode.service.js';
import {
    createBlankStudioScene,
    getStudioHierarchy,
    normalizeStudioSnapshot,
} from '../src/modules/inventory/inventory.studio.snapshot.js';
import { createEmptyEditorDocument } from '../../src/3d-studio/model/editorDocument.js';

const BBOX = { west: 104.06, south: 30.645, east: 104.074, north: 30.656 };
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const FOCUS_ZONE_ID = '22222222-2222-4222-8222-222222222222';

function directScene(name) {
    return {
        id: `scene-${name}`,
        sceneType: 'outdoor-event',
        warehouse: {
            id: 'site-mode-warehouse',
            name,
            dimensions_mm: { width_mm: 80000, depth_mm: 60000, height_mm: 12000 },
        },
        activeLevelId: 'ground',
        editorDocument: {
            ...createEmptyEditorDocument(),
            metadata: { testScene: name },
        },
    };
}

function createInMemoryDependencies() {
    const initialSnapshot = normalizeStudioSnapshot(directScene('初始'), {
        sceneType: 'outdoor-event',
        projectType: 'site',
        name: '阶段0场地',
    });
    const state = {
        project: {
            id: PROJECT_ID,
            orgId: 'org-test',
            name: '阶段0场地',
            sceneType: 'outdoor-event',
            projectType: 'site',
            geoAnchor: null,
            snapshotJson: initialSnapshot,
            revision: 1,
            updatedAt: '2026-07-13T00:00:00.000Z',
        },
        zone: {
            id: FOCUS_ZONE_ID,
            projectId: PROJECT_ID,
            name: '阶段0 focus zone',
            clipPolygonWgs84: {
                type: 'Polygon',
                coordinates: [[
                    [BBOX.west, BBOX.north],
                    [BBOX.east, BBOX.north],
                    [BBOX.east, BBOX.south],
                    [BBOX.west, BBOX.south],
                    [BBOX.west, BBOX.north],
                ]],
            },
            originWgs84: { longitude: 104.067, latitude: 30.6505, height: 0 },
            snapshotJson: {
                siteBake: {
                    status: 'ready',
                    providerStatus: {},
                    warnings: [],
                },
            },
            metadata: { purpose: 'site-mode' },
            status: 'ready',
        },
    };

    const studioRepo = {
        async getProjectById(_scope, projectId) {
            return state.project.id === projectId ? structuredClone(state.project) : null;
        },
        async getProjectByIdForUpdate(_scope, projectId, trx) {
            return trx.project.id === projectId ? structuredClone(trx.project) : null;
        },
        async updateProject(_scope, projectId, data, { expectedRevision, db }) {
            if (db.project.id !== projectId || db.project.revision !== expectedRevision) return null;
            db.project = {
                ...db.project,
                ...structuredClone(data),
                revision: db.project.revision + 1,
                updatedAt: '2026-07-13T00:01:00.000Z',
            };
            return structuredClone(db.project);
        },
    };
    const spatialRepo = {
        async getTerrainWorkZoneById(_scope, focusZoneId) {
            return state.zone.id === focusZoneId ? structuredClone(state.zone) : null;
        },
        async getTerrainWorkZoneByIdForUpdate(_scope, focusZoneId, trx) {
            return trx.zone.id === focusZoneId ? structuredClone(trx.zone) : null;
        },
        async findSiteModeTerrainWorkZone(_scope, projectId, lookup, db = state) {
            const zone = db.zone;
            if (!zone || zone.projectId !== projectId) return null;
            const matchesMutation = lookup.clientMutationId
                && zone.snapshotJson?.siteBake?.clientMutationId === lookup.clientMutationId;
            const matchesSource = lookup.sourceNodeId
                && zone.metadata?.sourceNodeId === lookup.sourceNodeId;
            return matchesMutation || matchesSource ? structuredClone(zone) : null;
        },
        async findAnySiteModeTerrainWorkZone(_scope, projectId, db = state) {
            const zone = db.zone;
            if (!zone || zone.projectId !== projectId) return null;
            const isSiteMode = zone.metadata?.purpose === 'site-mode'
                || Boolean(zone.snapshotJson?.siteBake);
            return isSiteMode ? structuredClone(zone) : null;
        },
        async updateTerrainWorkZone(_scope, focusZoneId, data, trx) {
            if (trx.zone.id !== focusZoneId) return null;
            trx.zone = { ...trx.zone, ...structuredClone(data) };
            return structuredClone(trx.zone);
        },
        async createTerrainWorkZone(data, trx) {
            trx.zone = { id: FOCUS_ZONE_ID, ...structuredClone(data) };
            return structuredClone(trx.zone);
        },
    };
    const runTransaction = async (handler) => {
        const draft = structuredClone(state);
        const result = await handler(draft);
        state.project = draft.project;
        state.zone = draft.zone;
        return result;
    };

    return { state, studioRepo, spatialRepo, runTransaction };
}

describe('project-bound site mode helpers', () => {
    it('derives the bake bbox from the persisted focus-zone polygon', () => {
        const polygon = {
            type: 'Polygon',
            coordinates: [[
                [BBOX.west, BBOX.north],
                [BBOX.east, BBOX.north],
                [BBOX.east, BBOX.south],
                [BBOX.west, BBOX.south],
                [BBOX.west, BBOX.north],
            ]],
        };

        assert.deepEqual(polygonToSiteBbox(polygon), BBOX);
    });

    it('rejects an invalid or oversized persisted polygon', () => {
        assert.equal(polygonToSiteBbox({ type: 'Polygon', coordinates: [[]] }), null);
        assert.equal(polygonToSiteBbox({
            type: 'Polygon',
            coordinates: [[[104, 30], [105, 30], [105, 31], [104, 30]]],
        }), null);
    });

    it('reports each provider independently without claiming offline imagery', () => {
        const status = buildSiteProviderStatus({
            orthophoto: {
                provider: 'esri_world_imagery',
                tiles: [{ z: 16, x: 1, y: 1 }, { z: 16, x: 1, y: 2 }],
            },
            snapshotJson: {
                terrainPatch: { source: 'opentopodata-srtm90m' },
                osmBuildings: { source: 'overpass-api', count: 3, buildings: [{}, {}, {}] },
            },
        }, []);

        assert.deepEqual(status.imagery, {
            provider: 'esri_world_imagery',
            status: 'ready',
            itemCount: 2,
            message: '在线瓦片清单已生成；尚未形成离线影像包',
            retryable: false,
        });
        assert.equal(status.terrain.status, 'ready');
        assert.equal(status.buildings.status, 'ready');
        assert.equal(status.buildings.itemCount, 3);
    });

    it('surfaces terrain and OSM failures instead of returning a false ready state', () => {
        const status = buildSiteProviderStatus({
            orthophoto: { provider: 'esri_world_imagery', tiles: [] },
            snapshotJson: {
                terrainPatch: null,
                osmBuildings: { source: 'none', count: 0, buildings: [] },
            },
        }, ['地形采样失败：timeout', 'OSM 建筑获取失败：aborted']);

        assert.equal(status.imagery.status, 'ready');
        assert.equal(status.terrain.status, 'failed');
        assert.equal(status.terrain.retryable, true);
        assert.equal(status.buildings.status, 'failed');
        assert.equal(status.buildings.retryable, true);
    });

    it('loads the project revision and focus-zone scene under the same transaction locks', async () => {
        const dependencies = createInMemoryDependencies();
        dependencies.state.zone.snapshotJson.warehouseScene = directScene('一致读取');
        let projectTransaction = null;
        let zoneTransaction = null;
        const originalGetProject = dependencies.studioRepo.getProjectByIdForUpdate;
        const originalGetZone = dependencies.spatialRepo.getTerrainWorkZoneByIdForUpdate;
        dependencies.studioRepo.getProjectByIdForUpdate = async (...args) => {
            projectTransaction = args[2];
            return originalGetProject(...args);
        };
        dependencies.spatialRepo.getTerrainWorkZoneByIdForUpdate = async (...args) => {
            zoneTransaction = args[2];
            return originalGetZone(...args);
        };

        const result = await getProjectSiteMode(
            { orgId: 'org-test', ownerUserId: 'user-test' },
            PROJECT_ID,
            FOCUS_ZONE_ID,
            dependencies,
        );

        assert.ok(projectTransaction);
        assert.strictEqual(projectTransaction, zoneTransaction);
        assert.equal(result.project.revision, result.revision);
        assert.equal(
            result.sceneSnapshot.editorDocument.metadata.testScene,
            '一致读取',
        );
        assert.equal(result.focusZone.projectId, result.project.id);
    });

    it('atomically updates the project snapshot, focus zone scene, and revision', async () => {
        const dependencies = createInMemoryDependencies();
        const warehouseId = dependencies.state.project.snapshotJson.warehouses[0].id;
        const result = await saveProjectSiteMode(
            { orgId: 'org-test', ownerUserId: 'user-test' },
            'user-test',
            PROJECT_ID,
            {
                focusZoneId: FOCUS_ZONE_ID,
                warehouseId,
                snapshotJson: directScene('已保存'),
                expectedRevision: 1,
                clientMutationId: 'unit-save-1',
            },
            dependencies,
        );

        assert.equal(result.revision, 2);
        assert.equal(dependencies.state.project.revision, 2);
        assert.equal(
            dependencies.state.project.snapshotJson.warehouses[0].sceneSnapshot.editorDocument.metadata.testScene,
            '已保存',
        );
        assert.equal(
            dependencies.state.zone.snapshotJson.warehouseScene.editorDocument.metadata.testScene,
            '已保存',
        );
    });

    it('atomically saves an ordinary focus-zone workbench without converting it to site-mode', async () => {
        const dependencies = createInMemoryDependencies();
        dependencies.state.zone.metadata = { purpose: 'terrain-workbench' };
        delete dependencies.state.zone.snapshotJson.siteBake;

        const result = await saveProjectFocusZoneWorkbench(
            { orgId: 'org-test', ownerUserId: 'user-test' },
            'user-test',
            PROJECT_ID,
            {
                focusZoneId: FOCUS_ZONE_ID,
                snapshotJson: directScene('普通重点区保存'),
                expectedRevision: 1,
                clientMutationId: 'unit-focus-workbench-save',
            },
            dependencies,
        );

        assert.equal(result.revision, 2);
        assert.equal(dependencies.state.zone.metadata.purpose, 'terrain-workbench');
        assert.equal(
            dependencies.state.zone.snapshotJson.focusZoneWorkbench.clientMutationId,
            'unit-focus-workbench-save',
        );
        assert.equal(dependencies.state.zone.snapshotJson.siteMode, undefined);
    });

    it('persists a project-bound bake, advances revision, and preserves the edited scene', async () => {
        const dependencies = createInMemoryDependencies();
        dependencies.state.project.snapshotJson = createBlankStudioScene({
            sceneType: 'outdoor-event',
            projectType: 'site',
            name: '阶段0场地',
        });
        const originalScene = directScene('保留的编辑场景');
        dependencies.state.zone.snapshotJson.warehouseScene = originalScene;
        const rebakedOrigin = { longitude: 104.069, latitude: 30.653, height: 0 };
        dependencies.bakeSiteScene = async (bbox) => ({
            focusZone: {
                id: FOCUS_ZONE_ID,
                name: '阶段0 focus zone',
                clipPolygonWgs84: dependencies.state.zone.clipPolygonWgs84,
                originWgs84: rebakedOrigin,
                terrainResolution: 2,
                snapshotJson: {
                    terrainPatch: { source: 'opentopodata-srtm90m', rows: 2, cols: 2 },
                    osmBuildings: { source: 'overpass-api', count: 1, buildings: [{}] },
                },
                orthophoto: {
                    provider: 'esri_world_imagery',
                    requestedBbox: bbox,
                    tiles: [{ z: 16, x: 1, y: 1 }],
                },
            },
            warnings: [],
        });

        const { bakeProjectSite } = await import(
            '../src/modules/inventory/inventory.spatial.site-mode.service.js'
        );
        const result = await bakeProjectSite(
            { orgId: 'org-test', ownerUserId: 'user-test' },
            'user-test',
            PROJECT_ID,
            {
                focusZoneId: FOCUS_ZONE_ID,
                expectedRevision: 1,
                clientMutationId: 'unit-bake-1',
            },
            globalThis.fetch,
            dependencies,
        );

        assert.equal(result.revision, 2);
        assert.equal(result.bakeStatus, 'ready');
        assert.equal(result.providerStatus.imagery.itemCount, 1);
        assert.equal(dependencies.state.project.revision, 2);
        assert.equal(
            dependencies.state.zone.snapshotJson.warehouseScene.editorDocument.metadata.testScene,
            '保留的编辑场景',
        );
        assert.equal(dependencies.state.zone.snapshotJson.siteBake.status, 'ready');
        assert.equal(dependencies.state.zone.snapshotJson.orthophoto.provider, 'esri_world_imagery');
        assert.deepEqual(dependencies.state.zone.originWgs84, rebakedOrigin);
        assert.deepEqual(dependencies.state.project.geoAnchor, rebakedOrigin);
        assert.deepEqual(dependencies.state.project.snapshotJson.site.geoAnchor, rebakedOrigin);
        assert.ok(
            getStudioHierarchy(dependencies.state.project.snapshotJson).activeWarehouse,
            'project-bound bake must repair an empty site project with an editable warehouse',
        );

        const firstSave = await saveProjectSiteMode(
            { orgId: 'org-test', ownerUserId: 'user-test' },
            'user-test',
            PROJECT_ID,
            {
                focusZoneId: FOCUS_ZONE_ID,
                snapshotJson: directScene('首次自动保存'),
                expectedRevision: 2,
                clientMutationId: 'unit-first-save-after-bake',
            },
            dependencies,
        );
        assert.equal(firstSave.revision, 3);
        assert.equal(
            dependencies.state.zone.snapshotJson.warehouseScene.editorDocument.metadata.testScene,
            '首次自动保存',
        );
    });

    it('creates the focus zone and bake snapshot in the same project revision transaction', async () => {
        const dependencies = createInMemoryDependencies();
        dependencies.state.zone = null;
        let bakeCallCount = 0;
        const requestedBbox = {
            west: 104.08,
            south: 30.66,
            east: 104.09,
            north: 30.67,
        };
        const requestedPolygon = {
            type: 'Polygon',
            coordinates: [[
                [requestedBbox.west, requestedBbox.north],
                [requestedBbox.east, requestedBbox.north],
                [requestedBbox.east, requestedBbox.south],
                [requestedBbox.west, requestedBbox.south],
                [requestedBbox.west, requestedBbox.north],
            ]],
        };
        dependencies.bakeSiteScene = async (bbox, options) => {
            bakeCallCount += 1;
            return ({
            focusZone: {
                id: FOCUS_ZONE_ID,
                name: options.name,
                clipPolygonWgs84: requestedPolygon,
                originWgs84: { longitude: 104.085, latitude: 30.665, height: 0 },
                terrainResolution: options.terrainResolution,
                snapshotJson: {
                    terrainPatch: { source: 'opentopodata-srtm90m', rows: 2, cols: 2 },
                    osmBuildings: { source: 'overpass-api', count: 1, buildings: [{}] },
                },
                orthophoto: {
                    provider: 'esri_world_imagery',
                    requestedBbox: bbox,
                    tiles: [{ z: 16, x: 1, y: 1 }],
                },
            },
            warnings: [],
            });
        };

        const { bakeProjectSite } = await import(
            '../src/modules/inventory/inventory.spatial.site-mode.service.js'
        );
        const result = await bakeProjectSite(
            { orgId: 'org-test', ownerUserId: 'user-test' },
            'user-test',
            PROJECT_ID,
            {
                expectedRevision: 1,
                clientMutationId: 'unit-atomic-zone-create',
                focusZone: {
                    name: '原子创建重点区',
                    clipPolygonWgs84: requestedPolygon,
                    terrainResolution: 4,
                    includedObjectIds: ['object-1'],
                    publishTarget: { mode: 'focus-zone' },
                    metadata: {
                        source: 'map-feature-panel',
                        sourceNodeId: 'map-node-first-bake',
                    },
                },
            },
            globalThis.fetch,
            dependencies,
        );

        assert.equal(result.revision, 2);
        assert.equal(result.focusZone.id, FOCUS_ZONE_ID);
        assert.equal(dependencies.state.zone.projectId, PROJECT_ID);
        assert.equal(dependencies.state.zone.name, '原子创建重点区');
        assert.deepEqual(dependencies.state.zone.clipPolygonWgs84, requestedPolygon);
        assert.deepEqual(dependencies.state.zone.includedObjectIds, ['object-1']);
        assert.equal(dependencies.state.zone.snapshotJson.siteBake.status, 'ready');

        const retried = await bakeProjectSite(
            { orgId: 'org-test', ownerUserId: 'user-test' },
            'user-test',
            PROJECT_ID,
            {
                expectedRevision: 1,
                clientMutationId: 'unit-atomic-zone-create',
                focusZone: {
                    name: '原子创建重点区',
                    clipPolygonWgs84: requestedPolygon,
                    metadata: { sourceNodeId: 'map-node-first-bake' },
                },
            },
            globalThis.fetch,
            dependencies,
        );
        assert.equal(retried.focusZone.id, result.focusZone.id);
        assert.equal(retried.revision, 2);
        assert.equal(bakeCallCount, 1, 'a lost first response must not trigger another upstream bake');

        const manuallyRetried = await bakeProjectSite(
            { orgId: 'org-test', ownerUserId: 'user-test' },
            'user-test',
            PROJECT_ID,
            {
                expectedRevision: 2,
                clientMutationId: 'unit-manual-retry-new-id',
                focusZone: {
                    name: '原子创建重点区',
                    clipPolygonWgs84: requestedPolygon,
                    metadata: { sourceNodeId: 'map-node-first-bake' },
                },
            },
            globalThis.fetch,
            dependencies,
        );
        assert.equal(manuallyRetried.focusZone.id, result.focusZone.id);
        assert.equal(manuallyRetried.revision, 3);
        assert.equal(bakeCallCount, 2);
    });

    it('rejects a second site-mode zone with a different source before calling providers', async () => {
        const dependencies = createInMemoryDependencies();
        dependencies.state.zone.metadata.sourceNodeId = 'map-node-existing';
        dependencies.state.zone.snapshotJson.siteBake.clientMutationId = 'existing-bake';
        let bakeCallCount = 0;
        dependencies.bakeSiteScene = async () => {
            bakeCallCount += 1;
            throw new Error('provider should not be called');
        };

        const { bakeProjectSite } = await import(
            '../src/modules/inventory/inventory.spatial.site-mode.service.js'
        );
        await assert.rejects(
            bakeProjectSite(
                { orgId: 'org-test', ownerUserId: 'user-test' },
                'user-test',
                PROJECT_ID,
                {
                    expectedRevision: 1,
                    clientMutationId: 'different-bake',
                    focusZone: {
                        name: '第二个场地',
                        clipPolygonWgs84: dependencies.state.zone.clipPolygonWgs84,
                        metadata: { sourceNodeId: 'map-node-different' },
                    },
                },
                globalThis.fetch,
                dependencies,
            ),
            (error) => error.statusCode === 409 && error.publicCode === 'SITE_MODE_ZONE_CONFLICT',
        );

        assert.equal(bakeCallCount, 0);
        assert.equal(dependencies.state.project.revision, 1);
        assert.equal(dependencies.state.zone.metadata.sourceNodeId, 'map-node-existing');
    });

    it('does not mutate the focus zone when the project revision changes during bake', async () => {
        const dependencies = createInMemoryDependencies();
        const originalZone = structuredClone(dependencies.state.zone);
        dependencies.bakeSiteScene = async (bbox) => ({
            focusZone: {
                id: FOCUS_ZONE_ID,
                name: '并发重点区',
                clipPolygonWgs84: dependencies.state.zone.clipPolygonWgs84,
                originWgs84: { longitude: 104.067, latitude: 30.6505, height: 0 },
                terrainResolution: 2,
                snapshotJson: {
                    terrainPatch: { source: 'opentopodata-srtm90m' },
                    osmBuildings: { source: 'overpass-api', count: 1, buildings: [{}] },
                },
                orthophoto: {
                    provider: 'esri_world_imagery',
                    requestedBbox: bbox,
                    tiles: [{ z: 16, x: 1, y: 1 }],
                },
            },
            warnings: [],
        });
        dependencies.runTransaction = async (handler) => {
            // Simulate another window committing after the preflight read and network bake.
            dependencies.state.project.revision = 2;
            dependencies.state.project.updatedAt = '2026-07-13T00:02:00.000Z';
            const draft = structuredClone(dependencies.state);
            const result = await handler(draft);
            dependencies.state.project = draft.project;
            dependencies.state.zone = draft.zone;
            return result;
        };

        const { bakeProjectSite } = await import(
            '../src/modules/inventory/inventory.spatial.site-mode.service.js'
        );
        await assert.rejects(
            bakeProjectSite(
                { orgId: 'org-test', ownerUserId: 'user-test' },
                'user-test',
                PROJECT_ID,
                {
                    focusZoneId: FOCUS_ZONE_ID,
                    expectedRevision: 1,
                    clientMutationId: 'unit-raced-bake',
                    focusZone: {
                        name: '并发重点区',
                        clipPolygonWgs84: dependencies.state.zone.clipPolygonWgs84,
                    },
                },
                globalThis.fetch,
                dependencies,
            ),
            (error) => error.statusCode === 409 && error.publicCode === 'REVISION_CONFLICT',
        );

        assert.equal(dependencies.state.project.revision, 2);
        assert.deepEqual(dependencies.state.zone, originalZone);
    });

    it('returns a safe stale-revision conflict and commits neither row', async () => {
        const dependencies = createInMemoryDependencies();
        const warehouseId = dependencies.state.project.snapshotJson.warehouses[0].id;
        const before = structuredClone(dependencies.state);

        await assert.rejects(
            saveProjectSiteMode(
                { orgId: 'org-test', ownerUserId: 'user-test' },
                'user-test',
                PROJECT_ID,
                {
                    focusZoneId: FOCUS_ZONE_ID,
                    warehouseId,
                    snapshotJson: directScene('过期写入'),
                    expectedRevision: 2,
                    clientMutationId: 'unit-stale-1',
                },
                dependencies,
            ),
            (error) => {
                assert.equal(error.statusCode, 409);
                assert.equal(error.publicCode, 'REVISION_CONFLICT');
                assert.deepEqual(error.data, {
                    projectId: PROJECT_ID,
                    expectedRevision: 2,
                    currentRevision: 1,
                    currentProjectUpdatedAt: '2026-07-13T00:00:00.000Z',
                });
                return true;
            },
        );

        assert.deepEqual(dependencies.state, before);
    });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    assertGenericProjectSnapshotMutationAllowed,
    updateProjectWithSnapshot,
    updateStudioProject,
    updateStudioProjectSnapshot,
} from '../src/modules/inventory/inventory.studio.service.js';

function projectAtRevision(revision, snapshotJson) {
    return {
        id: '11111111-1111-4111-8111-111111111111',
        orgId: 'org-test',
        ownerUserId: 'user-test',
        name: 'CAS 回归项目',
        sceneType: 'outdoor-event',
        projectType: 'site',
        status: 'draft',
        geoAnchor: null,
        snapshotJson,
        sourceType: 'blank',
        sourceWarehouseId: null,
        sourceOrgId: 'org-test',
        primaryAssetId: null,
        thumbnailDataUrl: null,
        revision,
    };
}

describe('inventory studio snapshot revision CAS', () => {
    it('rejects generic snapshot writers once the project is bound to site mode', async () => {
        await assert.rejects(
            assertGenericProjectSnapshotMutationAllowed(
                { orgId: 'org-test', ownerUserId: 'user-test' },
                '11111111-1111-4111-8111-111111111111',
                {
                    async findAnySiteModeTerrainWorkZone() {
                        return {
                            id: '22222222-2222-4222-8222-222222222222',
                            projectId: '11111111-1111-4111-8111-111111111111',
                        };
                    },
                },
            ),
            (error) => {
                assert.equal(error.statusCode, 409);
                assert.equal(error.publicCode, 'PROJECT_BINDING_REQUIRED');
                assert.deepEqual(error.data, {
                    projectId: '11111111-1111-4111-8111-111111111111',
                    focusZoneId: '22222222-2222-4222-8222-222222222222',
                });
                return true;
            },
        );
    });

    it('requires expectedRevision on the generic project snapshot writer', async () => {
        await assert.rejects(
            updateStudioProject(
                { orgId: 'org-test', ownerUserId: 'user-test' },
                'user-test',
                '11111111-1111-4111-8111-111111111111',
                { snapshotJson: { marker: 'unsafe-write' } },
            ),
            (error) => error.statusCode === 400 && error.publicCode === 'REVISION_REQUIRED',
        );
    });

    it('requires expectedRevision on the dedicated snapshot writer before reading the project', async () => {
        await assert.rejects(
            updateStudioProjectSnapshot(
                { orgId: 'org-test', ownerUserId: 'user-test' },
                'user-test',
                '11111111-1111-4111-8111-111111111111',
                { marker: 'unsafe-write' },
            ),
            (error) => error.statusCode === 400 && error.publicCode === 'REVISION_REQUIRED',
        );
    });

    it('metadata-only updates do not replay stale snapshot or geospatial fields', async () => {
        const current = {
            ...projectAtRevision(3, { marker: 'current-scene' }),
            geoAnchor: { longitude: 104.1, latitude: 30.6, height: 0 },
        };
        let capturedPayload = null;

        const updated = await updateStudioProject(
            { orgId: 'org-test', ownerUserId: 'user-test' },
            'user-test',
            current.id,
            { primaryAssetId: 'asset-1' },
            {
                studioRepo: {
                    async getProjectById() {
                        return structuredClone(current);
                    },
                    async updateProject(_scope, _projectId, data) {
                        capturedPayload = data;
                        return { ...structuredClone(current), primaryAssetId: data.primaryAssetId, revision: 4 };
                    },
                },
                spatialRepo: {
                    async findAnySiteModeTerrainWorkZone() {
                        throw new Error('metadata-only update must not query the site snapshot guard');
                    },
                },
            },
        );

        assert.equal(updated.primaryAssetId, 'asset-1');
        assert.equal(capturedPayload.primaryAssetId, 'asset-1');
        assert.equal(capturedPayload.snapshotJson, undefined);
        assert.equal(capturedPayload.geoAnchor, undefined);
        assert.equal(capturedPayload.name, undefined);
    });

    it('replays a committed generic snapshot mutation without advancing revision twice', async () => {
        const state = {
            project: projectAtRevision(1, { marker: 'before-save' }),
            updateCalls: 0,
        };
        const dependencies = {
            studioRepo: {
                async getProjectById() {
                    return structuredClone(state.project);
                },
                async updateProject(_scope, _projectId, data, { expectedRevision }) {
                    if (state.project.revision !== expectedRevision) return null;
                    state.updateCalls += 1;
                    state.project = {
                        ...state.project,
                        ...structuredClone(data),
                        revision: state.project.revision + 1,
                    };
                    return structuredClone(state.project);
                },
            },
            spatialRepo: {
                async findAnySiteModeTerrainWorkZone() {
                    return null;
                },
            },
        };
        const requestData = {
            snapshotJson: { marker: 'committed-save' },
            expectedRevision: 1,
            clientMutationId: 'generic-response-loss-1',
        };

        const committed = await updateStudioProject(
            { orgId: 'org-test', ownerUserId: 'user-test' },
            'user-test',
            state.project.id,
            requestData,
            dependencies,
        );
        const replayed = await updateStudioProject(
            { orgId: 'org-test', ownerUserId: 'user-test' },
            'user-test',
            state.project.id,
            requestData,
            dependencies,
        );

        assert.equal(committed.revision, 2);
        assert.equal(replayed.revision, 2);
        assert.equal(state.project.revision, 2);
        assert.equal(state.updateCalls, 1);
        assert.equal(
            state.project.snapshotJson.projectSnapshotMutation.clientMutationId,
            'generic-response-loss-1',
        );
        assert.equal(state.project.snapshotJson.marker, 'committed-save');
    });

    it('rejects an RMW snapshot built from a stale project revision without overwriting the latest snapshot', async () => {
        const staleProject = projectAtRevision(1, { marker: 'stale-read' });
        const persisted = {
            revision: 2,
            snapshotJson: { marker: 'newer-editor-save' },
        };

        await assert.rejects(
            updateProjectWithSnapshot(
                { orgId: 'org-test', ownerUserId: 'user-test' },
                'user-test',
                staleProject,
                { marker: 'stale-read-with-building' },
                {},
                {
                    updateStudioProject: async (_scope, _actorUserId, projectId, data) => {
                        assert.equal(projectId, staleProject.id);
                        assert.equal(data.expectedRevision, 1);
                        if (data.expectedRevision !== persisted.revision) {
                            const error = new Error('项目已被其他窗口修改，请重新载入后再保存');
                            error.statusCode = 409;
                            error.publicCode = 'REVISION_CONFLICT';
                            throw error;
                        }
                        persisted.snapshotJson = data.snapshotJson;
                        persisted.revision += 1;
                        return projectAtRevision(persisted.revision, persisted.snapshotJson);
                    },
                },
            ),
            (error) => error.statusCode === 409 && error.publicCode === 'REVISION_CONFLICT',
        );

        assert.equal(persisted.revision, 2);
        assert.deepEqual(persisted.snapshotJson, { marker: 'newer-editor-save' });
    });

    it('commits an RMW snapshot only when the originally read revision is still current', async () => {
        const currentProject = projectAtRevision(4, { marker: 'current-read' });
        const persisted = {
            revision: 4,
            snapshotJson: currentProject.snapshotJson,
        };

        const updated = await updateProjectWithSnapshot(
            { orgId: 'org-test', ownerUserId: 'user-test' },
            'user-test',
            currentProject,
            { marker: 'current-read-with-map-layer' },
            {},
            {
                updateStudioProject: async (_scope, _actorUserId, _projectId, data) => {
                    assert.equal(data.expectedRevision, persisted.revision);
                    persisted.snapshotJson = data.snapshotJson;
                    persisted.revision += 1;
                    return projectAtRevision(persisted.revision, persisted.snapshotJson);
                },
            },
        );

        assert.equal(updated.revision, 5);
        assert.deepEqual(persisted.snapshotJson, { marker: 'current-read-with-map-layer' });
    });
});

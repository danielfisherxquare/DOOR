import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
    || 'postgres://door:door_dev@127.0.0.1:5432/door_test';
const testDatabaseName = new URL(TEST_DATABASE_URL).pathname.replace(/^\//, '');
if (!/(^test$|_test$|test_)/i.test(testDatabaseName)) {
    throw new Error(`Refusing to run site-mode integration tests against "${testDatabaseName}"`);
}
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'dev-only-do-not-use-in-production';

const { default: knex } = await import('../src/db/knex.js');
const { default: app } = await import('../src/app.js');
const { saveProjectSiteMode } = await import(
    '../src/modules/inventory/inventory.spatial.site-mode.service.js'
);
const { normalizeStudioSnapshot } = await import(
    '../src/modules/inventory/inventory.studio.snapshot.js'
);
const { createEmptyEditorDocument } = await import('../../src/3d-studio/model/editorDocument.js');

let databaseAvailable = false;
let skipReason = '';
let orgId = null;
let userId = null;
let projectId = null;
let focusZoneId = null;
let warehouseId = null;
let sceneSnapshot = null;

function buildDirectScene(name) {
    return {
        id: `scene-${name}`,
        sceneType: 'outdoor-event',
        warehouse: {
            id: 'site-mode-test-warehouse',
            name,
            dimensions_mm: { width_mm: 100000, depth_mm: 80000, height_mm: 12000 },
        },
        activeLevelId: 'site-mode-ground',
        editorDocument: {
            ...createEmptyEditorDocument(),
            metadata: { testScene: name },
        },
    };
}

describe('project-bound site mode transaction', () => {
    before(async () => {
        try {
            await knex.raw('select 1');
            await knex.migrate.latest();
        } catch (error) {
            skipReason = `test PostgreSQL unavailable: ${error.code || error.message}`;
            return;
        }

        const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const [org] = await knex('organizations')
            .insert({ name: `Site Mode Test ${unique}`, slug: `site-mode-${unique}` })
            .returning('*');
        orgId = org.id;
        const [user] = await knex('users')
            .insert({
                username: `site_mode_${unique}`,
                email: `site-mode-${unique}@test.invalid`,
                password_hash: 'not-used-by-this-test',
                role: 'org_admin',
                org_id: orgId,
                status: 'active',
                must_change_password: false,
            })
            .returning('*');
        userId = user.id;

        sceneSnapshot = buildDirectScene('初始场景');
        const projectSnapshot = normalizeStudioSnapshot(sceneSnapshot, {
            sceneType: 'outdoor-event',
            projectType: 'site',
            name: '事务测试场地',
        });
        warehouseId = projectSnapshot.warehouses[0].id;
        const [project] = await knex('inventory_3d_projects')
            .insert({
                org_id: orgId,
                owner_user_id: userId,
                name: '事务测试场地',
                scene_type: 'outdoor-event',
                project_type: 'site',
                status: 'draft',
                snapshot_json: projectSnapshot,
                source_type: 'blank',
                source_org_id: orgId,
                created_by: userId,
                updated_by: userId,
            })
            .returning('*');
        projectId = project.id;

        const [zone] = await knex('inventory_3d_terrain_work_zones')
            .insert({
                project_id: projectId,
                name: '事务测试 focus zone',
                zone_type: 'focus-zone',
                clip_polygon_wgs84: {
                    type: 'Polygon',
                    coordinates: [[[104.06, 30.65], [104.07, 30.65], [104.07, 30.66], [104.06, 30.65]]],
                },
                origin_wgs84: { longitude: 104.065, latitude: 30.655, height: 0 },
                snapshot_json: {
                    siteBake: {
                        status: 'ready',
                        warnings: [],
                        providerStatus: {},
                    },
                },
                metadata: { purpose: 'site-mode' },
                created_by: userId,
                updated_by: userId,
            })
            .returning('*');
        focusZoneId = zone.id;
        databaseAvailable = true;
    });

    after(async () => {
        if (databaseAvailable && orgId) {
            await knex('organizations').where({ id: orgId }).del();
        }
        await knex.destroy();
    });

    it('returns a safe 400 when a generic snapshot write omits expectedRevision', async (t) => {
        if (!databaseAvailable) return t.skip(skipReason);

        const token = jwt.sign(
            {
                userId: '33333333-3333-4333-8333-333333333333',
                orgId: null,
                role: 'super_admin',
            },
            process.env.JWT_SECRET,
            { expiresIn: '5m' },
        );
        const response = await request(app)
            .put('/api/app/3d-studio/projects/11111111-1111-4111-8111-111111111111/snapshot')
            .set('Authorization', `Bearer ${token}`)
            .send({ snapshotJson: { marker: 'unsafe-write' } });

        assert.equal(response.status, 400);
        assert.equal(response.body.success, false);
        assert.equal(response.body.code, 'REVISION_REQUIRED');
        assert.ok(response.body.requestId);
        assert.equal(response.body.stack, undefined);
    });

    it('defaults revision to 1 and atomically saves the project and focus zone', async (t) => {
        if (!databaseAvailable) return t.skip(skipReason);

        const [beforeRow] = await knex('inventory_3d_projects')
            .where({ id: projectId })
            .select('revision');
        assert.equal(beforeRow.revision, 1);

        const nextScene = buildDirectScene('已保存场景');
        const result = await saveProjectSiteMode(
            { orgId, ownerUserId: userId },
            userId,
            projectId,
            {
                focusZoneId,
                warehouseId,
                snapshotJson: nextScene,
                expectedRevision: 1,
                clientMutationId: 'site-mode-first-save',
            },
        );

        assert.equal(result.revision, 2);
        assert.equal(result.project.revision, 2);
        assert.equal(result.sceneSnapshot.editorDocument.metadata.testScene, '已保存场景');

        const [projectRow, zoneRow] = await Promise.all([
            knex('inventory_3d_projects').where({ id: projectId }).first(),
            knex('inventory_3d_terrain_work_zones').where({ id: focusZoneId }).first(),
        ]);
        assert.equal(projectRow.revision, 2);
        assert.equal(
            projectRow.snapshot_json.warehouses[0].sceneSnapshot.editorDocument.metadata.testScene,
            '已保存场景',
        );
        assert.equal(zoneRow.snapshot_json.warehouseScene.editorDocument.metadata.testScene, '已保存场景');
    });

    it('rejects generic project and snapshot writers after site-mode binding', async (t) => {
        if (!databaseAvailable) return t.skip(skipReason);

        const token = jwt.sign(
            { userId, orgId, role: 'org_admin' },
            process.env.JWT_SECRET,
            { expiresIn: '5m' },
        );
        const beforeProject = await knex('inventory_3d_projects').where({ id: projectId }).first();
        const requests = [
            request(app)
                .put(`/api/app/3d-studio/projects/${projectId}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    name: beforeProject.name,
                    snapshotJson: beforeProject.snapshot_json,
                    expectedRevision: beforeProject.revision,
                }),
            request(app)
                .put(`/api/app/3d-studio/projects/${projectId}/snapshot`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    snapshotJson: beforeProject.snapshot_json,
                    expectedRevision: beforeProject.revision,
                }),
        ];

        for (const response of await Promise.all(requests)) {
            assert.equal(response.status, 409);
            assert.equal(response.body.code, 'PROJECT_BINDING_REQUIRED');
            assert.equal(response.body.data.projectId, projectId);
            assert.equal(response.body.data.focusZoneId, focusZoneId);
        }

        const afterProject = await knex('inventory_3d_projects').where({ id: projectId }).first();
        assert.equal(afterProject.revision, beforeProject.revision);
        assert.deepEqual(afterProject.snapshot_json, beforeProject.snapshot_json);
    });

    it('exposes the bound site focus zone from project detail and list routes', async (t) => {
        if (!databaseAvailable) return t.skip(skipReason);

        const token = jwt.sign(
            { userId, orgId, role: 'org_admin' },
            process.env.JWT_SECRET,
            { expiresIn: '5m' },
        );
        const [detail, list] = await Promise.all([
            request(app)
                .get(`/api/app/3d-studio/projects/${projectId}`)
                .set('Authorization', `Bearer ${token}`),
            request(app)
                .get('/api/app/3d-studio/projects')
                .set('Authorization', `Bearer ${token}`),
        ]);

        assert.equal(detail.status, 200);
        assert.equal(detail.body.data.siteFocusZoneId, focusZoneId);
        assert.equal(list.status, 200);
        const listedProject = list.body.data.find((project) => project.id === projectId);
        assert.equal(listedProject?.siteFocusZoneId, focusZoneId);
    });

    it('rejects a stale revision with safe 409 data and leaves both rows untouched', async (t) => {
        if (!databaseAvailable) return t.skip(skipReason);

        await assert.rejects(
            saveProjectSiteMode(
                { orgId, ownerUserId: userId },
                userId,
                projectId,
                {
                    focusZoneId,
                    warehouseId,
                    snapshotJson: buildDirectScene('过期场景'),
                    expectedRevision: 1,
                    clientMutationId: 'site-mode-stale-save',
                },
            ),
            (error) => {
                assert.equal(error.statusCode, 409);
                assert.equal(error.publicCode, 'REVISION_CONFLICT');
                assert.equal(error.data.expectedRevision, 1);
                assert.equal(error.data.currentRevision, 2);
                return true;
            },
        );

        const [projectRow, zoneRow] = await Promise.all([
            knex('inventory_3d_projects').where({ id: projectId }).first(),
            knex('inventory_3d_terrain_work_zones').where({ id: focusZoneId }).first(),
        ]);
        assert.equal(projectRow.revision, 2);
        assert.equal(
            projectRow.snapshot_json.warehouses[0].sceneSnapshot.editorDocument.metadata.testScene,
            '已保存场景',
        );
        assert.equal(zoneRow.snapshot_json.warehouseScene.editorDocument.metadata.testScene, '已保存场景');
    });

    it('returns the conflict code and current revision through the HTTP route', async (t) => {
        if (!databaseAvailable) return t.skip(skipReason);

        const token = jwt.sign(
            { userId, orgId, role: 'org_admin' },
            process.env.JWT_SECRET,
            { expiresIn: '5m' },
        );
        const response = await request(app)
            .put(`/api/app/3d-studio/projects/${projectId}/site-mode`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                focusZoneId,
                warehouseId,
                snapshotJson: buildDirectScene('路由过期场景'),
                expectedRevision: 1,
                clientMutationId: 'site-mode-route-stale-save',
            });

        assert.equal(response.status, 409);
        assert.equal(response.body.success, false);
        assert.equal(response.body.code, 'REVISION_CONFLICT');
        assert.equal(response.body.data.expectedRevision, 1);
        assert.equal(response.body.data.currentRevision, 2);
        assert.ok(response.body.requestId);
        assert.equal(response.body.stack, undefined);
    });

    it('returns the project, focus zone, scene, and revision from one bound read route', async (t) => {
        if (!databaseAvailable) return t.skip(skipReason);

        const token = jwt.sign(
            { userId, orgId, role: 'org_admin' },
            process.env.JWT_SECRET,
            { expiresIn: '5m' },
        );
        const response = await request(app)
            .get(`/api/app/3d-studio/projects/${projectId}/site-mode`)
            .query({ focusZoneId })
            .set('Authorization', `Bearer ${token}`);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.data.project.id, projectId);
        assert.equal(response.body.data.focusZone.id, focusZoneId);
        assert.equal(response.body.data.revision, response.body.data.project.revision);
        assert.equal(
            response.body.data.sceneSnapshot.editorDocument.metadata.testScene,
            '已保存场景',
        );
    });

    it('rejects generic spatial-object membership before either side is written', async (t) => {
        if (!databaseAvailable) return t.skip(skipReason);

        const token = jwt.sign(
            { userId, orgId, role: 'org_admin' },
            process.env.JWT_SECRET,
            { expiresIn: '5m' },
        );
        const beforeCount = await knex('inventory_3d_event_spatial_objects')
            .where({ project_id: projectId })
            .count('* as count')
            .first();
        const response = await request(app)
            .post(`/api/app/3d-studio/projects/${projectId}/spatial-objects`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                focusZoneId,
                objectType: 'tent',
                title: '不应部分创建的帐篷',
                placementMode: 'follow-terrain',
                anchorWgs84: { longitude: 104.065, latitude: 30.655, height: 0 },
                localTransform: {},
                status: 'active',
            });

        assert.equal(response.status, 409);
        assert.equal(response.body.code, 'SITE_MODE_BOUND');
        const afterCount = await knex('inventory_3d_event_spatial_objects')
            .where({ project_id: projectId })
            .count('* as count')
            .first();
        assert.equal(Number(afterCount.count), Number(beforeCount.count));
        const zoneRow = await knex('inventory_3d_terrain_work_zones')
            .where({ id: focusZoneId })
            .first();
        assert.deepEqual(zoneRow.included_object_ids || [], []);
    });
});

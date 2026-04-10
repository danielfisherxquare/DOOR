import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;
process.env.NODE_ENV = 'test';

const { default: knex } = await import('../src/db/knex.js');
const { default: app } = await import('../src/app.js');

let server;
let baseUrl;
const tokens = {};
let testOrgId;
let testOrg2Id;
let testRaceId;
let testRace2Id;
let raceAdminUserId;

async function api(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
}

function authHeader(role) {
    return { Authorization: `Bearer ${tokens[role]}` };
}

async function createUser({ username, email, password, role, orgId = null }) {
    return knex('users')
        .insert({
            username,
            email,
            password_hash: await bcrypt.hash(password, 10),
            role,
            org_id: orgId,
            status: 'active',
            must_change_password: false,
        })
        .returning('*');
}

async function resetDatabase() {
    const result = await knex.raw(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT IN ('knex_migrations', 'knex_migrations_lock')
    `);
    const tableNames = result.rows.map((row) => `"${row.tablename}"`);
    if (tableNames.length > 0) {
        await knex.raw(`TRUNCATE TABLE ${tableNames.join(', ')} RESTART IDENTITY CASCADE`);
    }
}

describe('permission scenarios', () => {
    before(async () => {
        await knex.migrate.latest();
        await resetDatabase();

        const [org] = await knex('organizations').insert({ name: 'Permission Org', slug: 'perm-org' }).returning('*');
        const [org2] = await knex('organizations').insert({ name: 'Permission Org 2', slug: 'perm-org-2' }).returning('*');
        testOrgId = org.id;
        testOrg2Id = org2.id;

        const [race] = await knex('races')
            .insert({ name: 'Permission Race', org_id: testOrgId, date: '2026-03-31' })
            .returning('*');
        const [race2] = await knex('races')
            .insert({ name: 'Permission Race 2', org_id: testOrg2Id, date: '2026-04-01' })
            .returning('*');
        testRaceId = race.id;
        testRace2Id = race2.id;

        const [superAdmin] = await createUser({
            username: 'perm_super',
            email: 'perm_super@test.com',
            password: 'super123',
            role: 'super_admin',
        });
        const [orgAdmin] = await createUser({
            username: 'perm_admin',
            email: 'perm_admin@test.com',
            password: 'pass123',
            role: 'org_admin',
            orgId: testOrgId,
        });
        const [raceAdmin] = await createUser({
            username: 'perm_editor',
            email: 'perm_editor@test.com',
            password: 'editor123',
            role: 'race_admin',
            orgId: testOrgId,
        });
        const [viewer] = await createUser({
            username: 'perm_viewer',
            email: 'perm_viewer@test.com',
            password: 'viewer123',
            role: 'user',
            orgId: testOrgId,
        });
        const [inheritedRaceAdmin] = await createUser({
            username: 'perm_editor_inherited',
            email: 'perm_editor_inherited@test.com',
            password: 'implicit123',
            role: 'race_admin',
            orgId: testOrgId,
        });
        const [inheritedViewer] = await createUser({
            username: 'perm_viewer_inherited',
            email: 'perm_viewer_inherited@test.com',
            password: 'implicitviewer123',
            role: 'user',
            orgId: testOrgId,
        });
        raceAdminUserId = raceAdmin.id;

        await knex('user_race_permissions').insert([
            { user_id: raceAdmin.id, org_id: testOrgId, race_id: testRaceId, access_level: 'editor' },
            { user_id: viewer.id, org_id: testOrgId, race_id: testRaceId, access_level: 'viewer' },
        ]);

        server = app.listen(0);
        baseUrl = `http://localhost:${server.address().port}`;

        const credentials = [
            ['super_admin', { login: superAdmin.username, password: 'super123' }],
            ['org_admin', { login: orgAdmin.username, password: 'pass123' }],
            ['race_admin', { login: raceAdmin.username, password: 'editor123' }],
            ['user', { login: viewer.username, password: 'viewer123' }],
            ['race_admin_inherited', { login: inheritedRaceAdmin.username, password: 'implicit123' }],
            ['user_inherited', { login: inheritedViewer.username, password: 'implicitviewer123' }],
        ];

        for (const [role, credential] of credentials) {
            const response = await api('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify(credential),
            });
            assert.equal(response.status, 200, `${role} should log in`);
            tokens[role] = response.body.data.accessToken;
        }
    });

    after(async () => {
        await resetDatabase();
        server?.close();
        await knex.destroy();
    });

    it('rejects unauthenticated admin race list access', async () => {
        const response = await api('/api/admin/races');
        assert.equal(response.status, 401);
    });

    it('rejects unauthenticated admin dashboard access', async () => {
        const response = await api('/api/admin/dashboard');
        assert.equal(response.status, 401);
    });

    it('keeps explicitly granted viewer access working', async () => {
        const meResponse = await api('/api/auth/me', { headers: authHeader('user') });
        assert.equal(meResponse.status, 200);
        assert.ok(meResponse.body.data.assignedRaceIds.includes(testRaceId));
        assert.ok(
            meResponse.body.data.racePermissions.some(
                (item) => Number(item.raceId) === Number(testRaceId) && item.accessLevel === 'viewer',
            ),
        );

        const contextResponse = await api('/api/profile/context-options', { headers: authHeader('user') });
        assert.equal(contextResponse.status, 200);
        assert.ok(
            contextResponse.body.data.races.some(
                (item) => Number(item.raceId) === Number(testRaceId) && item.sourceType === 'explicit',
            ),
        );
    });

    it('lets a race_admin inherit owned races without explicit rows', async () => {
        const meResponse = await api('/api/auth/me', { headers: authHeader('race_admin_inherited') });
        assert.equal(meResponse.status, 200);
        assert.ok(meResponse.body.data.assignedRaceIds.includes(testRaceId));
        assert.ok(
            meResponse.body.data.racePermissions.some(
                (item) => Number(item.raceId) === Number(testRaceId) && item.accessLevel === 'editor',
            ),
        );

        const contextResponse = await api('/api/profile/context-options', {
            headers: authHeader('race_admin_inherited'),
        });
        assert.equal(contextResponse.status, 200);
        assert.ok(
            contextResponse.body.data.races.some(
                (item) => Number(item.raceId) === Number(testRaceId) && item.sourceType === 'inherited',
            ),
        );
    });

    it('caps inherited user access to read-only', async () => {
        const meResponse = await api('/api/auth/me', { headers: authHeader('user_inherited') });
        assert.equal(meResponse.status, 200);
        assert.ok(meResponse.body.data.assignedRaceIds.includes(testRaceId));
        assert.ok(
            meResponse.body.data.racePermissions.some(
                (item) => Number(item.raceId) === Number(testRaceId) && item.accessLevel === 'viewer',
            ),
        );

        const contextResponse = await api('/api/profile/context-options', {
            headers: authHeader('user_inherited'),
        });
        assert.equal(contextResponse.status, 200);
        assert.ok(
            contextResponse.body.data.races.some(
                (item) => Number(item.raceId) === Number(testRaceId)
                    && item.accessLevel === 'viewer'
                    && item.sourceType === 'inherited',
            ),
        );
    });

    it('returns context-options by role with proper switchability and locks', async () => {
        const superResponse = await api(`/api/profile/context-options?orgId=${testOrgId}&raceId=${testRaceId}`, {
            headers: authHeader('super_admin'),
        });
        assert.equal(superResponse.status, 200);
        assert.equal(superResponse.body.data.role, 'super_admin');
        assert.equal(superResponse.body.data.canSwitchOrg, true);
        assert.equal(superResponse.body.data.canSwitchRace, true);
        assert.equal(superResponse.body.data.locks.orgId, null);
        assert.equal(String(superResponse.body.data.current.orgId), String(testOrgId));
        assert.equal(String(superResponse.body.data.current.raceId), String(testRaceId));
        assert.ok(
            superResponse.body.data.organizations.some((item) => String(item.id) === String(testOrgId)),
        );
        assert.ok(
            superResponse.body.data.races.some(
                (item) => Number(item.raceId) === Number(testRaceId) && item.sourceType === 'platform',
            ),
        );

        const orgAdminResponse = await api('/api/profile/context-options', {
            headers: authHeader('org_admin'),
        });
        assert.equal(orgAdminResponse.status, 200);
        assert.equal(orgAdminResponse.body.data.role, 'org_admin');
        assert.equal(orgAdminResponse.body.data.canSwitchOrg, false);
        assert.equal(orgAdminResponse.body.data.canSwitchRace, true);
        assert.equal(String(orgAdminResponse.body.data.locks.orgId), String(testOrgId));
        assert.ok(
            orgAdminResponse.body.data.races.some(
                (item) => Number(item.raceId) === Number(testRaceId) && item.sourceType === 'inherited',
            ),
        );

        const raceAdminResponse = await api('/api/profile/context-options', {
            headers: authHeader('race_admin'),
        });
        assert.equal(raceAdminResponse.status, 200);
        assert.equal(raceAdminResponse.body.data.role, 'race_admin');
        assert.equal(raceAdminResponse.body.data.canSwitchOrg, false);
        assert.equal(raceAdminResponse.body.data.canSwitchRace, true);
        assert.ok(
            raceAdminResponse.body.data.races.some(
                (item) => Number(item.raceId) === Number(testRaceId) && item.sourceType === 'explicit',
            ),
        );

        const userResponse = await api('/api/profile/context-options', {
            headers: authHeader('user_inherited'),
        });
        assert.equal(userResponse.status, 200);
        assert.equal(userResponse.body.data.role, 'user');
        assert.equal(userResponse.body.data.canSwitchOrg, false);
        assert.equal(userResponse.body.data.canSwitchRace, true);
        assert.ok(
            userResponse.body.data.races.some(
                (item) => Number(item.raceId) === Number(testRaceId)
                    && item.accessLevel === 'viewer'
                    && item.sourceType === 'inherited',
            ),
        );
    });

    it('allows super_admin to access admin endpoints', async () => {
        const dashboardResponse = await api('/api/admin/dashboard', { headers: authHeader('super_admin') });
        assert.equal(dashboardResponse.status, 200);
        assert.ok(dashboardResponse.body.data.orgCount !== undefined);

        const orgsResponse = await api('/api/admin/orgs', { headers: authHeader('super_admin') });
        assert.equal(orgsResponse.status, 200);

        const usersResponse = await api('/api/admin/users', { headers: authHeader('super_admin') });
        assert.equal(usersResponse.status, 200);
    });

    it('requires orgId when super_admin calls org APIs without scope', async () => {
        const response = await api('/api/admin/org/users', { headers: authHeader('super_admin') });
        assert.equal(response.status, 400);
    });

    it('lets scoped super_admin access org user list', async () => {
        const response = await api(`/api/admin/org/users?orgId=${testOrgId}`, { headers: authHeader('super_admin') });
        assert.equal(response.status, 200);
    });

    it('blocks org_admin from admin-only dashboard', async () => {
        const response = await api('/api/admin/dashboard', { headers: authHeader('org_admin') });
        assert.equal(response.status, 403);
    });

    it('blocks race_admin from platform org list', async () => {
        const response = await api('/api/admin/orgs', { headers: authHeader('race_admin') });
        assert.equal(response.status, 403);
    });

    it('lets org_admin access org user list', async () => {
        const response = await api('/api/admin/org/users', { headers: authHeader('org_admin') });
        assert.equal(response.status, 200);
    });

    it('blocks race-level users from org APIs', async () => {
        const editorResponse = await api('/api/admin/org/users', { headers: authHeader('race_admin') });
        assert.equal(editorResponse.status, 403);

        const viewerResponse = await api('/api/admin/org/users', { headers: authHeader('user') });
        assert.equal(viewerResponse.status, 403);
    });

    it('rejects disabled user login', async () => {
        await knex('users').where({ username: 'perm_viewer' }).update({ status: 'disabled' });

        const response = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ login: 'perm_viewer', password: 'viewer123' }),
        });
        assert.equal(response.status, 403);

        await knex('users').where({ username: 'perm_viewer' }).update({ status: 'active' });
    });

    it('returns role, status, permissions and assignedRaceIds from /api/auth/me', async () => {
        const response = await api('/api/auth/me', { headers: authHeader('race_admin') });
        assert.equal(response.status, 200);
        assert.ok(response.body.data.role);
        assert.ok(response.body.data.status);
        assert.ok(Array.isArray(response.body.data.permissions));
        assert.ok(Array.isArray(response.body.data.assignedRaceIds));
        const racePermission = response.body.data.racePermissions.find(
            (item) => Number(item.raceId) === Number(testRaceId),
        );
        assert.ok(racePermission);
        assert.equal(racePermission.raceName, 'Permission Race');
        assert.equal(racePermission.source, 'user_assignment');
        assert.equal(racePermission.inheritedAccessLevel, 'editor');
        assert.equal(racePermission.explicitAccessLevel, 'editor');
    });

    it('lets super_admin move a user between orgs and clears old explicit race permissions', async () => {
        const response = await api(`/api/admin/users/${raceAdminUserId}`, {
            method: 'PATCH',
            headers: authHeader('super_admin'),
            body: JSON.stringify({ orgId: testOrg2Id }),
        });
        assert.equal(response.status, 200);
        assert.equal(response.body.data.org_id, testOrg2Id);

        const permissions = await knex('user_race_permissions').where({ user_id: raceAdminUserId });
        assert.equal(permissions.length, 0);
    });

    it('lets super_admin assign races inside the users current org scope', async () => {
        const response = await api(`/api/admin/identity-center/user-race-matrix?orgId=${testOrg2Id}`, {
            method: 'PUT',
            headers: authHeader('super_admin'),
            body: JSON.stringify({
                updates: [{
                    userId: raceAdminUserId,
                    explicitPermissions: [{ raceId: testRace2Id, accessLevel: 'editor' }],
                }],
            }),
        });
        assert.equal(response.status, 200);
    });

    it('rejects assigning a race outside the users org scope', async () => {
        const response = await api(`/api/admin/identity-center/user-race-matrix?orgId=${testOrg2Id}`, {
            method: 'PUT',
            headers: authHeader('super_admin'),
            body: JSON.stringify({
                updates: [{
                    userId: raceAdminUserId,
                    explicitPermissions: [{ raceId: testRaceId, accessLevel: 'editor' }],
                }],
            }),
        });
        assert.equal(response.status, 400);
    });
});

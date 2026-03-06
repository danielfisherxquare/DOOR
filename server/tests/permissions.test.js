import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
const { default: app } = await import('../src/app.js');

let server;
let baseUrl;
const tokens = {};
let testOrgId;
let testOrg2Id;
let testRaceId;
let testRace2Id;
let editorUserId;

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

describe('permission scenarios', () => {
    before(async () => {
        await knex.migrate.latest();

        await knex('org_race_permissions').del();
        await knex('user_race_permissions').del();
        await knex('refresh_tokens').del();
        await knex('users').del();
        await knex('races').del();
        await knex('organizations').del();

        const [org] = await knex('organizations').insert({ name: 'Permission Org', slug: 'perm-org' }).returning('*');
        const [org2] = await knex('organizations').insert({ name: 'Permission Org 2', slug: 'perm-org-2' }).returning('*');
        testOrgId = org.id;
        testOrg2Id = org2.id;

        const [race] = await knex('races').insert({ name: 'Permission Race', org_id: testOrgId }).returning('*');
        const [race2] = await knex('races').insert({ name: 'Permission Race 2', org_id: testOrg2Id }).returning('*');
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
        const [editor] = await createUser({
            username: 'perm_editor',
            email: 'perm_editor@test.com',
            password: 'editor123',
            role: 'race_editor',
            orgId: testOrgId,
        });
        const [viewer] = await createUser({
            username: 'perm_viewer',
            email: 'perm_viewer@test.com',
            password: 'viewer123',
            role: 'race_viewer',
            orgId: testOrgId,
        });
        const [inheritedEditor] = await createUser({
            username: 'perm_editor_inherited',
            email: 'perm_editor_inherited@test.com',
            password: 'implicit123',
            role: 'race_editor',
            orgId: testOrgId,
        });
        const [inheritedViewer] = await createUser({
            username: 'perm_viewer_inherited',
            email: 'perm_viewer_inherited@test.com',
            password: 'implicitviewer123',
            role: 'race_viewer',
            orgId: testOrgId,
        });
        editorUserId = editor.id;

        await knex('user_race_permissions').insert([
            { user_id: editor.id, org_id: testOrgId, race_id: testRaceId, access_level: 'editor' },
            { user_id: viewer.id, org_id: testOrgId, race_id: testRaceId, access_level: 'viewer' },
        ]);

        server = app.listen(0);
        baseUrl = `http://localhost:${server.address().port}`;

        const credentials = [
            ['super_admin', { login: superAdmin.username, password: 'super123' }],
            ['org_admin', { login: orgAdmin.username, password: 'pass123' }],
            ['race_editor', { login: editor.username, password: 'editor123' }],
            ['race_viewer', { login: viewer.username, password: 'viewer123' }],
            ['race_editor_inherited', { login: inheritedEditor.username, password: 'implicit123' }],
            ['race_viewer_inherited', { login: inheritedViewer.username, password: 'implicitviewer123' }],
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
        await knex('org_race_permissions').del();
        await knex('user_race_permissions').del();
        await knex('refresh_tokens').del();
        await knex('users').del();
        await knex('races').del();
        await knex('organizations').del();
        server?.close();
        await knex.destroy();
    });

    it('rejects unauthenticated race list access', async () => {
        const response = await api('/api/races');
        assert.equal(response.status, 401);
    });

    it('rejects unauthenticated admin dashboard access', async () => {
        const response = await api('/api/admin/dashboard');
        assert.equal(response.status, 401);
    });

    it('keeps explicitly granted viewer access working', async () => {
        const response = await api('/api/races', { headers: authHeader('race_viewer') });
        assert.equal(response.status, 200);
        assert.ok(response.body.data.some((race) => Number(race.id) === Number(testRaceId)));
    });

    it('lets a race_editor inherit owned races without explicit rows', async () => {
        const listResponse = await api('/api/races', { headers: authHeader('race_editor_inherited') });
        assert.equal(listResponse.status, 200);
        assert.ok(listResponse.body.data.some((race) => Number(race.id) === Number(testRaceId)));

        const meResponse = await api('/api/auth/me', { headers: authHeader('race_editor_inherited') });
        assert.equal(meResponse.status, 200);
        assert.ok(meResponse.body.data.assignedRaceIds.includes(testRaceId));
        assert.ok(
            meResponse.body.data.racePermissions.some(
                (item) => Number(item.raceId) === Number(testRaceId) && item.accessLevel === 'editor',
            ),
        );

        const updateResponse = await api(`/api/races/${testRaceId}`, {
            method: 'PUT',
            headers: authHeader('race_editor_inherited'),
            body: JSON.stringify({ location: 'implicit editor can update' }),
        });
        assert.equal(updateResponse.status, 200);
    });

    it('caps inherited race_viewer access to read-only', async () => {
        const listResponse = await api('/api/races', { headers: authHeader('race_viewer_inherited') });
        assert.equal(listResponse.status, 200);
        assert.ok(listResponse.body.data.some((race) => Number(race.id) === Number(testRaceId)));

        const meResponse = await api('/api/auth/me', { headers: authHeader('race_viewer_inherited') });
        assert.equal(meResponse.status, 200);
        assert.ok(meResponse.body.data.assignedRaceIds.includes(testRaceId));
        assert.ok(
            meResponse.body.data.racePermissions.some(
                (item) => Number(item.raceId) === Number(testRaceId) && item.accessLevel === 'viewer',
            ),
        );

        const updateResponse = await api(`/api/races/${testRaceId}`, {
            method: 'PUT',
            headers: authHeader('race_viewer_inherited'),
            body: JSON.stringify({ location: 'implicit viewer should fail' }),
        });
        assert.equal(updateResponse.status, 403);
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
        const response = await api('/api/org/users', { headers: authHeader('super_admin') });
        assert.equal(response.status, 400);
    });

    it('lets scoped super_admin access org user list', async () => {
        const response = await api(`/api/org/users?orgId=${testOrgId}`, { headers: authHeader('super_admin') });
        assert.equal(response.status, 200);
    });

    it('blocks org_admin from admin-only dashboard', async () => {
        const response = await api('/api/admin/dashboard', { headers: authHeader('org_admin') });
        assert.equal(response.status, 403);
    });

    it('blocks race_editor from platform org list', async () => {
        const response = await api('/api/admin/orgs', { headers: authHeader('race_editor') });
        assert.equal(response.status, 403);
    });

    it('lets org_admin access org user list', async () => {
        const response = await api('/api/org/users', { headers: authHeader('org_admin') });
        assert.equal(response.status, 200);
    });

    it('blocks race-level users from org APIs', async () => {
        const editorResponse = await api('/api/org/users', { headers: authHeader('race_editor') });
        assert.equal(editorResponse.status, 403);

        const viewerResponse = await api('/api/org/users', { headers: authHeader('race_viewer') });
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
        const response = await api('/api/auth/me', { headers: authHeader('race_editor') });
        assert.equal(response.status, 200);
        assert.ok(response.body.data.role);
        assert.ok(response.body.data.status);
        assert.ok(Array.isArray(response.body.data.permissions));
        assert.ok(Array.isArray(response.body.data.assignedRaceIds));
    });

    it('lets super_admin move a user between orgs and clears old explicit race permissions', async () => {
        const response = await api(`/api/admin/users/${editorUserId}`, {
            method: 'PATCH',
            headers: authHeader('super_admin'),
            body: JSON.stringify({ orgId: testOrg2Id }),
        });
        assert.equal(response.status, 200);
        assert.equal(response.body.data.org_id, testOrg2Id);

        const permissions = await knex('user_race_permissions').where({ user_id: editorUserId });
        assert.equal(permissions.length, 0);
    });

    it('lets super_admin assign races inside the users current org scope', async () => {
        const response = await api(`/api/org/users/${editorUserId}/race-permissions`, {
            method: 'PUT',
            headers: authHeader('super_admin'),
            body: JSON.stringify({ permissions: [{ raceId: testRace2Id, accessLevel: 'editor' }] }),
        });
        assert.equal(response.status, 200);
    });

    it('rejects assigning a race outside the users org scope', async () => {
        const response = await api(`/api/org/users/${editorUserId}/race-permissions`, {
            method: 'PUT',
            headers: authHeader('super_admin'),
            body: JSON.stringify({ permissions: [{ raceId: testRaceId, accessLevel: 'editor' }] }),
        });
        assert.equal(response.status, 400);
    });
});

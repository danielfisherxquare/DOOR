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
let orgAId;
let orgBId;
let raceAId;
let raceAdminBId;
const tokens = {};

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

describe('organization race permissions', () => {
    before(async () => {
        await knex.migrate.latest();
        await resetDatabase();

        const [orgA] = await knex('organizations').insert({ name: 'Org A', slug: 'org-a' }).returning('*');
        const [orgB] = await knex('organizations').insert({ name: 'Org B', slug: 'org-b' }).returning('*');
        orgAId = orgA.id;
        orgBId = orgB.id;

        const [raceA] = await knex('races')
            .insert({ org_id: orgAId, name: 'Org A Race', date: '2026-03-31' })
            .returning('*');
        raceAId = raceA.id;

        await knex('users').insert([
            {
                org_id: null,
                username: 'org_perm_super',
                email: 'org_perm_super@test.com',
                password_hash: await bcrypt.hash('pass123', 10),
                role: 'super_admin',
                status: 'active',
                must_change_password: false,
            },
            {
                org_id: orgBId,
                username: 'org_perm_admin_b',
                email: 'org_perm_admin_b@test.com',
                password_hash: await bcrypt.hash('pass123', 10),
                role: 'org_admin',
                status: 'active',
                must_change_password: false,
            },
        ]);

        const [editorB] = await knex('users')
            .insert({
                org_id: orgBId,
                username: 'org_perm_editor_b',
                email: 'org_perm_editor_b@test.com',
                password_hash: await bcrypt.hash('pass123', 10),
                role: 'race_admin',
                status: 'active',
                must_change_password: false,
            })
            .returning('*');
        raceAdminBId = editorB.id;

        server = app.listen(0);
        baseUrl = `http://localhost:${server.address().port}`;

        for (const [role, login] of [
            ['super_admin', 'org_perm_super'],
            ['org_admin_b', 'org_perm_admin_b'],
            ['race_admin_b', 'org_perm_editor_b'],
        ]) {
            const response = await api('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ login, password: 'pass123' }),
            });
            assert.equal(response.status, 200);
            tokens[role] = response.body.data.accessToken;
        }
    });

    after(async () => {
        await resetDatabase();
        server?.close();
        await knex.destroy();
    });

    it('lets super_admin grant viewer access to another org through identity center', async () => {
        const response = await api(`/api/admin/identity-center/org-race-matrix?orgId=${orgBId}`, {
            method: 'PUT',
            headers: authHeader('super_admin'),
            body: JSON.stringify({ permissions: [{ raceId: raceAId, accessLevel: 'viewer' }] }),
        });
        assert.equal(response.status, 200);
    });

    it('lets org_admin see granted races but blocks viewer writes', async () => {
        const contextResponse = await api('/api/profile/context-options', { headers: authHeader('org_admin_b') });
        assert.equal(contextResponse.status, 200);
        assert.ok(
            contextResponse.body.data.races.some(
                (item) => Number(item.raceId) === Number(raceAId) && item.accessLevel === 'viewer',
            ),
        );

        const updateResponse = await api(`/api/admin/races/${raceAId}`, {
            method: 'PUT',
            headers: authHeader('org_admin_b'),
            body: JSON.stringify({ name: 'viewer grant should not write' }),
        });
        assert.equal(updateResponse.status, 403);
    });

    it('lets super_admin upgrade granted access to editor through identity center', async () => {
        const response = await api(`/api/admin/identity-center/org-race-matrix?orgId=${orgBId}`, {
            method: 'PUT',
            headers: authHeader('super_admin'),
            body: JSON.stringify({ permissions: [{ raceId: raceAId, accessLevel: 'editor' }] }),
        });
        assert.equal(response.status, 200);
    });

    it('lets org members inherit editor access from the organization grant', async () => {
        const contextResponse = await api('/api/profile/context-options', { headers: authHeader('race_admin_b') });
        assert.equal(contextResponse.status, 200);
        assert.ok(
            contextResponse.body.data.races.some(
                (item) => Number(item.raceId) === Number(raceAId) && item.accessLevel === 'editor',
            ),
        );

        const meResponse = await api('/api/auth/me', { headers: authHeader('race_admin_b') });
        assert.equal(meResponse.status, 200);
        assert.ok(
            meResponse.body.data.racePermissions.some(
                (item) => Number(item.raceId) === Number(raceAId) && item.accessLevel === 'editor',
            ),
        );
    });

    it('lets explicit user viewer assignment downgrade inherited editor access', async () => {
        const setResponse = await api(`/api/admin/identity-center/user-race-matrix?orgId=${orgBId}`, {
            method: 'PUT',
            headers: authHeader('super_admin'),
            body: JSON.stringify({
                updates: [{
                    userId: raceAdminBId,
                    explicitPermissions: [{ raceId: raceAId, accessLevel: 'viewer' }],
                }],
            }),
        });
        assert.equal(setResponse.status, 200);

        const meResponse = await api('/api/auth/me', { headers: authHeader('race_admin_b') });
        assert.equal(meResponse.status, 200);
        assert.ok(
            meResponse.body.data.racePermissions.some(
                (item) => Number(item.raceId) === Number(raceAId) && item.accessLevel === 'viewer',
            ),
        );

        const contextResponse = await api('/api/profile/context-options', {
            headers: authHeader('race_admin_b'),
        });
        assert.equal(contextResponse.status, 200);
        assert.ok(
            contextResponse.body.data.races.some(
                (item) => Number(item.raceId) === Number(raceAId) && item.accessLevel === 'viewer',
            ),
        );
    });

    it('returns 404 for removed org and user race permission endpoints', async () => {
        const orgResponse = await api(`/api/admin/orgs/${orgBId}/race-permissions`, {
            headers: authHeader('super_admin'),
        });
        assert.equal(orgResponse.status, 404);

        const userResponse = await api(`/api/admin/org/users/${raceAdminBId}/race-permissions?orgId=${orgBId}`, {
            headers: authHeader('super_admin'),
        });
        assert.equal(userResponse.status, 404);
    });
});

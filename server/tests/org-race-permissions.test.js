import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
const { default: app } = await import('../src/app.js');

let server;
let baseUrl;
let orgAId;
let orgBId;
let raceAId;
let orgAdminBId;
let raceEditorBId;
const tokens = {};

async function api(path, options = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
}

function authHeader(role) {
    return { Authorization: `Bearer ${tokens[role]}` };
}

describe('机构赛事授权', () => {
    before(async () => {
        await knex.migrate.latest();

        await knex('org_race_permissions').del();
        await knex('user_race_permissions').del();
        await knex('refresh_tokens').del();
        await knex('users').del();
        await knex('races').del();
        await knex('organizations').del();

        const [orgA] = await knex('organizations').insert({ name: '机构A', slug: 'org-a' }).returning('*');
        const [orgB] = await knex('organizations').insert({ name: '机构B', slug: 'org-b' }).returning('*');
        orgAId = orgA.id;
        orgBId = orgB.id;

        const [raceA] = await knex('races').insert({ org_id: orgAId, name: 'A机构赛事' }).returning('*');
        raceAId = raceA.id;

        const [superAdmin] = await knex('users').insert({
            org_id: null,
            username: 'org_perm_super',
            email: 'org_perm_super@test.com',
            password_hash: await bcrypt.hash('pass123', 10),
            role: 'super_admin',
            status: 'active',
            must_change_password: false,
        }).returning('*');

        const [orgAdminB] = await knex('users').insert({
            org_id: orgBId,
            username: 'org_perm_admin_b',
            email: 'org_perm_admin_b@test.com',
            password_hash: await bcrypt.hash('pass123', 10),
            role: 'org_admin',
            status: 'active',
            must_change_password: false,
        }).returning('*');
        orgAdminBId = orgAdminB.id;

        const [editorB] = await knex('users').insert({
            org_id: orgBId,
            username: 'org_perm_editor_b',
            email: 'org_perm_editor_b@test.com',
            password_hash: await bcrypt.hash('pass123', 10),
            role: 'race_editor',
            status: 'active',
            must_change_password: false,
        }).returning('*');
        raceEditorBId = editorB.id;

        server = app.listen(0);
        baseUrl = `http://localhost:${server.address().port}`;

        for (const [role, login] of [
            ['super_admin', 'org_perm_super'],
            ['org_admin_b', 'org_perm_admin_b'],
            ['race_editor_b', 'org_perm_editor_b'],
        ]) {
            const res = await api('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ login, password: 'pass123' }),
            });
            assert.equal(res.status, 200);
            tokens[role] = res.body.data.accessToken;
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

    it('super_admin 可给机构授予 viewer 赛事权限', async () => {
        const res = await api(`/api/admin/orgs/${orgBId}/race-permissions`, {
            method: 'PUT',
            headers: authHeader('super_admin'),
            body: JSON.stringify({ permissions: [{ raceId: raceAId, accessLevel: 'viewer' }] }),
        });
        assert.equal(res.status, 200);
    });

    it('org_admin 可看到被授权赛事，但 viewer 无法写入', async () => {
        const listRes = await api('/api/races', {
            headers: authHeader('org_admin_b'),
        });
        assert.equal(listRes.status, 200);
        assert.ok(listRes.body.data.find((race) => Number(race.id) === Number(raceAId)));

        const updateRes = await api(`/api/races/${raceAId}`, {
            method: 'PUT',
            headers: authHeader('org_admin_b'),
            body: JSON.stringify({ name: '不应写入成功' }),
        });
        assert.equal(updateRes.status, 403);
    });

    it('切换为 editor 后，org_admin 可写入被授权赛事', async () => {
        const grantRes = await api(`/api/admin/orgs/${orgBId}/race-permissions`, {
            method: 'PUT',
            headers: authHeader('super_admin'),
            body: JSON.stringify({ permissions: [{ raceId: raceAId, accessLevel: 'editor' }] }),
        });
        assert.equal(grantRes.status, 200);

        const updateRes = await api(`/api/races/${raceAId}`, {
            method: 'PUT',
            headers: authHeader('org_admin_b'),
            body: JSON.stringify({ location: '授权后可编辑' }),
        });
        assert.equal(updateRes.status, 200);
    });

    it('超管可给机构成员分配被授权赛事权限', async () => {
        const setRes = await api(`/api/org/users/${raceEditorBId}/race-permissions`, {
            method: 'PUT',
            headers: authHeader('super_admin'),
            body: JSON.stringify({
                permissions: [{ raceId: raceAId, accessLevel: 'viewer' }],
            }),
        });
        assert.equal(setRes.status, 200);

        const listRes = await api('/api/races', {
            headers: authHeader('race_editor_b'),
        });
        assert.equal(listRes.status, 200);
        assert.ok(listRes.body.data.find((race) => Number(race.id) === Number(raceAId)));

        const updateRes = await api(`/api/races/${raceAId}`, {
            method: 'PUT',
            headers: authHeader('race_editor_b'),
            body: JSON.stringify({ name: '成员viewer不应写入成功' }),
        });
        assert.equal(updateRes.status, 403);
    });
});

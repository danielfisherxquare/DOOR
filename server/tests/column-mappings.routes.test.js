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
let orgId;

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

async function createUser({ username, email, password, role, userOrgId = null }) {
    return knex('users')
        .insert({
            username,
            email,
            password_hash: await bcrypt.hash(password, 10),
            role,
            org_id: userOrgId,
            status: 'active',
            must_change_password: false,
        })
        .returning('*');
}

describe('column mapping routes', () => {
    before(async () => {
        await knex.migrate.latest();

        await knex('column_mappings').del();
        await knex('refresh_tokens').del();
        await knex('users').del();
        await knex('races').del();
        await knex('organizations').del();

        const [org] = await knex('organizations')
            .insert({ name: 'Column Mapping Org', slug: 'column-mapping-org' })
            .returning('*');
        orgId = org.id;

        const [superAdmin] = await createUser({
            username: 'cm_super',
            email: 'cm_super@test.com',
            password: 'super123',
            role: 'super_admin',
        });
        const [orgAdmin] = await createUser({
            username: 'cm_admin',
            email: 'cm_admin@test.com',
            password: 'admin123',
            role: 'org_admin',
            userOrgId: orgId,
        });
        const [editor] = await createUser({
            username: 'cm_editor',
            email: 'cm_editor@test.com',
            password: 'editor123',
            role: 'race_editor',
            userOrgId: orgId,
        });

        server = app.listen(0);
        baseUrl = `http://localhost:${server.address().port}`;

        for (const [key, credentials] of [
            ['super_admin', { login: superAdmin.username, password: 'super123' }],
            ['org_admin', { login: orgAdmin.username, password: 'admin123' }],
            ['race_editor', { login: editor.username, password: 'editor123' }],
        ]) {
            const response = await api('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify(credentials),
            });
            assert.equal(response.status, 200);
            tokens[key] = response.body.data.accessToken;
        }
    });

    after(async () => {
        await knex('column_mappings').del();
        await knex('refresh_tokens').del();
        await knex('users').del();
        await knex('races').del();
        await knex('organizations').del();
        server?.close();
        await knex.destroy();
    });

    it('supports org defaults plus user overrides in effective reads', async () => {
        const orgCreate = await api('/api/column-mappings', {
            method: 'POST',
            headers: authHeader('org_admin'),
            body: JSON.stringify({
                scope: 'org',
                mappings: [
                    { sourceColumn: 'Name', targetFieldId: 'name' },
                    { sourceColumn: 'Phone', targetFieldId: 'phone' },
                ],
            }),
        });
        assert.equal(orgCreate.status, 201);

        const userCreate = await api('/api/column-mappings', {
            method: 'POST',
            headers: authHeader('race_editor'),
            body: JSON.stringify({
                scope: 'user',
                mappings: [
                    { sourceColumn: 'Phone', targetFieldId: 'emergencyPhone' },
                ],
            }),
        });
        assert.equal(userCreate.status, 201);

        const effective = await api('/api/column-mappings', {
            headers: authHeader('race_editor'),
        });
        assert.equal(effective.status, 200);
        assert.equal(effective.body.data.length, 2);

        const bySource = new Map(effective.body.data.map((item) => [item.sourceColumn, item]));
        assert.equal(bySource.get('Name').targetFieldId, 'name');
        assert.equal(bySource.get('Name').scope, 'org');
        assert.equal(bySource.get('Phone').targetFieldId, 'emergencyPhone');
        assert.equal(bySource.get('Phone').scope, 'user');
    });

    it('restricts org scope reads to org admins and above', async () => {
        const forbidden = await api('/api/column-mappings?scope=org', {
            headers: authHeader('race_editor'),
        });
        assert.equal(forbidden.status, 403);

        const allowed = await api('/api/column-mappings?scope=org', {
            headers: authHeader('org_admin'),
        });
        assert.equal(allowed.status, 200);
        assert.ok(Array.isArray(allowed.body.data));
    });

    it('falls back to org defaults after deleting a user override', async () => {
        const userScope = await api('/api/column-mappings?scope=user', {
            headers: authHeader('race_editor'),
        });
        assert.equal(userScope.status, 200);
        assert.equal(userScope.body.data.length, 1);

        const deleteResponse = await api('/api/column-mappings', {
            method: 'DELETE',
            headers: authHeader('race_editor'),
            body: JSON.stringify({
                scope: 'user',
                ids: [userScope.body.data[0].id],
            }),
        });
        assert.equal(deleteResponse.status, 200);

        const effective = await api('/api/column-mappings', {
            headers: authHeader('race_editor'),
        });
        assert.equal(effective.status, 200);
        const phoneMapping = effective.body.data.find((item) => item.sourceColumn === 'Phone');
        assert.equal(phoneMapping.targetFieldId, 'phone');
        assert.equal(phoneMapping.scope, 'org');
    });

    it('requires orgId for super_admin scoped requests', async () => {
        const missingScope = await api('/api/column-mappings', {
            headers: authHeader('super_admin'),
        });
        assert.equal(missingScope.status, 400);

        const scoped = await api(`/api/column-mappings?orgId=${orgId}`, {
            headers: authHeader('super_admin'),
        });
        assert.equal(scoped.status, 200);
        assert.ok(Array.isArray(scoped.body.data));
    });
});

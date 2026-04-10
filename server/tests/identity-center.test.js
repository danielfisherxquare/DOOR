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
let ownedRaceId;
let externalRaceId;
let raceAdminId;
let userId;
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

async function createUser({ username, email, password, role, orgId = null, teamMemberId = null, accountSource = 'manual' }) {
    const [user] = await knex('users')
        .insert({
            username,
            email,
            password_hash: await bcrypt.hash(password, 10),
            role,
            org_id: orgId,
            status: 'active',
            must_change_password: false,
            team_member_id: teamMemberId,
            account_source: accountSource,
        })
        .returning('*');
    return user;
}

describe('identity center routes', () => {
    before(async () => {
        await knex.migrate.latest();
        await resetDatabase();

        const [orgA] = await knex('organizations')
            .insert({ name: 'Identity Org A', slug: 'identity-org-a' })
            .returning('*');
        const [orgB] = await knex('organizations')
            .insert({ name: 'Identity Org B', slug: 'identity-org-b' })
            .returning('*');
        orgAId = orgA.id;
        orgBId = orgB.id;

        const [ownedRace] = await knex('races')
            .insert({ org_id: orgAId, name: 'Owned Race', date: '2026-04-01' })
            .returning('*');
        const [externalRace] = await knex('races')
            .insert({ org_id: orgBId, name: 'External Race', date: '2026-04-02' })
            .returning('*');
        ownedRaceId = ownedRace.id;
        externalRaceId = externalRace.id;

        const [teamMember] = await knex('team_members')
            .insert({
                org_id: orgAId,
                employee_code: 'EMP-001',
                employee_name: '矩阵测试成员',
                department: '赛事运营',
                member_type: 'employee',
                id_number_ciphertext: Buffer.from('id'),
                id_number_iv: 'iv',
                id_number_auth_tag: 'tag',
                id_number_last4: '1234',
                contact_ciphertext: Buffer.from('ct'),
                contact_iv: 'iv',
                contact_auth_tag: 'tag',
                contact_last4: '5678',
            })
            .returning('*');

        await createUser({
            username: 'identity_super',
            email: 'identity_super@test.com',
            password: 'pass123',
            role: 'super_admin',
        });
        await createUser({
            username: 'identity_org_admin',
            email: 'identity_org_admin@test.com',
            password: 'pass123',
            role: 'org_admin',
            orgId: orgAId,
        });
        const raceAdmin = await createUser({
            username: 'identity_editor',
            email: 'identity_editor@test.com',
            password: 'pass123',
            role: 'race_admin',
            orgId: orgAId,
            teamMemberId: teamMember.id,
        });
        const viewer = await createUser({
            username: 'identity_viewer',
            email: 'identity_viewer@test.com',
            password: 'pass123',
            role: 'user',
            orgId: orgAId,
        });
        raceAdminId = raceAdmin.id;
        userId = viewer.id;

        await knex('user_module_access').insert([
            {
                user_id: viewer.id,
                org_id: orgAId,
                module_id: 'app:map',
                granted_by: raceAdmin.id,
            },
            {
                user_id: raceAdmin.id,
                org_id: orgAId,
                module_id: 'ops:home',
                granted_by: raceAdmin.id,
            },
        ]);

        await knex('org_race_permissions').insert({
            org_id: orgAId,
            race_id: externalRaceId,
            access_level: 'viewer',
            granted_by: raceAdmin.id,
        });

        await knex('user_race_permissions').insert({
            user_id: raceAdmin.id,
            org_id: orgAId,
            race_id: ownedRaceId,
            access_level: 'viewer',
            created_by: raceAdmin.id,
        });

        server = app.listen(0);
        baseUrl = `http://localhost:${server.address().port}`;

        for (const [role, login] of [
            ['super_admin', 'identity_super'],
            ['org_admin', 'identity_org_admin'],
            ['race_admin', 'identity_editor'],
            ['user', 'identity_viewer'],
        ]) {
            const response = await api('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ login, password: 'pass123' }),
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

    it('returns scoped summary and frozen account columns', async () => {
        const summaryResponse = await api(`/api/admin/identity-center/summary?orgId=${orgAId}`, {
            headers: authHeader('super_admin'),
        });
        assert.equal(summaryResponse.status, 200);
        assert.equal(summaryResponse.body.data.scoped, true);
        assert.equal(String(summaryResponse.body.data.orgId), String(orgAId));

        const accountsResponse = await api(`/api/admin/identity-center/accounts?orgId=${orgAId}`, {
            headers: authHeader('super_admin'),
        });
        assert.equal(accountsResponse.status, 200);
        assert.ok(accountsResponse.body.data.items.length >= 3);

        const editorRow = accountsResponse.body.data.items.find((item) => item.id === raceAdminId);
        assert.equal(editorRow.team_member_name, '矩阵测试成员');
        assert.equal(editorRow.member_type, 'employee');
        assert.equal(editorRow.org_name, 'Identity Org A');
        assert.equal(editorRow.account_source, 'manual');
    });

    it('returns module matrix with effective modules and saves bulk updates', async () => {
        const response = await api(`/api/admin/identity-center/module-matrix?orgId=${orgAId}`, {
            headers: authHeader('super_admin'),
        });
        assert.equal(response.status, 200);
        assert.ok(response.body.data.users.every((item) => ['race_admin', 'user'].includes(item.role)));
        assert.deepEqual(
            response.body.data.matrix[userId].sort(),
            ['app:home', 'app:profile', 'app:map'].sort(),
        );

        const updateResponse = await api(`/api/admin/identity-center/module-matrix?orgId=${orgAId}`, {
            method: 'PUT',
            headers: authHeader('super_admin'),
            body: JSON.stringify({
                updates: [
                    { userId, modules: ['app:home', 'app:profile', 'ops:home'] },
                    { userId: raceAdminId, modules: ['app:home', 'app:profile', 'ops:home'] },
                ],
            }),
        });
        assert.equal(updateResponse.status, 200);
        assert.deepEqual(
            updateResponse.body.data.matrix[userId].sort(),
            ['app:home', 'app:profile', 'ops:home'].sort(),
        );
    });

    it('returns org race matrix and blocks org_admin from editing org grants', async () => {
        const response = await api(`/api/admin/identity-center/org-race-matrix?orgId=${orgAId}`, {
            headers: authHeader('super_admin'),
        });
        assert.equal(response.status, 200);

        const ownedRace = response.body.data.races.find((item) => Number(item.id) === Number(ownedRaceId));
        const externalRace = response.body.data.races.find((item) => Number(item.id) === Number(externalRaceId));
        assert.equal(ownedRace.ownership, 'owned');
        assert.equal(ownedRace.effectiveAccessLevel, 'editor');
        assert.equal(ownedRace.editable, false);
        assert.equal(externalRace.explicitAccessLevel, 'viewer');
        assert.equal(externalRace.editable, true);

        const blockedResponse = await api(`/api/admin/identity-center/org-race-matrix?orgId=${orgAId}`, {
            method: 'PUT',
            headers: authHeader('org_admin'),
            body: JSON.stringify({
                permissions: [{ raceId: externalRaceId, accessLevel: 'editor' }],
            }),
        });
        assert.equal(blockedResponse.status, 403);
    });

    it('returns user race matrix with inherited and explicit states', async () => {
        const response = await api(`/api/admin/identity-center/user-race-matrix?orgId=${orgAId}`, {
            headers: authHeader('super_admin'),
        });
        assert.equal(response.status, 200);

        const editorRow = response.body.data.items.find((item) => item.id === raceAdminId);
        const viewerRow = response.body.data.items.find((item) => item.id === userId);

        assert.equal(editorRow.permissions[ownedRaceId].explicitAccessLevel, 'viewer');
        assert.equal(editorRow.permissions[ownedRaceId].effectiveAccessLevel, 'viewer');
        assert.equal(editorRow.permissions[ownedRaceId].state, 'explicit_viewer');
        assert.equal(viewerRow.permissions[ownedRaceId].inheritedAccessLevel, 'viewer');
        assert.equal(viewerRow.permissions[ownedRaceId].effectiveAccessLevel, 'viewer');
        assert.equal(viewerRow.permissions[externalRaceId].inheritedAccessLevel, 'viewer');
    });

    it('rejects out-of-scope or over-cap user race updates', async () => {
        const forbiddenLevelResponse = await api(`/api/admin/identity-center/user-race-matrix?orgId=${orgAId}`, {
            method: 'PUT',
            headers: authHeader('super_admin'),
            body: JSON.stringify({
                updates: [
                    {
                        userId,
                        explicitPermissions: [{ raceId: ownedRaceId, accessLevel: 'editor' }],
                    },
                ],
            }),
        });
        assert.equal(forbiddenLevelResponse.status, 400);

        await knex('org_race_permissions')
            .where({ org_id: orgAId, race_id: externalRaceId })
            .update({ access_level: 'editor' });

        const saveResponse = await api(`/api/admin/identity-center/user-race-matrix?orgId=${orgAId}`, {
            method: 'PUT',
            headers: authHeader('super_admin'),
            body: JSON.stringify({
                updates: [
                    {
                        userId: raceAdminId,
                        explicitPermissions: [{ raceId: externalRaceId, accessLevel: 'editor' }],
                    },
                ],
            }),
        });
        assert.equal(saveResponse.status, 200);

        const saved = await knex('user_race_permissions')
            .where({ user_id: raceAdminId, org_id: orgAId, race_id: externalRaceId })
            .first();
        assert.equal(saved.access_level, 'editor');
    });

    it('returns 404 for removed legacy authorization endpoints', async () => {
        const moduleResponse = await api('/api/module-access/modules', {
            headers: authHeader('super_admin'),
        });
        assert.equal(moduleResponse.status, 404);

        const orgRaceResponse = await api(`/api/admin/orgs/${orgAId}/race-permissions`, {
            headers: authHeader('super_admin'),
        });
        assert.equal(orgRaceResponse.status, 404);

        const userRaceResponse = await api(`/api/admin/org/users/${raceAdminId}/race-permissions?orgId=${orgAId}`, {
            headers: authHeader('super_admin'),
        });
        assert.equal(userRaceResponse.status, 404);
    });
});

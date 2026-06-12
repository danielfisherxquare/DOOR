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
let orgAId;
let orgBId;
let raceAId;
let raceBId;

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
    const [user] = await knex('users')
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
    return user;
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

describe('profile context options', () => {
    before(async () => {
        await knex.migrate.latest();
        await resetDatabase();

        const [orgA] = await knex('organizations').insert({ name: 'Context Org A', slug: 'ctx-org-a' }).returning('*');
        const [orgB] = await knex('organizations').insert({ name: 'Context Org B', slug: 'ctx-org-b' }).returning('*');
        orgAId = orgA.id;
        orgBId = orgB.id;

        const [raceA] = await knex('races')
            .insert({ org_id: orgAId, name: 'Context Race A', date: '2026-03-31' })
            .returning('*');
        const [raceB] = await knex('races')
            .insert({ org_id: orgBId, name: 'Context Race B', date: '2026-04-01' })
            .returning('*');
        raceAId = raceA.id;
        raceBId = raceB.id;

        const superAdmin = await createUser({
            username: 'ctx_super',
            email: 'ctx_super@test.com',
            password: 'super123',
            role: 'super_admin',
        });
        const orgAdmin = await createUser({
            username: 'ctx_org_admin',
            email: 'ctx_org_admin@test.com',
            password: 'admin123',
            role: 'org_admin',
            orgId: orgAId,
        });
        const raceAdmin = await createUser({
            username: 'ctx_race_admin',
            email: 'ctx_race_admin@test.com',
            password: 'race123',
            role: 'race_admin',
            orgId: orgAId,
        });
        await createUser({
            username: 'ctx_race_admin_no_race',
            email: 'ctx_race_admin_no_race@test.com',
            password: 'race-none123',
            role: 'race_admin',
            orgId: orgAId,
        });
        const user = await createUser({
            username: 'ctx_user',
            email: 'ctx_user@test.com',
            password: 'user123',
            role: 'user',
            orgId: orgAId,
        });
        await createUser({
            username: 'ctx_user_no_race',
            email: 'ctx_user_no_race@test.com',
            password: 'user-none123',
            role: 'user',
            orgId: orgAId,
        });

        await knex('user_race_permissions').insert([
            { user_id: raceAdmin.id, org_id: orgAId, race_id: raceAId, access_level: 'editor' },
            { user_id: user.id, org_id: orgAId, race_id: raceAId, access_level: 'viewer' },
        ]);

        server = app.listen(0);
        baseUrl = `http://localhost:${server.address().port}`;

        for (const [key, login, password] of [
            ['super_admin', 'ctx_super', 'super123'],
            ['org_admin', 'ctx_org_admin', 'admin123'],
            ['race_admin', 'ctx_race_admin', 'race123'],
            ['race_admin_no_race', 'ctx_race_admin_no_race', 'race-none123'],
            ['user', 'ctx_user', 'user123'],
            ['user_no_race', 'ctx_user_no_race', 'user-none123'],
        ]) {
            const response = await api('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ login, password }),
            });
            assert.equal(response.status, 200);
            tokens[key] = response.body.data.accessToken;
        }
    });

    after(async () => {
        await resetDatabase();
        server?.close();
        await knex.destroy();
    });

    it('super_admin can switch org/race and gets platform source metadata', async () => {
        const platformResponse = await api('/api/profile/context-options', {
            headers: authHeader('super_admin'),
        });
        assert.equal(platformResponse.status, 200);
        assert.equal(platformResponse.body.data.current.orgId, null);
        assert.equal(platformResponse.body.data.current.raceId, null);
        assert.equal(platformResponse.body.data.current.scopeType, 'platform');
        assert.equal(platformResponse.body.data.canSwitchOrg, true);
        assert.equal(platformResponse.body.data.canSwitchRace, false);

        const response = await api(`/api/profile/context-options?orgId=${orgAId}&raceId=${raceAId}`, {
            headers: authHeader('super_admin'),
        });
        assert.equal(response.status, 200);
        assert.equal(response.body.data.role, 'super_admin');
        assert.equal(response.body.data.canSwitchOrg, true);
        assert.equal(response.body.data.canSwitchRace, true);
        assert.equal(response.body.data.current.orgId, orgAId);
        assert.equal(String(response.body.data.current.raceId), String(raceAId));
        assert.equal(response.body.data.current.scopeType, 'race');
        assert.ok(response.body.data.organizations.some((item) => item.id === orgBId));
        assert.ok(
            response.body.data.races.some(
                (item) => Number(item.raceId) === Number(raceAId)
                    && item.sourceType === 'platform'
                    && item.accessLevel === 'editor',
            ),
        );
    });

    it('org_admin has org lock and can switch only race', async () => {
        const response = await api('/api/profile/context-options', {
            headers: authHeader('org_admin'),
        });
        assert.equal(response.status, 200);
        assert.equal(response.body.data.role, 'org_admin');
        assert.equal(response.body.data.canSwitchOrg, false);
        assert.equal(response.body.data.canSwitchRace, true);
        assert.equal(response.body.data.locks.orgId, orgAId);
        assert.ok(
            response.body.data.races.some(
                (item) => Number(item.raceId) === Number(raceAId) && item.sourceType === 'inherited',
            ),
        );
    });

    it('race_admin and user keep explicit source and access caps', async () => {
        const raceAdminResponse = await api('/api/profile/context-options', {
            headers: authHeader('race_admin'),
        });
        assert.equal(raceAdminResponse.status, 200);
        assert.ok(
            raceAdminResponse.body.data.races.some(
                (item) => Number(item.raceId) === Number(raceAId)
                    && item.sourceType === 'explicit'
                    && item.accessLevel === 'editor',
            ),
        );

        const userResponse = await api('/api/profile/context-options', {
            headers: authHeader('user'),
        });
        assert.equal(userResponse.status, 200);
        assert.ok(
            userResponse.body.data.races.some(
                (item) => Number(item.raceId) === Number(raceAId)
                    && item.sourceType === 'explicit'
                    && item.accessLevel === 'viewer',
            ),
        );
    });

    it('does not list race options that authz/profile would reject', async () => {
        const raceAdminResponse = await api('/api/profile/context-options', {
            headers: authHeader('race_admin_no_race'),
        });
        assert.equal(raceAdminResponse.status, 200);
        assert.deepEqual(raceAdminResponse.body.data.races, []);
        assert.equal(raceAdminResponse.body.data.canSwitchRace, false);
        assert.equal(raceAdminResponse.body.data.current.raceId, null);

        const raceProfileResponse = await api(
            `/api/authz/profile?orgId=${orgAId}&raceId=${raceAId}`,
            { headers: authHeader('race_admin_no_race') },
        );
        assert.equal(raceProfileResponse.status, 403);

        const userResponse = await api('/api/profile/context-options', {
            headers: authHeader('user_no_race'),
        });
        assert.equal(userResponse.status, 200);
        assert.deepEqual(userResponse.body.data.races, []);
        assert.equal(userResponse.body.data.canSwitchRace, false);
        assert.equal(userResponse.body.data.current.raceId, null);

        const userRaceProfileResponse = await api(
            `/api/authz/profile?orgId=${orgAId}&raceId=${raceAId}`,
            { headers: authHeader('user_no_race') },
        );
        assert.equal(userRaceProfileResponse.status, 403);
    });

    it('auth/me returns enriched racePermissions metadata', async () => {
        const response = await api('/api/auth/me', { headers: authHeader('race_admin') });
        assert.equal(response.status, 200);
        const permission = response.body.data.racePermissions.find(
            (item) => Number(item.raceId) === Number(raceAId),
        );
        assert.ok(permission);
        assert.equal(permission.raceName, 'Context Race A');
        assert.equal(permission.source, 'user_assignment');
        assert.equal(permission.inheritedAccessLevel, 'editor');
        assert.equal(permission.explicitAccessLevel, 'editor');
    });
});

/**
 * 权限场景全覆盖集成测试
 * 测试 RBAC 各角色的 API 访问控制
 *
 * 运行: node --test tests/permissions.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
const { default: app } = await import('../src/app.js');

let server, baseUrl;
const tokens = {}; // { super_admin, org_admin, race_editor, race_viewer }
let testOrgId, testRaceId;

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

describe('权限场景全覆盖测试', () => {
    before(async () => {
        await knex.migrate.latest();

        // 清理
        await knex('user_race_permissions').del();
        await knex('refresh_tokens').del();
        await knex('users').del();
        await knex('races').del();
        await knex('organizations').del();

        // 创建测试机构
        const [org] = await knex('organizations').insert({ name: '权限测试机构', slug: 'perm-test' }).returning('*');
        testOrgId = org.id;

        // 创建测试赛事
        const [race] = await knex('races').insert({ name: '测试赛事', org_id: testOrgId }).returning('*');
        testRaceId = race.id;

        // 启动服务
        server = app.listen(0);
        baseUrl = `http://localhost:${server.address().port}`;

        // 注册 org_admin
        const regRes = await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username: 'perm_admin', email: 'perm_admin@test.com', password: 'pass123', orgName: '另一机构' }),
        });

        // 创建 super_admin
        const bcrypt = await import('bcryptjs');
        const hash = await bcrypt.default.hash('super123', 10);
        const [superUser] = await knex('users').insert({
            username: 'perm_super', email: 'perm_super@test.com',
            password_hash: hash, role: 'super_admin', org_id: null,
            status: 'active', must_change_password: false,
        }).returning('*');

        // 创建 race_editor（属于 testOrg）
        const editorHash = await bcrypt.default.hash('editor123', 10);
        const [editor] = await knex('users').insert({
            username: 'perm_editor', email: 'perm_editor@test.com',
            password_hash: editorHash, role: 'race_editor', org_id: testOrgId,
            status: 'active', must_change_password: false,
        }).returning('*');

        // 创建 race_viewer（属于 testOrg）
        const viewerHash = await bcrypt.default.hash('viewer123', 10);
        const [viewer] = await knex('users').insert({
            username: 'perm_viewer', email: 'perm_viewer@test.com',
            password_hash: viewerHash, role: 'race_viewer', org_id: testOrgId,
            status: 'active', must_change_password: false,
        }).returning('*');

        // 分配赛事权限
        await knex('user_race_permissions').insert([
            { user_id: editor.id, org_id: testOrgId, race_id: testRaceId, access_level: 'editor' },
            { user_id: viewer.id, org_id: testOrgId, race_id: testRaceId, access_level: 'viewer' },
        ]);

        // 登录所有角色
        for (const [role, cred] of [
            ['super_admin', { login: 'perm_super', password: 'super123' }],
            ['org_admin', { login: 'perm_admin', password: 'pass123' }],
            ['race_editor', { login: 'perm_editor', password: 'editor123' }],
            ['race_viewer', { login: 'perm_viewer', password: 'viewer123' }],
        ]) {
            const res = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(cred) });
            assert.equal(res.status, 200, `${role} 登录应成功`);
            tokens[role] = res.body.data.accessToken;
        }
    });

    after(async () => {
        await knex('user_race_permissions').del();
        await knex('refresh_tokens').del();
        await knex('users').del();
        await knex('races').del();
        await knex('organizations').del();
        server.close();
        await knex.destroy();
    });

    // ── 场景 1: 无 Token 访问业务 API → 401 ──────────
    it('无 Token 访问 /api/races → 401', async () => {
        const res = await api('/api/races');
        assert.equal(res.status, 401);
    });

    it('无 Token 访问 /api/admin/dashboard → 401', async () => {
        const res = await api('/api/admin/dashboard');
        assert.equal(res.status, 401);
    });

    // ── 场景 2: race_viewer GET 被授权赛事 → 200 ──────
    it('race_viewer GET /api/races → 200', async () => {
        const res = await api('/api/races', { headers: authHeader('race_viewer') });
        assert.equal(res.status, 200);
    });

    // ── 场景 3: super_admin 访问 admin API → 200 ──────
    it('super_admin GET /api/admin/dashboard → 200', async () => {
        const res = await api('/api/admin/dashboard', { headers: authHeader('super_admin') });
        assert.equal(res.status, 200);
        assert.ok(res.body.data.orgCount !== undefined);
    });

    it('super_admin GET /api/admin/orgs → 200', async () => {
        const res = await api('/api/admin/orgs', { headers: authHeader('super_admin') });
        assert.equal(res.status, 200);
    });

    it('super_admin GET /api/admin/users → 200', async () => {
        const res = await api('/api/admin/users', { headers: authHeader('super_admin') });
        assert.equal(res.status, 200);
    });

    // ── 场景 4: org_admin 访问 admin API → 403 ──────
    it('org_admin GET /api/admin/dashboard → 403', async () => {
        const res = await api('/api/admin/dashboard', { headers: authHeader('org_admin') });
        assert.equal(res.status, 403);
    });

    it('race_editor GET /api/admin/orgs → 403', async () => {
        const res = await api('/api/admin/orgs', { headers: authHeader('race_editor') });
        assert.equal(res.status, 403);
    });

    // ── 场景 5: org_admin 访问 org API → 200 ──────────
    it('org_admin GET /api/org/users → 200', async () => {
        const res = await api('/api/org/users', { headers: authHeader('org_admin') });
        assert.equal(res.status, 200);
    });

    // ── 场景 6: race_editor 访问 org API → 403 ──────
    it('race_editor GET /api/org/users → 403', async () => {
        const res = await api('/api/org/users', { headers: authHeader('race_editor') });
        assert.equal(res.status, 403);
    });

    it('race_viewer GET /api/org/users → 403', async () => {
        const res = await api('/api/org/users', { headers: authHeader('race_viewer') });
        assert.equal(res.status, 403);
    });

    // ── 场景 7: disabled 用户登录 → 403 ─────────────
    it('禁用用户登录 → 403', async () => {
        // 先禁用 race_viewer
        await knex('users').where({ username: 'perm_viewer' }).update({ status: 'disabled' });
        const res = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ login: 'perm_viewer', password: 'viewer123' }),
        });
        assert.equal(res.status, 403);
        // 恢复
        await knex('users').where({ username: 'perm_viewer' }).update({ status: 'active' });
    });

    // ── 场景 8: GET /api/auth/me 返回完整字段 ────────
    it('GET /me 返回 role + status + permissions + assignedRaceIds', async () => {
        const res = await api('/api/auth/me', { headers: authHeader('race_editor') });
        assert.equal(res.status, 200);
        const data = res.body.data;
        assert.ok(data.role, '应含 role');
        assert.ok(data.status, '应含 status');
        assert.ok(Array.isArray(data.permissions), '应含 permissions 数组');
        assert.ok(Array.isArray(data.assignedRaceIds), '应含 assignedRaceIds 数组');
    });
});

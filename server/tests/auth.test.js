/**
 * Auth 集成测试 — 注册、登录、Token 刷新、me 端点
 * 需要 PG 连接（通过 DATABASE_URL 环境变量）
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;
// The CI job keeps public registration disabled by default. This suite owns the
// enabled-registration contract and must opt in before the route is imported.
process.env.DISABLE_REGISTRATION = 'false';

const { default: knex } = await import('../src/db/knex.js');
const { default: authRoutes } = await import('../src/modules/auth/auth.routes.js');
const { requireAuth } = await import('../src/middleware/require-auth.js');
const { requirePasswordChanged } = await import('../src/middleware/require-password-changed.js');

let app, server, baseUrl;
const EXPLICIT_MODULE_ID = 'app:map';

async function api(path, options = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
}

describe('Auth Routes', () => {
    before(async () => {
        await knex.migrate.latest();
        // 清理测试数据
        await knex('refresh_tokens').del();
        await knex('users').del();
        await knex('organizations').del();

        app = express();
        app.use(express.json());
        app.use('/api/auth', authRoutes);
        app.use(requireAuth);
        app.use(requirePasswordChanged);
        app.get('/api/protected', (_req, res) => res.json({ success: true }));
        server = app.listen(0);
        baseUrl = `http://localhost:${server.address().port}`;
    });

    after(async () => {
        await knex('refresh_tokens').del();
        await knex('users').del();
        await knex('organizations').del();
        server.close();
        await knex.destroy();
    });

    let accessToken, refreshToken;

    it('注册 → 返回 accessToken + refreshToken + user', async () => {
        const res = await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                username: 'testadmin',
                email: 'testadmin@test.com',
                password: 'pass123',
                orgName: '测试组织Auth',
            }),
        });
        assert.equal(res.status, 201);
        assert.ok(res.body.data.accessToken, '应返回 accessToken');
        assert.ok(res.body.data.refreshToken, '应返回 refreshToken');
        assert.ok(res.body.data.user, '应返回 user');
        assert.equal(res.body.data.user.username, 'testadmin');
        assert.equal(res.body.data.user.passwordHash, undefined, 'user 不应含 passwordHash');
        await knex('users')
            .where({ username: 'testadmin' })
            .update({ role: 'user' });
        const user = await knex('users').where({ username: 'testadmin' }).first('id', 'org_id');
        await knex('user_module_access').insert({
            user_id: user.id,
            org_id: user.org_id,
            module_id: EXPLICIT_MODULE_ID,
            granted_by: user.id,
        });
        accessToken = res.body.data.accessToken;
        refreshToken = res.body.data.refreshToken;
    });

    it('不同机构可创建同名账号，但不会影响原账号登录链路', async () => {
        const res = await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                username: 'testadmin',
                email: 'testadmin-second@test.com',
                password: 'pass456',
                orgName: '另一个组织',
            }),
        });
        assert.equal(res.status, 201);
    });

    it('缺少必填字段 → 400', async () => {
        const res = await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username: 'x' }),
        });
        assert.equal(res.status, 400);
    });

    it('关闭注册时 → 403', async () => {
        process.env.DISABLE_REGISTRATION = 'true';
        try {
            const res = await api('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    username: 'disabled-registration',
                    email: 'disabled-registration@test.com',
                    password: 'pass123',
                    orgName: '不会创建的组织',
                }),
            });
            assert.equal(res.status, 403);
        } finally {
            process.env.DISABLE_REGISTRATION = 'false';
        }
    });

    it('登录正确密码 → 返回 token 对', async () => {
        const res = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ login: 'testadmin@test.com', password: 'pass123' }),
        });
        assert.equal(res.status, 200);
        assert.ok(res.body.data.accessToken);
        assert.ok(res.body.data.refreshToken);
        assert.deepEqual(
            res.body.data.user.moduleAccess.sort(),
            ['app:home', 'app:profile', EXPLICIT_MODULE_ID].sort(),
        );
        accessToken = res.body.data.accessToken;
        refreshToken = res.body.data.refreshToken;
    });

    it('登录错误密码 → 401', async () => {
        const res = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ login: 'testadmin@test.com', password: 'wrong' }),
        });
        assert.equal(res.status, 401);
    });

    it('Token 刷新 → 旧 token 失效 + 返回新 token', async () => {
        const res = await api('/api/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refreshToken }),
        });
        assert.equal(res.status, 200);
        assert.ok(res.body.data.accessToken, '应返回新 accessToken');
        assert.ok(res.body.data.refreshToken, '应返回新 refreshToken');
        assert.notEqual(res.body.data.refreshToken, refreshToken, '新旧 refreshToken 应不同');
        assert.deepEqual(
            res.body.data.user.moduleAccess.sort(),
            ['app:home', 'app:profile', EXPLICIT_MODULE_ID].sort(),
        );

        // 旧 token 失效
        const res2 = await api('/api/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refreshToken }),
        });
        assert.equal(res2.status, 401, '旧 refreshToken 应已失效');

        accessToken = res.body.data.accessToken;
        refreshToken = res.body.data.refreshToken;
    });

    it('GET /api/auth/me → 返回当前用户信息含 orgId', async () => {
        const res = await api('/api/auth/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.username, 'testadmin');
        assert.ok(res.body.data.orgId, '应含 orgId');
        assert.ok(res.body.data.org, '应含 org 对象');
        assert.ok(res.body.data.org.name, '组织应含 name');
        assert.deepEqual(
            res.body.data.moduleAccess.sort(),
            ['app:home', 'app:profile', EXPLICIT_MODULE_ID].sort(),
        );
    });

    it('GET /api/auth/me 无 token → 401', async () => {
        const res = await api('/api/auth/me');
        assert.equal(res.status, 401);
    });

    it('待改密账号只能访问认证自助接口，不能绕过进入业务 API', async () => {
        await knex('users')
            .where({ username: 'testadmin', email: 'testadmin@test.com' })
            .update({ must_change_password: true });

        const loginResponse = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ login: 'testadmin@test.com', password: 'pass123' }),
        });
        assert.equal(loginResponse.status, 200);
        assert.equal(loginResponse.body.data.user.mustChangePassword, true);
        const forcedToken = loginResponse.body.data.accessToken;

        const meResponse = await api('/api/auth/me', {
            headers: { Authorization: `Bearer ${forcedToken}` },
        });
        assert.equal(meResponse.status, 200, '改密前必须允许读取当前账号');

        const blockedResponse = await api('/api/protected', {
            headers: { Authorization: `Bearer ${forcedToken}` },
        });
        assert.equal(blockedResponse.status, 403);
        assert.equal(blockedResponse.body.error?.code, 'PASSWORD_CHANGE_REQUIRED');

        const changeResponse = await api('/api/auth/change-password', {
            method: 'POST',
            headers: { Authorization: `Bearer ${forcedToken}` },
            body: JSON.stringify({ oldPassword: 'pass123', newPassword: 'pass789' }),
        });
        assert.equal(changeResponse.status, 200, '改密接口本身不能被全局保护拦截');

        const unblockedResponse = await api('/api/protected', {
            headers: { Authorization: `Bearer ${forcedToken}` },
        });
        assert.equal(unblockedResponse.status, 200, '中间件应读取数据库实时状态，旧 JWT 改密后立即可用');

        await knex('users')
            .where({ username: 'testadmin', email: 'testadmin@test.com' })
            .update({ must_change_password: false });
    });

    it('已停用账号的存量 JWT 不能继续访问', async () => {
        await knex('users')
            .where({ username: 'testadmin', email: 'testadmin@test.com' })
            .update({ status: 'disabled' });

        const response = await api('/api/protected', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        assert.equal(response.status, 401);

        await knex('users')
            .where({ username: 'testadmin', email: 'testadmin@test.com' })
            .update({ status: 'active' });
    });

    it('登出 → 成功', async () => {
        const res = await api('/api/auth/logout', {
            method: 'POST',
            body: JSON.stringify({ refreshToken }),
        });
        assert.equal(res.status, 200);
    });
});

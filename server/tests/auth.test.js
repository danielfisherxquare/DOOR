/**
 * Auth 集成测试 — 注册、登录、Token 刷新、me 端点
 * 需要 PG 连接（通过 DATABASE_URL 环境变量）
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
const { default: authRoutes } = await import('../src/modules/auth/auth.routes.js');

let app, server, baseUrl;

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
        accessToken = res.body.data.accessToken;
        refreshToken = res.body.data.refreshToken;
    });

    it('重复注册相同用户名/邮箱 → 409', async () => {
        const res = await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                username: 'testadmin',
                email: 'testadmin@test.com',
                password: 'pass456',
                orgName: '另一个组织',
            }),
        });
        assert.equal(res.status, 409);
    });

    it('缺少必填字段 → 400', async () => {
        const res = await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username: 'x' }),
        });
        assert.equal(res.status, 400);
    });

    it('登录正确密码 → 返回 token 对', async () => {
        const res = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ login: 'testadmin', password: 'pass123' }),
        });
        assert.equal(res.status, 200);
        assert.ok(res.body.data.accessToken);
        assert.ok(res.body.data.refreshToken);
        accessToken = res.body.data.accessToken;
        refreshToken = res.body.data.refreshToken;
    });

    it('登录错误密码 → 401', async () => {
        const res = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ login: 'testadmin', password: 'wrong' }),
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
    });

    it('GET /api/auth/me 无 token → 401', async () => {
        const res = await api('/api/auth/me');
        assert.equal(res.status, 401);
    });

    it('登出 → 成功', async () => {
        const res = await api('/api/auth/logout', {
            method: 'POST',
            body: JSON.stringify({ refreshToken }),
        });
        assert.equal(res.status, 200);
    });
});

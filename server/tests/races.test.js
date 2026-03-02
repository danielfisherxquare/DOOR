/**
 * Races CRUD 集成测试 — 含组织隔离验证
 * 需要 PG 连接（通过 DATABASE_URL 环境变量）
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
const { default: authRoutes } = await import('../src/modules/auth/auth.routes.js');
const { default: raceRoutes } = await import('../src/modules/races/race.routes.js');

let app, server, baseUrl;

async function api(path, options = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
}

function authed(token) {
    return { headers: { Authorization: `Bearer ${token}` } };
}

describe('Races CRUD', () => {
    let tokenA, tokenB;

    before(async () => {
        await knex.migrate.latest();
        await knex('records').del();
        await knex('races').del();
        await knex('refresh_tokens').del();
        await knex('users').del();
        await knex('organizations').del();

        app = express();
        app.use(express.json());
        app.use('/api/auth', authRoutes);
        app.use('/api/races', raceRoutes);
        server = app.listen(0);
        baseUrl = `http://localhost:${server.address().port}`;

        // 注册两个组织
        const resA = await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username: 'race_admin_a', email: 'race_a@test.com', password: 'pass123', orgName: '赛事组织A' }),
        });
        tokenA = resA.body.data.accessToken;

        const resB = await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username: 'race_admin_b', email: 'race_b@test.com', password: 'pass456', orgName: '赛事组织B' }),
        });
        tokenB = resB.body.data.accessToken;
    });

    after(async () => {
        await knex('records').del();
        await knex('races').del();
        await knex('refresh_tokens').del();
        await knex('users').del();
        await knex('organizations').del();
        server.close();
        await knex.destroy();
    });

    let raceId;

    it('创建赛事', async () => {
        const res = await api('/api/races', {
            method: 'POST',
            body: JSON.stringify({
                name: '2026北京马拉松',
                date: '2026-10-15',
                location: '天安门广场',
                events: [{ name: '全马', distance: 42195 }],
                conflictRule: 'strict',
            }),
            ...authed(tokenA),
        });
        assert.equal(res.status, 201);
        assert.ok(res.body.data.id, '应返回赛事 ID');
        assert.equal(res.body.data.name, '2026北京马拉松');
        assert.deepEqual(res.body.data.events, [{ name: '全马', distance: 42195 }]);
        raceId = res.body.data.id;
    });

    it('列出组织赛事', async () => {
        const res = await api('/api/races', { ...authed(tokenA) });
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.data));
        assert.equal(res.body.data.length, 1);
        assert.equal(res.body.data[0].name, '2026北京马拉松');
    });

    it('获取单个赛事', async () => {
        const res = await api(`/api/races/${raceId}`, { ...authed(tokenA) });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.id, raceId);
    });

    it('更新赛事', async () => {
        const res = await api(`/api/races/${raceId}`, {
            method: 'PUT',
            body: JSON.stringify({ name: '2026北京马拉松（更新）', location: '新起点' }),
            ...authed(tokenA),
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.name, '2026北京马拉松（更新）');
        assert.equal(res.body.data.location, '新起点');
    });

    it('组织B看不到组织A的赛事', async () => {
        const res = await api('/api/races', { ...authed(tokenB) });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.length, 0, '组织B应看不到组织A的赛事');
    });

    it('组织B获取组织A赛事 → 404', async () => {
        const res = await api(`/api/races/${raceId}`, { ...authed(tokenB) });
        assert.equal(res.status, 404);
    });

    it('组织B更新组织A赛事 → 404', async () => {
        const res = await api(`/api/races/${raceId}`, {
            method: 'PUT',
            body: JSON.stringify({ name: '篡改' }),
            ...authed(tokenB),
        });
        assert.equal(res.status, 404);
    });

    it('组织B删除组织A赛事 → 404', async () => {
        const res = await api(`/api/races/${raceId}`, {
            method: 'DELETE',
            ...authed(tokenB),
        });
        assert.equal(res.status, 404);
    });

    it('未认证请求 → 401', async () => {
        const res = await api('/api/races');
        assert.equal(res.status, 401);
    });

    it('删除赛事', async () => {
        const res = await api(`/api/races/${raceId}`, {
            method: 'DELETE',
            ...authed(tokenA),
        });
        assert.equal(res.status, 200);

        // 验证已删除
        const res2 = await api(`/api/races/${raceId}`, { ...authed(tokenA) });
        assert.equal(res2.status, 404);
    });
});

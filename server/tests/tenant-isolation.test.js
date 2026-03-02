/**
 * Phase 2 — 多租户隔离测试
 * 验证两个组织之间的数据严格隔离
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ── 配置 ──────────────────────────────────────────────
const BASE = process.env.API_BASE || 'http://localhost:3001';

async function api(path, options = {}) {
    const url = `${BASE}${path}`;
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
}

function authed(token) {
    return { headers: { Authorization: `Bearer ${token}` } };
}

// ── 测试用数据 ────────────────────────────────────────
const orgA = { username: 'admin_a', email: 'a@test.com', password: 'pass123', orgName: '组织A' };
const orgB = { username: 'admin_b', email: 'b@test.com', password: 'pass456', orgName: '组织B' };

let tokenA, tokenB, raceIdA;

describe('多租户隔离测试', () => {
    before(async () => {
        // 注册两个组织
        const resA = await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(orgA),
        });
        assert.equal(resA.status, 201, `注册组织A应成功: ${JSON.stringify(resA.body)}`);
        tokenA = resA.body.data.accessToken;

        const resB = await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(orgB),
        });
        assert.equal(resB.status, 201, `注册组织B应成功: ${JSON.stringify(resB.body)}`);
        tokenB = resB.body.data.accessToken;

        // 组织A创建一个赛事
        const raceRes = await api('/api/races', {
            method: 'POST',
            body: JSON.stringify({ name: '组织A的赛事', date: '2026-10-01', location: '北京' }),
            ...authed(tokenA),
        });
        assert.equal(raceRes.status, 201, '创建赛事应成功');
        raceIdA = raceRes.body.data.id;
    });

    it('未认证请求应返回 401', async () => {
        const res = await api('/api/races');
        assert.equal(res.status, 401);
    });

    it('组织B不能获取组织A的赛事', async () => {
        const res = await api(`/api/races/${raceIdA}`, { ...authed(tokenB) });
        assert.equal(res.status, 404, '跨租户单个赛事查询应返回 404');
    });

    it('组织B不能更新组织A的赛事', async () => {
        const res = await api(`/api/races/${raceIdA}`, {
            method: 'PUT',
            body: JSON.stringify({ name: '篡改名称' }),
            ...authed(tokenB),
        });
        assert.equal(res.status, 404, '跨租户更新应返回 404');
    });

    it('组织B不能删除组织A的赛事', async () => {
        const res = await api(`/api/races/${raceIdA}`, {
            method: 'DELETE',
            ...authed(tokenB),
        });
        assert.equal(res.status, 404, '跨租户删除应返回 404');
    });

    it('组织B列出赛事看不到组织A的数据', async () => {
        const res = await api('/api/races', { ...authed(tokenB) });
        assert.equal(res.status, 200);
        const races = res.body.data;
        assert.ok(Array.isArray(races));
        const leaked = races.find(r => r.id === raceIdA);
        assert.equal(leaked, undefined, '不应看到组织A的赛事');
    });

    it('组织B查询records不能看到组织A的数据', async () => {
        const res = await api('/api/records/query', {
            method: 'POST',
            body: JSON.stringify({ raceId: raceIdA }),
            ...authed(tokenB),
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.records.length, 0, '跨租户records查询应返回空');
        assert.equal(res.body.data.total, 0, '跨租户records总数应为0');
    });

    it('组织A能正常访问自己的赛事', async () => {
        const res = await api(`/api/races/${raceIdA}`, { ...authed(tokenA) });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.name, '组织A的赛事');
    });

    it('Jobs API 现在也需要认证', async () => {
        const res = await api('/api/jobs/nonexistent-id');
        assert.equal(res.status, 401, 'Jobs API 应要求认证');
    });
});

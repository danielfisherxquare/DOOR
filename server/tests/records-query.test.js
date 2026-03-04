/**
 * Records 查询集成测试 — 6 种 operator + 分页 + 排序 + 关键词
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
const { default: recordRoutes } = await import('../src/modules/records/record.routes.js');

let app, server, baseUrl;

async function api(path, options = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
}

function authed(token) {
    return { headers: { Authorization: `Bearer ${token}` } };
}

describe('Records Query', () => {
    let token, raceId, orgId;

    before(async () => {
        await knex.migrate.latest();
        await knex('records').del();
        await knex('races').del();
        await knex('refresh_tokens').del();
        await knex('users').del();
        await knex('organizations').del();

        const { requireAuth } = await import('../src/middleware/require-auth.js');
        app = express();
        app.use(express.json());
        app.use('/api/auth', authRoutes);
        app.use('/api/races', requireAuth, raceRoutes);
        app.use('/api/records', requireAuth, recordRoutes);
        server = app.listen(0);
        baseUrl = `http://localhost:${server.address().port}`;

        // 注册 + 获取 token
        const regRes = await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username: 'rec_admin', email: 'rec@test.com', password: 'pass123', orgName: '记录测试组织' }),
        });
        if (regRes.status !== 201) console.log('REGISTER FAILED:', regRes);
        token = regRes.body?.data?.accessToken;
        orgId = regRes.body?.data?.user?.orgId;

        // 创建赛事
        console.log('TOKEN GENERATED:', token);
        const raceRes = await api('/api/races', {
            method: 'POST',
            body: JSON.stringify({ name: '测试赛事', date: '2026-10-01', location: '测试地点' }),
            ...authed(token),
        });
        console.log('CREATE RACE RESP:', JSON.stringify(raceRes));
        if (raceRes.status !== 201) console.log('CREATE RACE FAILED:', JSON.stringify(raceRes));
        raceId = raceRes.body?.data?.id;
        console.log('CREATED RACE ID:', raceId);

        // 插入测试记录（直接入库）
        const records = [
            { org_id: orgId, race_id: raceId, name: '张三', name_pinyin: 'zhangsan', phone: '13800138001', gender: 'M', event: '全马', clothing_size: 'L', province: '北京', city: '北京', id_number: '110101199001011001', _source: 'file1.xlsx', country: 'CN', source: 'excel' },
            { org_id: orgId, race_id: raceId, name: '李四', name_pinyin: 'lisi', phone: '13800138002', gender: 'F', event: '半马', clothing_size: 'M', province: '上海', city: '上海', id_number: '310101199001011002', _source: 'file1.xlsx', country: 'CN', source: 'excel' },
            { org_id: orgId, race_id: raceId, name: '王五', name_pinyin: 'wangwu', phone: '13800138003', gender: 'M', event: '全马', clothing_size: 'XL', province: '广东', city: '深圳', id_number: '440101199001011003', _source: 'file2.xlsx', country: 'US', source: 'api' },
            { org_id: orgId, race_id: raceId, name: '', name_pinyin: '', phone: '', gender: '', event: '10K', clothing_size: '', province: '', city: '', id_number: '', _source: 'file3.xlsx', country: '', source: '' },
        ];
        await knex('records').insert(records);
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

    // ── 基本查询 ──

    it('查询全部记录', async () => {
        const res = await api('/api/records/query', {
            method: 'POST',
            body: JSON.stringify({ raceId }),
            ...authed(token),
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.total, 4);
        assert.equal(res.body.data.records.length, 4);
    });

    // ── 关键词搜索 ──

    it('按姓名关键词搜索', async () => {
        const res = await api('/api/records/query', {
            method: 'POST',
            body: JSON.stringify({ raceId, keyword: '张三' }),
            ...authed(token),
        });
        assert.equal(res.body.data.total, 1);
        assert.equal(res.body.data.records[0].name, '张三');
    });

    it('按证件号关键词搜索', async () => {
        const res = await api('/api/records/query', {
            method: 'POST',
            body: JSON.stringify({ raceId, keyword: '310101' }),
            ...authed(token),
        });
        assert.equal(res.body.data.total, 1);
        assert.equal(res.body.data.records[0].name, '李四');
    });

    // ── 6 种 Operator ──

    it('operator: contains', async () => {
        const res = await api('/api/records/query', {
            method: 'POST',
            body: JSON.stringify({
                raceId,
                filters: [{ field: 'name', operator: 'contains', value: '三' }],
            }),
            ...authed(token),
        });
        assert.equal(res.body.data.total, 1);
    });

    it('operator: equals', async () => {
        const res = await api('/api/records/query', {
            method: 'POST',
            body: JSON.stringify({
                raceId,
                filters: [{ field: 'event', operator: 'equals', value: '全马' }],
            }),
            ...authed(token),
        });
        assert.equal(res.body.data.total, 2);
    });

    it('operator: startsWith', async () => {
        const res = await api('/api/records/query', {
            method: 'POST',
            body: JSON.stringify({
                raceId,
                filters: [{ field: 'name', operator: 'startsWith', value: '王' }],
            }),
            ...authed(token),
        });
        assert.equal(res.body.data.total, 1);
        assert.equal(res.body.data.records[0].name, '王五');
    });

    it('operator: endsWith', async () => {
        const res = await api('/api/records/query', {
            method: 'POST',
            body: JSON.stringify({
                raceId,
                filters: [{ field: 'name', operator: 'endsWith', value: '四' }],
            }),
            ...authed(token),
        });
        assert.equal(res.body.data.total, 1);
        assert.equal(res.body.data.records[0].name, '李四');
    });

    it('operator: notEmpty', async () => {
        const res = await api('/api/records/query', {
            method: 'POST',
            body: JSON.stringify({
                raceId,
                filters: [{ field: 'name', operator: 'notEmpty' }],
            }),
            ...authed(token),
        });
        assert.equal(res.body.data.total, 3, '3 条记录有姓名');
    });

    it('operator: empty', async () => {
        const res = await api('/api/records/query', {
            method: 'POST',
            body: JSON.stringify({
                raceId,
                filters: [{ field: 'name', operator: 'empty' }],
            }),
            ...authed(token),
        });
        assert.equal(res.body.data.total, 1, '1 条记录姓名为空');
    });

    it('operator: in', async () => {
        const res = await api('/api/records/query', {
            method: 'POST',
            body: JSON.stringify({
                raceId,
                filters: [{ field: 'event', operator: 'in', value: ['全马', '10K'] }],
            }),
            ...authed(token),
        });
        assert.equal(res.body.data.total, 3);
    });

    // ── 分页 ──

    it('分页 offset + limit', async () => {
        const res = await api('/api/records/query', {
            method: 'POST',
            body: JSON.stringify({ raceId, offset: 0, limit: 2 }),
            ...authed(token),
        });
        assert.equal(res.body.data.records.length, 2);
        assert.equal(res.body.data.total, 4, 'total 应反映全部数量');
    });

    // ── 排序 ──

    it('按姓名升序排序', async () => {
        const res = await api('/api/records/query', {
            method: 'POST',
            body: JSON.stringify({
                raceId,
                sort: { field: 'name', direction: 'asc' },
                filters: [{ field: 'name', operator: 'notEmpty' }],
            }),
            ...authed(token),
        });
        const names = res.body.data.records.map(r => r.name);
        assert.deepEqual(names, ['张三', '李四', '王五']);
    });

    // ── 统计分析 ──

    it('analysis 返回正确结构', async () => {
        const res = await api('/api/records/analysis', {
            method: 'POST',
            body: JSON.stringify({ raceId }),
            ...authed(token),
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.total, 4);
        assert.ok(Array.isArray(res.body.data.genderByEvent));
        assert.ok(Array.isArray(res.body.data.clothingSizeByEvent));
        assert.ok(Array.isArray(res.body.data.nationality));
        assert.ok(Array.isArray(res.body.data.province));
        assert.ok(Array.isArray(res.body.data.city));
    });

    // ── 唯一值 ──

    it('unique-values 返回不重复值', async () => {
        const res = await api('/api/records/unique-values', {
            method: 'POST',
            body: JSON.stringify({ field: 'event', raceId }),
            ...authed(token),
        });
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.data));
        assert.ok(res.body.data.length >= 3, '至少 3 个不同项目');
    });

    it('unique-values 非白名单字段 → 400', async () => {
        const res = await api('/api/records/unique-values', {
            method: 'POST',
            body: JSON.stringify({ field: 'id', raceId }),
            ...authed(token),
        });
        assert.equal(res.status, 400);
    });

    // ── 快速统计 ──

    it('quick-stats 返回正确结构', async () => {
        const res = await api(`/api/records/quick-stats/${raceId}`, { ...authed(token) });
        assert.equal(res.status, 200);
        assert.equal(res.body.data.totalRows, 4);
        assert.equal(typeof res.body.data.fileCount, 'number');
    });
});

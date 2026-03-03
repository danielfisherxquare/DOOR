import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { tenantContext } from '../src/middleware/tenant-context.js';
import { errorHandler } from '../src/middleware/error-handler.js';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
const { default: authRoutes } = await import('../src/modules/auth/auth.routes.js');
const { default: importSessionRoutes } = await import('../src/modules/import-sessions/import-session.routes.js');

let app, server, baseUrl;

async function api(path, options = {}) {
    const { headers: optHeaders, ...rest } = options;
    const res = await fetch(`${baseUrl}${path}`, {
        ...rest,
        headers: { 'Content-Type': 'application/json', ...optHeaders },
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
}

describe('Import Sessions API', () => {
    let orgId;
    let token;
    let testSessionId;

    before(async () => {
        await knex.migrate.latest();

        // 彻底清理测试数据，确保环境一致
        await knex('import_session_chunks').del();
        await knex('import_sessions').del();
        await knex('refresh_tokens').del();
        await knex('users').del();
        await knex('organizations').del();

        app = express();
        app.use(express.json());
        app.use('/api/auth', authRoutes);
        app.use('/api/import-sessions', tenantContext, importSessionRoutes);
        app.use(errorHandler);

        server = app.listen(0);
        baseUrl = `http://localhost:${server.address().port}`;

        const registerRes = await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                username: `testadmin`,
                email: `testadmin@test.com`,
                password: 'password123',
                orgName: '导入测试组织'
            }),
        });

        token = registerRes.body.data.accessToken;
        orgId = registerRes.body.data.user.orgId;
    });

    after(async () => {
        await knex('import_session_chunks').del();
        await knex('import_sessions').del();
        await knex('refresh_tokens').del();
        await knex('users').del();
        await knex('organizations').del();
        server.close();
        await knex.destroy();
    });

    it('should create a new import session', async () => {
        const res = await api('/api/import-sessions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        });

        assert.equal(res.status, 200, res.body?.message);
        assert.equal(res.body.success, true);
        assert.ok(res.body.data.id);
        assert.equal(res.body.data.status, 'open');
        assert.equal(res.body.data.orgId, orgId);

        testSessionId = res.body.data.id;
    });

    it('should set summary for the session', async () => {
        const summaryPayload = {
            rawCount: 2000,
            rawPreview: [{ idNumber: '123' }, { idNumber: '456' }],
            stats: { pinyin: 15 }
        };

        const res = await api(`/api/import-sessions/${testSessionId}/summary`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify(summaryPayload)
        });

        assert.equal(res.status, 200);
        assert.equal(res.body.data.rawCount, 2000);
        assert.equal(res.body.data.rawPreview.length, 2);
        assert.equal(res.body.data.stats.pinyin, 15);
    });

    it('should append data chunks and update total rows', async () => {
        let res = await api(`/api/import-sessions/${testSessionId}/chunks`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify([{ name: 'Alice' }, { name: 'Bob' }])
        });

        assert.equal(res.status, 200);
        assert.equal(res.body.data.totalRows, 2);

        res = await api(`/api/import-sessions/${testSessionId}/chunks`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify([{ name: 'Charlie' }])
        });

        assert.equal(res.status, 200);
        assert.equal(res.body.data.totalRows, 3);
    });

    it('should get merged chunks with offset and limit', async () => {
        const res = await api(`/api/import-sessions/${testSessionId}/chunks?offset=1&limit=2`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` }
        });

        assert.equal(res.status, 200);
        assert.equal(res.body.data.length, 2);
        assert.equal(res.body.data[0].name, 'Bob');
        assert.equal(res.body.data[1].name, 'Charlie');
    });

    it('should cancel and delete the session', async () => {
        const res = await api(`/api/import-sessions/${testSessionId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });

        assert.equal(res.status, 200);

        const checkRes = await api(`/api/import-sessions/${testSessionId}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` }
        });

        assert.equal(checkRes.status, 404);

        const chunksCount = await knex('import_session_chunks')
            .where({ session_id: testSessionId })
            .count('id as cnt')
            .first();

        assert.equal(Number(chunksCount.cnt), 0);
        testSessionId = null;
    });
});

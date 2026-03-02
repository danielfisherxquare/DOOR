import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

// 设置测试 DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');

describe('Health Routes', () => {
    let app;
    let server;
    let baseUrl;

    before(async () => {
        await knex.migrate.latest();

        const { default: healthRoutes } = await import('../src/modules/health/health.routes.js');
        app = express();
        app.use('/api/health', healthRoutes);
        server = app.listen(0); // 随机端口
        const { port } = server.address();
        baseUrl = `http://localhost:${port}`;
    });

    after(async () => {
        server.close();
        await knex.destroy();
    });

    it('GET /api/health/live 返回 200', async () => {
        const res = await fetch(`${baseUrl}/api/health/live`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.status, 'ok');
    });

    it('GET /api/health/ready 返回 200 + database connected', async () => {
        const res = await fetch(`${baseUrl}/api/health/ready`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.status, 'ok');
        assert.equal(body.database, 'connected');
    });
});

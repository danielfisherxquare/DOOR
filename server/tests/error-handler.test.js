import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';

import { errorHandler } from '../src/middleware/error-handler.js';
import { requestId } from '../src/middleware/request-id.js';

function createErrorApp(errorFactory) {
    const app = express();
    app.use(requestId);
    app.get('/failure', (_req, _res, next) => next(errorFactory()));
    app.use(errorHandler);
    return app;
}

describe('error response contract', () => {
    it('preserves a public application error and request context', async () => {
        const app = createErrorApp(() => Object.assign(new Error('当前工作区禁止此操作'), {
            status: 403,
            expose: true,
            code: 'WORKSPACE_DENIED',
            details: { scopeType: 'race' },
        }));

        const response = await request(app)
            .get('/failure')
            .set('x-request-id', 'req-contract-403')
            .expect(403);

        assert.equal(response.headers['x-request-id'], 'req-contract-403');
        assert.deepEqual(response.body, {
            success: false,
            error: {
                code: 'WORKSPACE_DENIED',
                message: '当前工作区禁止此操作',
                details: { scopeType: 'race' },
                requestId: 'req-contract-403',
            },
            message: '当前工作区禁止此操作',
        });
    });

    it('maps database conflicts without exposing PostgreSQL codes or details', async () => {
        const app = createErrorApp(() => Object.assign(new Error('duplicate key value'), {
            code: '23505',
            detail: 'Key (email)=(private@example.com) already exists',
        }));

        const response = await request(app).get('/failure').expect(409);

        assert.equal(response.body.error.code, 'CONFLICT');
        assert.equal(response.body.error.message, '数据已存在或违反唯一约束');
        assert.equal(response.body.error.details, undefined);
        assert.match(response.body.error.requestId, /^[0-9a-f-]{36}$/i);
    });

    it('adds legacy publicCode/data fields without changing the structured error', async () => {
        const app = createErrorApp(() => Object.assign(new Error('项目已被其他窗口修改'), {
            statusCode: 409,
            expose: true,
            publicCode: 'REVISION_CONFLICT',
            data: { expectedRevision: 1, currentRevision: 2 },
        }));

        const response = await request(app)
            .get('/failure')
            .set('x-request-id', 'req-legacy-409')
            .expect(409);

        assert.deepEqual(response.body, {
            success: false,
            error: {
                code: 'REVISION_CONFLICT',
                message: '项目已被其他窗口修改',
                details: { expectedRevision: 1, currentRevision: 2 },
                requestId: 'req-legacy-409',
            },
            message: '项目已被其他窗口修改',
            code: 'REVISION_CONFLICT',
            data: { expectedRevision: 1, currentRevision: 2 },
            requestId: 'req-legacy-409',
        });
    });

    it('hides internal messages, codes, stacks, and details', async () => {
        const app = createErrorApp(() => Object.assign(new Error('private connection string'), {
            code: 'ECONNREFUSED',
            details: { host: 'private-db' },
        }));

        const response = await request(app).get('/failure').expect(500);

        assert.equal(response.body.error.code, 'INTERNAL_SERVER_ERROR');
        assert.equal(response.body.error.message, '服务器内部错误');
        assert.equal(response.body.error.details, undefined);
        assert.equal(response.body.stack, undefined);
    });

    it('replaces unsafe caller-supplied request IDs', async () => {
        const app = createErrorApp(() => Object.assign(new Error('参数错误'), {
            status: 422,
            expose: true,
        }));

        const response = await request(app)
            .get('/failure')
            .set('x-request-id', 'unsafe request id')
            .expect(422);

        assert.notEqual(response.headers['x-request-id'], 'unsafe request id');
        assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/i);
        assert.equal(response.body.error.code, 'VALIDATION_FAILED');
    });
});

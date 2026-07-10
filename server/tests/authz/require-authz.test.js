import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createRequireAuthz } from '../../src/middleware/require-authz.js';
import { errorHandler } from '../../src/middleware/error-handler.js';

function testApp({ authz, authContext = { userId: 'u-1', orgId: 'org-1', role: 'user' } }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authContext = authContext;
    next();
  });
  const requireAuthz = createRequireAuthz({ authz });
  app.get('/admin/identity-center', requireAuthz({ surface: 'admin', moduleId: 'identity-center' }), (_req, res) => {
    res.json({ success: true });
  });
  app.get('/ops/design-requests', requireAuthz({ surface: 'ops', moduleId: 'design-requests', scope: 'race' }), (_req, res) => {
    res.json({ success: true });
  });
  app.get('/admin/orgs', requireAuthz({ surface: 'admin', moduleId: 'orgs', scope: 'platform' }), (_req, res) => {
    res.json({ success: true });
  });
  app.use(errorHandler);
  return app;
}

describe('requireAuthz middleware', () => {
  it('checks surface entry and module access for an admin module', async () => {
    const calls = [];
    const app = testApp({
      authz: {
        async assert(authContext, request) {
          calls.push({ authContext, request });
          return true;
        },
      },
    });

    const response = await request(app).get('/admin/identity-center?orgId=org-1');

    assert.equal(response.status, 200);
    assert.deepEqual(calls.map((call) => call.request), [
      { relation: 'can_enter', object: 'surface:org-1/admin' },
      { relation: 'can_open', object: 'module:org-1/admin/identity-center' },
    ]);
  });

  it('uses race scope for execution modules', async () => {
    const calls = [];
    const app = testApp({
      authz: {
        async assert(authContext, request) {
          calls.push(request);
          return true;
        },
      },
    });

    const response = await request(app).get('/ops/design-requests?orgId=org-1&raceId=1001');

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      { relation: 'can_enter', object: 'surface:race-1001/ops' },
      { relation: 'can_open', object: 'module:race-1001/ops/design-requests' },
    ]);
  });

  it('uses platform scope for platform administration modules', async () => {
    const calls = [];
    const app = testApp({
      authContext: { userId: 'u-super', orgId: null, role: 'super_admin' },
      authz: {
        async assert(_authContext, request) {
          calls.push(request);
          return true;
        },
      },
    });

    const response = await request(app).get('/admin/orgs');

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      { relation: 'can_enter', object: 'surface:platform-root/admin' },
      { relation: 'can_open', object: 'module:platform-root/admin/orgs' },
    ]);
  });

  it('passes denied access to the shared error handler', async () => {
    const app = testApp({
      authz: {
        async assert() {
          const err = new Error('无权访问该资源');
          err.status = 403;
          err.expose = true;
          throw err;
        },
      },
    });

    const response = await request(app).get('/admin/identity-center?orgId=org-1');

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
    assert.equal(response.body.message, '无权访问该资源');
  });
});

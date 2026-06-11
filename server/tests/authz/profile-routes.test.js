import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createAuthzRoutes } from '../../src/modules/authz/authz.routes.js';
import { errorHandler } from '../../src/middleware/error-handler.js';

describe('authz profile routes', () => {
  it('returns the current authorization profile', async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.authContext = { userId: 'u-1', orgId: 'org-1', role: 'user' };
      next();
    });
    app.use('/api/authz', createAuthzRoutes({
      buildProfile: async ({ authContext, requestedOrgId, requestedRaceId }) => ({
        orgId: requestedOrgId || authContext.orgId,
        raceId: requestedRaceId || null,
        surfaces: ['app'],
        modules: ['app:home', 'app:profile'],
        workspaceScopes: [{ scopeType: 'org', orgId: 'org-1', raceId: null }],
      }),
    }));
    app.use(errorHandler);

    const response = await request(app).get('/api/authz/profile?orgId=org-1');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      success: true,
      data: {
        orgId: 'org-1',
        raceId: null,
        surfaces: ['app'],
        modules: ['app:home', 'app:profile'],
        workspaceScopes: [{ scopeType: 'org', orgId: 'org-1', raceId: null }],
      },
    });
  });

  it('passes authorization errors to the shared error handler', async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.authContext = { userId: 'u-1', orgId: 'org-1', role: 'user' };
      next();
    });
    app.use('/api/authz', createAuthzRoutes({
      buildProfile: async () => {
        const err = new Error('无权访问该工作区');
        err.status = 403;
        err.expose = true;
        throw err;
      },
    }));
    app.use(errorHandler);

    const response = await request(app).get('/api/authz/profile?orgId=org-2');

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
    assert.equal(response.body.message, '无权访问该工作区');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthzService } from '../../src/authz/authz.service.js';

describe('authz service', () => {
  it('uses the local provider for development and tests', async () => {
    const authz = createAuthzService({
      provider: 'local',
      tuples: [
        { user: 'user:u-1', relation: 'member', object: 'organization:org-1' },
        { user: 'organization:org-1#member', relation: 'granted', object: 'surface:org-1/app' },
      ],
    });

    assert.equal(
      await authz.check({ userId: 'u-1', relation: 'can_enter', object: 'surface:org-1/app' }),
      true,
    );
  });

  it('throws a 403-style error from assert when access is denied', async () => {
    const authz = createAuthzService({ provider: 'local', tuples: [] });

    await assert.rejects(
      () => authz.assert({ userId: 'u-1' }, { relation: 'can_enter', object: 'surface:org-1/admin' }),
      (err) => err.status === 403 && err.expose === true && err.message === '无权访问该资源',
    );
  });

  it('requires OpenFGA configuration when provider is openfga', () => {
    assert.throws(
      () => createAuthzService({ provider: 'openfga', openfgaConfig: {} }),
      /OpenFGA config missing: apiUrl, storeId, authorizationModelId/,
    );
  });

  it('refuses unpinned OpenFGA decisions', () => {
    assert.throws(
      () => createAuthzService({
        provider: 'openfga',
        openfgaConfig: {
          apiUrl: 'http://127.0.0.1:8080',
          storeId: 'store-1',
        },
      }),
      /authorizationModelId/,
    );
  });

  it('maps check, listObjects, and writeTuples to the OpenFGA client', async () => {
    const calls = [];
    const client = {
      async check(body, options) {
        calls.push(['check', body, options]);
        return { allowed: true };
      },
      async listObjects(body, options) {
        calls.push(['listObjects', body, options]);
        return { objects: ['module:org-1/app/design-requests'] };
      },
      async write(body, options) {
        calls.push(['write', body, options]);
        return {};
      },
    };
    const authz = createAuthzService({
      provider: 'openfga',
      openfgaConfig: {
        apiUrl: 'http://127.0.0.1:8080',
        storeId: 'store-1',
        authorizationModelId: 'model-1',
      },
      client,
    });

    assert.equal(await authz.check({ userId: 'u-1', relation: 'can_open', object: 'module:org-1/app/design-requests' }), true);
    assert.deepEqual(
      await authz.listObjects({ userId: 'u-1', relation: 'can_open', type: 'module' }),
      ['module:org-1/app/design-requests'],
    );
    await authz.writeTuples({
      writes: [{ user: 'user:u-1', relation: 'granted', object: 'module:org-1/app/design-requests' }],
      deletes: [{ user: 'user:u-1', relation: 'granted', object: 'module:org-1/admin/design-requests' }],
    });

    assert.deepEqual(calls, [
      [
        'check',
        { user: 'user:u-1', relation: 'can_open', object: 'module:org-1/app/design-requests' },
        { authorizationModelId: 'model-1' },
      ],
      [
        'listObjects',
        { user: 'user:u-1', relation: 'can_open', type: 'module' },
        { authorizationModelId: 'model-1' },
      ],
      [
        'write',
        {
          writes: [{ user: 'user:u-1', relation: 'granted', object: 'module:org-1/app/design-requests' }],
          deletes: [{ user: 'user:u-1', relation: 'granted', object: 'module:org-1/admin/design-requests' }],
        },
        { authorizationModelId: 'model-1' },
      ],
    ]);
  });
});

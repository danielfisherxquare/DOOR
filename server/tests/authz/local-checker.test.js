import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  moduleObjectId,
  organizationObjectId,
  raceObjectId,
  surfaceObjectId,
  userObjectId,
} from '../../src/authz/object-ids.js';
import { createLocalChecker } from '../../src/authz/local-checker.js';

describe('authz object ids', () => {
  it('builds stable OpenFGA object ids for workspace resources', () => {
    assert.equal(userObjectId('u-1'), 'user:u-1');
    assert.equal(organizationObjectId('org-1'), 'organization:org-1');
    assert.equal(raceObjectId(1001), 'race:1001');
    assert.equal(surfaceObjectId({ orgId: 'org-1', surface: 'admin' }), 'surface:org-1/admin');
    assert.equal(surfaceObjectId({ raceId: 1001, surface: 'ops' }), 'surface:race-1001/ops');
    assert.equal(
      moduleObjectId({ orgId: 'org-1', surface: 'app', moduleId: 'design-requests' }),
      'module:org-1/app/design-requests',
    );
    assert.equal(
      moduleObjectId({ raceId: 1001, surface: 'ops', moduleId: 'scan' }),
      'module:race-1001/ops/scan',
    );
  });
});

describe('local OpenFGA checker', () => {
  it('allows organization admins to enter granted admin surface', async () => {
    const checker = createLocalChecker({
      tuples: [
        { user: 'user:u-admin', relation: 'admin', object: 'organization:org-1' },
        { user: 'organization:org-1#admin', relation: 'granted', object: 'surface:org-1/admin' },
      ],
    });

    assert.equal(
      await checker.check({ user: 'user:u-admin', relation: 'can_enter', object: 'surface:org-1/admin' }),
      true,
    );
  });

  it('requires both surface entry and module grant before opening a module', async () => {
    const checker = createLocalChecker({
      tuples: [
        { user: 'user:u-designer', relation: 'member', object: 'organization:org-1' },
        { user: 'organization:org-1#member', relation: 'granted', object: 'surface:org-1/app' },
        { user: 'surface:org-1/app', relation: 'parent_surface', object: 'module:org-1/app/design-requests' },
        { user: 'user:u-designer', relation: 'granted', object: 'module:org-1/app/design-requests' },
        { user: 'surface:org-1/admin', relation: 'parent_surface', object: 'module:org-1/admin/design-requests' },
        { user: 'user:u-designer', relation: 'granted', object: 'module:org-1/admin/design-requests' },
      ],
    });

    assert.equal(
      await checker.check({ user: 'user:u-designer', relation: 'can_open', object: 'module:org-1/app/design-requests' }),
      true,
    );
    assert.equal(
      await checker.check({ user: 'user:u-designer', relation: 'can_open', object: 'module:org-1/admin/design-requests' }),
      false,
    );
  });

  it('allows race operators to enter race-scoped ops surface', async () => {
    const checker = createLocalChecker({
      tuples: [
        { user: 'organization:org-1', relation: 'parent', object: 'race:1001' },
        { user: 'user:u-operator', relation: 'operator', object: 'race:1001' },
        { user: 'race:1001#operator', relation: 'granted', object: 'surface:race-1001/ops' },
      ],
    });

    assert.equal(
      await checker.check({ user: 'user:u-operator', relation: 'can_enter', object: 'surface:race-1001/ops' }),
      true,
    );
    assert.equal(
      await checker.check({ user: 'user:u-operator', relation: 'can_enter', object: 'surface:org-1/admin' }),
      false,
    );
  });

  it('lists only objects granted through the requested relation', async () => {
    const checker = createLocalChecker({
      tuples: [
        { user: 'user:u-designer', relation: 'member', object: 'organization:org-1' },
        { user: 'organization:org-1#member', relation: 'granted', object: 'surface:org-1/app' },
        { user: 'surface:org-1/app', relation: 'parent_surface', object: 'module:org-1/app/design-requests' },
        { user: 'user:u-designer', relation: 'granted', object: 'module:org-1/app/design-requests' },
        { user: 'surface:org-1/admin', relation: 'parent_surface', object: 'module:org-1/admin/identity-center' },
        { user: 'organization:org-1#admin', relation: 'granted', object: 'module:org-1/admin/identity-center' },
      ],
    });

    assert.deepEqual(
      await checker.listObjects({ user: 'user:u-designer', relation: 'can_open', type: 'module' }),
      ['module:org-1/app/design-requests'],
    );
  });
});

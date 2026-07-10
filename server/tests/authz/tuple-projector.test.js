import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectAuthzTuples } from '../../src/authz/tuple-projector.js';

function tupleKey(tuple) {
  return `${tuple.user}|${tuple.relation}|${tuple.object}`;
}

function tupleSet(tuples) {
  return new Set(tuples.map(tupleKey));
}

describe('authz tuple projector', () => {
  it('projects roles into organization relations without global module bypass', () => {
    const tuples = projectAuthzTuples({
      organizations: [{ id: 'org-1' }],
      users: [{ id: 'u-admin', org_id: 'org-1', role: 'org_admin' }],
      races: [],
      userRacePermissions: [],
      orgRacePermissions: [],
      userModuleAccess: [],
    });
    const set = tupleSet(tuples);

    assert.equal(set.has('user:u-admin|admin|organization:org-1'), true);
    assert.equal(set.has('organization:org-1#admin|granted|surface:org-1/admin'), true);
    assert.equal(set.has('organization:org-1#admin|granted|module:org-1/admin/finance'), false);
  });

  it('projects default modules as explicit module grants', () => {
    const tuples = projectAuthzTuples({
      organizations: [{ id: 'org-1' }],
      users: [{ id: 'u-user', org_id: 'org-1', role: 'user' }],
      races: [],
      userRacePermissions: [],
      orgRacePermissions: [],
      userModuleAccess: [],
    });
    const set = tupleSet(tuples);

    assert.equal(set.has('user:u-user|member|organization:org-1'), true);
    assert.equal(set.has('user:u-user|granted|surface:org-1/app'), true);
    assert.equal(set.has('surface:org-1/app|parent_surface|module:org-1/app/home'), true);
    assert.equal(set.has('user:u-user|granted|module:org-1/app/home'), true);
    assert.equal(set.has('surface:org-1/app|parent_surface|module:org-1/app/profile'), true);
    assert.equal(set.has('user:u-user|granted|module:org-1/app/profile'), true);
  });

  it('projects platform admins with app defaults and governance modules', () => {
    const tuples = projectAuthzTuples({
      organizations: [{ id: 'org-1' }],
      users: [{ id: 'u-super', org_id: null, role: 'super_admin' }],
      races: [],
      userRacePermissions: [],
      orgRacePermissions: [],
      userModuleAccess: [],
    });
    const set = tupleSet(tuples);

    assert.equal(set.has('user:u-super|admin|platform:root'), true);
    assert.equal(set.has('user:u-super|granted|surface:platform-root/admin'), true);
    assert.equal(set.has('surface:platform-root/admin|parent_surface|module:platform-root/admin/orgs'), true);
    assert.equal(set.has('user:u-super|granted|module:platform-root/admin/orgs'), true);
    assert.equal(set.has('platform:root|parent_platform|organization:org-1'), true);
    assert.equal(set.has('organization:org-1#platform_admin|granted|surface:org-1/admin'), true);
    assert.equal(set.has('user:u-super|granted|module:org-1/app/home'), true);
    assert.equal(set.has('user:u-super|granted|module:org-1/app/profile'), true);
    assert.equal(set.has('user:u-super|granted|module:org-1/admin/identity-center'), true);
    assert.equal(set.has('user:u-super|granted|module:org-1/admin/finance'), true);
    assert.equal(set.has('user:u-super|granted|module:org-1/admin/credentials'), true);
  });

  it('projects platform admins into race-scoped execution modules without forcing org-operation ops', () => {
    const tuples = projectAuthzTuples({
      organizations: [{ id: 'org-1' }],
      users: [{ id: 'u-super', org_id: null, role: 'super_admin' }],
      races: [{ id: 1001, org_id: 'org-1' }],
      userRacePermissions: [],
      orgRacePermissions: [],
      userModuleAccess: [],
    });
    const set = tupleSet(tuples);

    assert.equal(set.has('user:u-super|granted|module:race-1001/ops/scan'), true);
    assert.equal(set.has('user:u-super|granted|module:race-1001/ops/warehouse'), true);
    assert.equal(set.has('organization:org-1#platform_admin|manager|race:1001'), true);
    assert.equal(set.has('user:u-super|granted|module:org-1/ops/scan'), false);
  });

  it('projects race_admin role defaults into race-scoped ops module tuples', () => {
    const tuples = projectAuthzTuples({
      organizations: [{ id: 'org-1' }],
      users: [{ id: 'u-race-admin', org_id: 'org-1', role: 'race_admin' }],
      races: [{ id: 1001, org_id: 'org-1' }],
      userRacePermissions: [{ user_id: 'u-race-admin', org_id: 'org-1', race_id: 1001, access_level: 'editor' }],
      orgRacePermissions: [],
      userModuleAccess: [],
    });
    const set = tupleSet(tuples);

    assert.equal(set.has('organization:org-1|parent|race:1001'), true);
    assert.equal(set.has('user:u-race-admin|manager|race:1001'), true);
    assert.equal(set.has('user:u-race-admin|granted|surface:race-1001/ops'), true);
    assert.equal(set.has('surface:race-1001/ops|parent_surface|module:race-1001/ops/scan'), true);
    assert.equal(set.has('user:u-race-admin|granted|module:race-1001/ops/scan'), true);
    assert.equal(set.has('user:u-race-admin|granted|module:org-1/admin/dashboard'), false);
  });

  it('projects user_module_access into direct module grants', () => {
    const tuples = projectAuthzTuples({
      organizations: [{ id: 'org-1' }],
      users: [{ id: 'u-designer', org_id: 'org-1', role: 'user' }],
      races: [],
      userRacePermissions: [],
      orgRacePermissions: [],
      userModuleAccess: [
        { user_id: 'u-designer', org_id: 'org-1', module_id: 'app:design-requests' },
      ],
    });
    const set = tupleSet(tuples);

    assert.equal(set.has('user:u-designer|granted|surface:org-1/app'), true);
    assert.equal(set.has('surface:org-1/app|parent_surface|module:org-1/app/design-requests'), true);
    assert.equal(set.has('user:u-designer|granted|module:org-1/app/design-requests'), true);
  });

  it('projects organization-scoped ops grants into races the user can access', () => {
    const tuples = projectAuthzTuples({
      organizations: [{ id: 'org-1' }],
      users: [{ id: 'u-operator', org_id: 'org-1', role: 'user' }],
      races: [
        { id: 1001, org_id: 'org-1' },
        { id: 1002, org_id: 'org-1' },
      ],
      userRacePermissions: [
        { user_id: 'u-operator', org_id: 'org-1', race_id: 1001, access_level: 'viewer' },
      ],
      orgRacePermissions: [],
      userModuleAccess: [
        { user_id: 'u-operator', org_id: 'org-1', module_id: 'ops:warehouse' },
      ],
    });
    const set = tupleSet(tuples);

    assert.equal(set.has('user:u-operator|granted|surface:race-1001/ops'), true);
    assert.equal(set.has('user:u-operator|granted|module:race-1001/ops/warehouse'), true);
    assert.equal(set.has('user:u-operator|granted|module:race-1002/ops/warehouse'), false);
    assert.equal(set.has('user:u-operator|granted|module:org-1/ops/warehouse'), false);
  });
});

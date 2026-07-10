import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildAuthzProfileFromRows } from '../../src/authz/profile.service.js';
import { ALL_MODULES, listAllModuleIds } from '../../src/modules/module-access/module-access.registry.js';
import { buildSurfaceAccess, hasAllModuleAccess } from '../../src/utils/capability-policy.js';

const ORG_ID = 'org-matrix';
const RACE_ID = 'race-matrix';

const ROWS = {
  organizations: [{ id: ORG_ID, name: '矩阵机构', slug: 'matrix-org' }],
  races: [{ id: RACE_ID, org_id: ORG_ID, name: '矩阵赛事' }],
  users: [
    { id: 'u-super', org_id: null, role: 'super_admin' },
    { id: 'u-org-admin', org_id: ORG_ID, role: 'org_admin' },
    { id: 'u-race-admin', org_id: ORG_ID, role: 'race_admin' },
    { id: 'u-user', org_id: ORG_ID, role: 'user' },
  ],
  userRacePermissions: [
    { user_id: 'u-race-admin', org_id: ORG_ID, race_id: RACE_ID, access_level: 'editor' },
    { user_id: 'u-user', org_id: ORG_ID, race_id: RACE_ID, access_level: 'viewer' },
  ],
  orgRacePermissions: [],
  userModuleAccess: [],
};

const ROLE_USER_IDS = {
  super_admin: 'u-super',
  org_admin: 'u-org-admin',
  race_admin: 'u-race-admin',
  user: 'u-user',
};

const APP_DEFAULTS = ['app:home', 'app:profile'];
const RACE_ADMIN_APP = [...APP_DEFAULTS, 'app:map'];
const RACE_ADMIN_OPS = ['ops:home', 'ops:bib-pickup', 'ops:scan'];
const ORG_ADMIN_MODULES = [
  ...APP_DEFAULTS,
  'admin:dashboard',
  'admin:identity-center',
  'admin:members',
  'admin:team',
  'admin:races',
  'admin:design-requests',
];

function moduleIdsFor(...surfaces) {
  return surfaces.flatMap((surface) => ALL_MODULES[surface].map((item) => item.id));
}

function sorted(values) {
  return [...values].sort();
}

async function profileFor(role, scopeType) {
  return buildAuthzProfileFromRows({
    authContext: {
      userId: ROLE_USER_IDS[role],
      orgId: role === 'super_admin' ? null : ORG_ID,
      role,
    },
    requestedOrgId: scopeType === 'platform' ? undefined : ORG_ID,
    requestedRaceId: scopeType === 'race' ? RACE_ID : undefined,
    rows: ROWS,
  });
}

const EXPECTED_MATRIX = [
  {
    role: 'super_admin',
    scopeType: 'platform',
    surfaces: ['app', 'ops', 'admin'],
    modules: listAllModuleIds(),
  },
  {
    role: 'super_admin',
    scopeType: 'org',
    surfaces: ['app', 'admin'],
    modules: moduleIdsFor('app', 'admin'),
  },
  {
    role: 'super_admin',
    scopeType: 'race',
    surfaces: ['app', 'ops', 'admin'],
    modules: listAllModuleIds(),
  },
  {
    role: 'org_admin',
    scopeType: 'org',
    surfaces: ['app', 'admin'],
    modules: ORG_ADMIN_MODULES,
  },
  {
    role: 'org_admin',
    scopeType: 'race',
    surfaces: ['app', 'admin'],
    modules: ORG_ADMIN_MODULES,
  },
  {
    role: 'race_admin',
    scopeType: 'org',
    surfaces: ['app'],
    modules: RACE_ADMIN_APP,
  },
  {
    role: 'race_admin',
    scopeType: 'race',
    surfaces: ['app', 'ops'],
    modules: [...RACE_ADMIN_APP, ...RACE_ADMIN_OPS],
  },
  {
    role: 'user',
    scopeType: 'org',
    surfaces: ['app'],
    modules: APP_DEFAULTS,
  },
  {
    role: 'user',
    scopeType: 'race',
    surfaces: ['app'],
    modules: APP_DEFAULTS,
  },
];

describe('authorization behavior matrix', () => {
  for (const entry of EXPECTED_MATRIX) {
    it(`characterizes ${entry.role} in ${entry.scopeType} workspace`, async () => {
      const profile = await profileFor(entry.role, entry.scopeType);

      assert.equal(profile.scopeType, entry.scopeType);
      assert.deepEqual(sorted(profile.surfaces), sorted(entry.surfaces));
      assert.deepEqual(sorted(profile.modules), sorted(entry.modules));

      for (const moduleId of listAllModuleIds()) {
        assert.equal(
          profile.modules.includes(moduleId),
          entry.modules.includes(moduleId),
          `${entry.role}/${entry.scopeType}/${moduleId}`,
        );
      }
    });
  }

  it('documents that legacy role policy is broader than workspace authorization', async () => {
    const orgAdminProfile = await profileFor('org_admin', 'org');
    const superAdminOrgProfile = await profileFor('super_admin', 'org');

    assert.equal(buildSurfaceAccess('org_admin').ops, true);
    assert.equal(orgAdminProfile.surfaces.includes('ops'), false);
    assert.equal(hasAllModuleAccess('org_admin'), true);
    assert.notEqual(orgAdminProfile.modules.length, listAllModuleIds().length);

    assert.equal(buildSurfaceAccess('super_admin').ops, true);
    assert.equal(superAdminOrgProfile.surfaces.includes('ops'), false);
  });
});

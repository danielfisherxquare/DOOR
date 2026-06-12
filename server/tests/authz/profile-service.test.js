import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthzProfileFromRows } from '../../src/authz/profile.service.js';

describe('authz profile service', () => {
  it('returns a platform profile for super admins without requiring organization context', async () => {
    const profile = await buildAuthzProfileFromRows({
      authContext: { userId: 'u-super', orgId: null, role: 'super_admin' },
      rows: {
        organizations: [
          { id: 'org-1', name: '中奥资源' },
          { id: 'org-2', name: '合作机构' },
        ],
        users: [{ id: 'u-super', org_id: null, role: 'super_admin' }],
        races: [{ id: 1001, org_id: 'org-1', name: '测试赛事' }],
        userRacePermissions: [],
        orgRacePermissions: [],
        userModuleAccess: [],
      },
    });

    assert.equal(profile.scopeType, 'platform');
    assert.equal(profile.orgId, null);
    assert.equal(profile.raceId, null);
    assert.deepEqual(profile.surfaces, ['app', 'ops', 'admin']);
    assert.equal(profile.modules.includes('app:home'), true);
    assert.equal(profile.modules.includes('app:design-requests'), true);
    assert.equal(profile.modules.includes('ops:home'), true);
    assert.equal(profile.modules.includes('ops:scan'), true);
    assert.equal(profile.modules.includes('ops:warehouse'), true);
    assert.equal(profile.modules.includes('admin:dashboard'), true);
    assert.equal(profile.modules.includes('admin:orgs'), true);
    assert.equal(profile.modules.includes('admin:identity-center'), true);
    assert.equal(profile.modules.includes('admin:finance'), true);
    assert.equal(profile.modules.includes('admin:credentials'), true);
    assert.deepEqual(profile.workspaceScopes, [
      {
        scopeType: 'platform',
        orgId: null,
        orgName: '系统平台',
        raceId: null,
        raceName: null,
      },
    ]);
  });

  it('returns only explicitly granted app modules for a scoped user', async () => {
    const profile = await buildAuthzProfileFromRows({
      authContext: { userId: 'u-designer', orgId: 'org-1', role: 'user' },
      requestedOrgId: 'org-1',
      rows: {
        organizations: [{ id: 'org-1', name: '中奥资源' }],
        users: [{ id: 'u-designer', org_id: 'org-1', role: 'user' }],
        races: [],
        userRacePermissions: [],
        orgRacePermissions: [],
        userModuleAccess: [
          { user_id: 'u-designer', org_id: 'org-1', module_id: 'app:design-requests' },
        ],
      },
    });

    assert.deepEqual(profile.surfaces, ['app']);
    assert.equal(profile.modules.includes('app:home'), true);
    assert.equal(profile.modules.includes('app:profile'), true);
    assert.equal(profile.modules.includes('app:design-requests'), true);
    assert.equal(profile.modules.includes('admin:identity-center'), false);
    assert.equal(profile.modules.includes('ops:scan'), false);
  });

  it('does not return ops modules for an org admin without execution grants', async () => {
    const profile = await buildAuthzProfileFromRows({
      authContext: { userId: 'u-admin', orgId: 'org-1', role: 'org_admin' },
      requestedOrgId: 'org-1',
      rows: {
        organizations: [{ id: 'org-1', name: '中奥资源' }],
        users: [{ id: 'u-admin', org_id: 'org-1', role: 'org_admin' }],
        races: [{ id: 1001, org_id: 'org-1', name: '测试赛事' }],
        userRacePermissions: [],
        orgRacePermissions: [],
        userModuleAccess: [],
      },
    });

    assert.deepEqual(profile.surfaces, ['app', 'admin']);
    assert.equal(profile.modules.includes('admin:identity-center'), true);
    assert.equal(profile.modules.includes('ops:scan'), false);
  });

  it('returns race-scoped ops modules for a race admin in the selected race', async () => {
    const profile = await buildAuthzProfileFromRows({
      authContext: { userId: 'u-race-admin', orgId: 'org-1', role: 'race_admin' },
      requestedOrgId: 'org-1',
      requestedRaceId: '1001',
      rows: {
        organizations: [{ id: 'org-1', name: '中奥资源' }],
        users: [{ id: 'u-race-admin', org_id: 'org-1', role: 'race_admin' }],
        races: [{ id: 1001, org_id: 'org-1', name: '测试赛事' }],
        userRacePermissions: [
          { user_id: 'u-race-admin', org_id: 'org-1', race_id: 1001, access_level: 'editor' },
        ],
        orgRacePermissions: [],
        userModuleAccess: [],
      },
    });

    assert.equal(profile.surfaces.includes('ops'), true);
    assert.equal(profile.modules.includes('ops:scan'), true);
    assert.equal(profile.modules.includes('ops:bib-pickup'), true);
    assert.equal(profile.modules.includes('admin:identity-center'), false);
  });

  it('denies a requested organization outside the user context', async () => {
    await assert.rejects(
      () => buildAuthzProfileFromRows({
        authContext: { userId: 'u-user', orgId: 'org-1', role: 'user' },
        requestedOrgId: 'org-2',
        rows: {
          organizations: [{ id: 'org-1' }, { id: 'org-2' }],
          users: [{ id: 'u-user', org_id: 'org-1', role: 'user' }],
          races: [],
          userRacePermissions: [],
          orgRacePermissions: [],
          userModuleAccess: [],
        },
      }),
      (err) => err.status === 403 && err.expose === true,
    );
  });
});

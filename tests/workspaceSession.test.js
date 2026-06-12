import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createWorkspaceSession,
  getAvailableWorkspaceSurfaces,
  normalizeWorkspaceOptions,
  ORG_OPERATION_SCOPE_VALUE,
  PLATFORM_SCOPE_VALUE,
  PLATFORM_WORKSPACE_ID,
  parseWorkspaceSession,
  resolveWorkspaceSwitchRedirect,
  resolveWorkspaceFromLegacyContext,
  serializeWorkspaceSession,
} from '../src/features/workspace/workspaceSession.js'

describe('workspace session', () => {
  it('stores org, race, surface, and last paths in one object', () => {
    const session = createWorkspaceSession({
      orgId: 'org-1',
      orgName: '中奥资源',
      raceId: 'race-1',
      raceName: '测试赛事',
      surface: 'app',
    })

    assert.equal(session.orgId, 'org-1')
    assert.equal(session.orgName, '中奥资源')
    assert.equal(session.raceId, 'race-1')
    assert.equal(session.raceName, '测试赛事')
    assert.equal(session.scopeType, 'race')
    assert.equal(session.surface, 'app')
    assert.equal(session.lastAppPath, '/app')
    assert.equal(session.lastOpsPath, '/ops')
    assert.equal(session.lastAdminPath, '/admin')
  })

  it('uses legacy query only as migration input', () => {
    const session = resolveWorkspaceFromLegacyContext({
      queryOrgId: 'org-url',
      queryRaceId: 'race-url',
      user: { preferences: { lastOrgId: 'org-pref', lastRaceId: 'race-pref' } },
    })

    assert.equal(session.orgId, 'org-url')
    assert.equal(session.raceId, 'race-url')
  })

  it('restores matching user preferences when legacy query is absent', () => {
    const session = resolveWorkspaceFromLegacyContext({
      user: { preferences: { lastOrgId: 'org-pref', lastRaceId: 'race-pref' } },
    })

    assert.equal(session.orgId, 'org-pref')
    assert.equal(session.raceId, 'race-pref')
  })

  it('serializes and parses a valid session', () => {
    const session = createWorkspaceSession({ orgId: 1, raceId: 2, surface: 'ops' })

    assert.deepEqual(parseWorkspaceSession(serializeWorkspaceSession(session)), {
      orgId: '1',
      orgName: '',
      raceId: '2',
      raceName: '',
      scopeType: 'race',
      surface: 'ops',
      lastAppPath: '/app',
      lastOpsPath: '/ops',
      lastAdminPath: '/admin',
    })
  })

  it('serializes and parses an organization operation workspace without a race', () => {
    const session = createWorkspaceSession({
      orgId: 'org-1',
      orgName: '中奥资源',
      scopeType: 'org',
      surface: 'app',
    })

    assert.deepEqual(parseWorkspaceSession(serializeWorkspaceSession(session)), {
      orgId: 'org-1',
      orgName: '中奥资源',
      raceId: '',
      raceName: '',
      scopeType: 'org',
      surface: 'app',
      lastAppPath: '/app',
      lastOpsPath: '/ops',
      lastAdminPath: '/admin',
    })
  })

  it('serializes and parses a platform workspace without organization or race context', () => {
    const session = createWorkspaceSession({
      scopeType: 'platform',
      surface: 'admin',
    })

    assert.deepEqual(parseWorkspaceSession(serializeWorkspaceSession(session)), {
      orgId: '',
      orgName: '系统平台',
      raceId: '',
      raceName: '',
      scopeType: 'platform',
      surface: 'admin',
      lastAppPath: '/app',
      lastOpsPath: '/ops',
      lastAdminPath: '/admin',
    })
  })

  it('parses a zustand-persisted workspace session', () => {
    const persisted = JSON.stringify({
      state: {
        session: createWorkspaceSession({
          orgId: 'org-1',
          orgName: '中奥资源',
          scopeType: 'org',
          surface: 'admin',
        }),
      },
      version: 0,
    })

    assert.deepEqual(parseWorkspaceSession(persisted), {
      orgId: 'org-1',
      orgName: '中奥资源',
      raceId: '',
      raceName: '',
      scopeType: 'org',
      surface: 'admin',
      lastAppPath: '/app',
      lastOpsPath: '/ops',
      lastAdminPath: '/admin',
    })
  })

  it('rejects empty or malformed persisted sessions', () => {
    assert.equal(parseWorkspaceSession(''), null)
    assert.equal(parseWorkspaceSession('{"raceId":"race-1"}'), null)
    assert.equal(parseWorkspaceSession('{"scopeType":"org"}'), null)
    assert.equal(parseWorkspaceSession('{bad json'), null)
  })

  it('normalizes super admin workspace options with a platform control scope first', () => {
    const options = normalizeWorkspaceOptions({
      role: 'super_admin',
      current: { scopeType: 'platform' },
      organizations: [{ id: 'org-1', name: '中奥资源' }],
      races: [{ raceId: 11, raceName: '测试赛事 A', orgId: 'org-1' }],
    })

    assert.equal(options.current.orgId, PLATFORM_WORKSPACE_ID)
    assert.equal(options.current.scopeType, 'platform')
    assert.equal(options.organizations[0].id, PLATFORM_WORKSPACE_ID)
    assert.equal(options.organizations[0].name, '系统平台')
    assert.deepEqual(options.organizations[0].scopes.map((scope) => scope.id), [PLATFORM_SCOPE_VALUE])
    assert.deepEqual(options.organizations[1].scopes.map((scope) => scope.id), [ORG_OPERATION_SCOPE_VALUE, '11'])
  })

  it('normalizes context options into organizations with races', () => {
    const options = normalizeWorkspaceOptions({
      current: { orgId: 1, raceId: 11 },
      organizations: [
        { id: 1, name: '中奥资源' },
        { id: 2, name: '合作机构' },
      ],
      races: [
        { raceId: 11, raceName: '测试赛事 A', orgId: 1 },
        { id: 22, name: '测试赛事 B', orgId: 2 },
      ],
    })

    assert.equal(options.current.orgId, '1')
    assert.equal(options.current.raceId, '11')
    assert.deepEqual(options.organizations.map((org) => org.races.map((race) => race.id)), [['11'], ['22']])
    assert.deepEqual(options.organizations[0].scopes.map((scope) => scope.id), [ORG_OPERATION_SCOPE_VALUE, '11'])
    assert.equal(options.organizations[0].scopes[0].scopeType, 'org')
    assert.equal(options.organizations[0].scopes[1].scopeType, 'race')
  })

  it('returns only surfaces the user can access', () => {
    const surfaces = getAvailableWorkspaceSurfaces({
      surfaceAccess: { app: true, ops: false, admin: true },
    })

    assert.deepEqual(surfaces.map((surface) => surface.key), ['app', 'admin'])
  })

  it('does not infer available surfaces from role alone', () => {
    assert.deepEqual(getAvailableWorkspaceSurfaces({ role: 'super_admin' }).map((surface) => surface.key), [])
    assert.deepEqual(getAvailableWorkspaceSurfaces({ role: 'org_admin' }).map((surface) => surface.key), [])
  })

  it('returns the launcher after a multi-surface user switches workspace inside a surface', () => {
    const redirect = resolveWorkspaceSwitchRedirect({
      currentPath: '/app/events/import',
      user: { surfaceAccess: { app: true, ops: true, admin: true } },
    })

    assert.equal(redirect, '/launcher')
  })

  it('keeps single-surface users on their current surface after switching workspace', () => {
    const redirect = resolveWorkspaceSwitchRedirect({
      currentPath: '/app/events/import',
      user: { surfaceAccess: { app: true, ops: false, admin: false } },
    })

    assert.equal(redirect, '/app/events/import')
  })
})

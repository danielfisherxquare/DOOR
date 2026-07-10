import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getAdminNavGroups } from '../../src/components/admin/adminConfig.js'
import { getAppNavGroups } from '../../src/components/app/appConfig.js'
import { getOpsNavGroups } from '../../src/components/ops/opsConfig.js'
import {
  createWorkspaceSession,
  getAvailableWorkspaceSurfaces,
} from '../../src/features/workspace/workspaceSession.js'
import { hasModuleAccess } from '../../src/utils/moduleAccess.js'
import { ALL_MODULES, listAllModuleIds } from '../../server/src/modules/module-access/module-access.registry.js'

const APP_DEFAULTS = ['app:home', 'app:profile']
const RACE_ADMIN_APP = [...APP_DEFAULTS, 'app:map']
const RACE_ADMIN_OPS = ['ops:home', 'ops:bib-pickup', 'ops:scan']
const ORG_ADMIN_MODULES = [
  ...APP_DEFAULTS,
  'admin:dashboard',
  'admin:identity-center',
  'admin:members',
  'admin:team',
  'admin:races',
  'admin:design-requests',
]

function moduleIdsFor(...surfaces) {
  return surfaces.flatMap((surface) => ALL_MODULES[surface].map((item) => item.id))
}

const MATRIX = [
  ['super_admin', 'platform', ['app', 'ops', 'admin'], listAllModuleIds()],
  ['super_admin', 'org', ['app', 'admin'], moduleIdsFor('app', 'admin')],
  ['super_admin', 'race', ['app', 'ops', 'admin'], listAllModuleIds()],
  ['org_admin', 'org', ['app', 'admin'], ORG_ADMIN_MODULES],
  ['org_admin', 'race', ['app', 'admin'], ORG_ADMIN_MODULES],
  ['race_admin', 'org', ['app'], RACE_ADMIN_APP],
  ['race_admin', 'race', ['app', 'ops'], [...RACE_ADMIN_APP, ...RACE_ADMIN_OPS]],
  ['user', 'org', ['app'], APP_DEFAULTS],
  ['user', 'race', ['app'], APP_DEFAULTS],
]

function userFor(role, scopeType, surfaces, modules) {
  const profile = {
    scopeType,
    orgId: scopeType === 'platform' ? null : 'org-matrix',
    raceId: scopeType === 'race' ? 'race-matrix' : null,
    surfaces,
    modules,
  }
  return {
    role,
    moduleAccess: modules,
    authzProfile: profile,
  }
}

function sessionFor(scopeType) {
  return createWorkspaceSession({
    scopeType,
    orgId: scopeType === 'platform' ? '' : 'org-matrix',
    raceId: scopeType === 'race' ? 'race-matrix' : '',
  })
}

function protectedNavModuleIds(surface, groups) {
  return groups.flatMap((group) => group.items
    .map((item) => item.moduleId || group.moduleId || '')
    .filter(Boolean)
    .map((moduleId) => `${surface}:${moduleId}`))
}

function navGroupsFor(surface, user, scopeType) {
  if (surface === 'app') {
    return getAppNavGroups({
      user,
      hasCapability: () => true,
      raceId: scopeType === 'race' ? 'race-matrix' : '',
    })
  }
  if (surface === 'ops') return getOpsNavGroups({ user })
  return getAdminNavGroups({ user, isSuperAdmin: user.role === 'super_admin' })
}

describe('authorization navigation matrix', () => {
  for (const [role, scopeType, surfaces, modules] of MATRIX) {
    it(`shows only authorized surfaces and modules for ${role}/${scopeType}`, () => {
      const user = userFor(role, scopeType, surfaces, modules)
      const session = sessionFor(scopeType)
      const visibleSurfaces = getAvailableWorkspaceSurfaces(user, session).map((item) => item.key)

      assert.deepEqual(visibleSurfaces.sort(), [...surfaces].sort())

      for (const fullModuleId of listAllModuleIds()) {
        const [surface, ...moduleParts] = fullModuleId.split(':')
        assert.equal(
          hasModuleAccess(user, surface, moduleParts.join(':')),
          modules.includes(fullModuleId),
          `${role}/${scopeType}/${fullModuleId}`,
        )
      }

      for (const surface of ['app', 'ops', 'admin']) {
        const navModuleIds = protectedNavModuleIds(surface, navGroupsFor(surface, user, scopeType))
        for (const moduleId of navModuleIds) {
          assert.equal(modules.includes(moduleId), true, `navigation leaked ${moduleId}`)
        }
      }
    })
  }

  it('documents navigation that is narrower than the backend module grant', () => {
    const user = userFor('org_admin', 'org', ['app', 'admin'], ORG_ADMIN_MODULES)
    const navKeys = getAdminNavGroups({ user, isSuperAdmin: false })
      .flatMap((group) => group.items.map((item) => item.key))

    assert.equal(hasModuleAccess(user, 'admin', 'races'), true)
    assert.equal(navKeys.includes('races'), false)
  })
})

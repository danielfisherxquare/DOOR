import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_MODULES, hasModuleAccess } from '../src/utils/moduleAccess.js'
import { getAppNavGroups, getAppPortalCards } from '../src/components/app/appConfig.js'
import { getOpsNavGroups, getOpsPortalCards } from '../src/components/ops/opsConfig.js'
import { listAllModuleIds } from '../server/src/modules/module-access/module-access.registry.js'
import { getRoleDefaultModules } from '../server/src/utils/capability-policy.js'

describe('module access helper', () => {
  it('allows default modules for scoped users', () => {
    const user = { role: 'user', moduleAccess: [] }

    for (const moduleId of DEFAULT_MODULES) {
      const [surface, id] = moduleId.split(':')
      assert.equal(hasModuleAccess(user, surface, id), true)
    }
  })

  it('uses explicit moduleAccess for non-default modules', () => {
    const user = { role: 'race_admin', moduleAccess: ['app:map', 'ops:scan'] }

    assert.equal(hasModuleAccess(user, 'app', 'map'), true)
    assert.equal(hasModuleAccess(user, 'ops', 'scan'), true)
    assert.equal(hasModuleAccess(user, 'admin', 'dashboard'), false)
  })

  it('includes role default modules in backend effective access', () => {
    assert.deepEqual(getRoleDefaultModules('user'), ['app:home', 'app:profile'])

    const raceAdminDefaults = getRoleDefaultModules('race_admin')
    assert.ok(raceAdminDefaults.includes('app:home'))
    assert.ok(raceAdminDefaults.includes('app:profile'))
    assert.ok(raceAdminDefaults.includes('app:map'))
    assert.ok(raceAdminDefaults.includes('ops:home'))
    assert.ok(raceAdminDefaults.includes('ops:bib-pickup'))
    assert.ok(raceAdminDefaults.includes('ops:scan'))
  })

  it('keeps org_admin and super_admin on full access', () => {
    assert.equal(hasModuleAccess({ role: 'org_admin', moduleAccess: [] }, 'admin', 'dashboard'), true)
    assert.equal(hasModuleAccess({ role: 'super_admin', moduleAccess: [] }, 'ops', 'scan'), true)
  })

  it('filters app sidebar groups and home cards by module access', () => {
    const user = { role: 'user', moduleAccess: ['app:home', 'app:profile', 'app:map', 'app:inventory'] }
    const hasCapability = () => true

    const navKeys = getAppNavGroups({ user, hasCapability })
      .flatMap((group) => group.items.map((item) => item.key))
    const portalKeys = getAppPortalCards({ user, hasCapability }).map((item) => item.key)

    assert.ok(navKeys.includes('dashboard'))
    assert.ok(navKeys.includes('map'))
    assert.ok(navKeys.includes('inventory-workbench'))
    assert.ok(navKeys.includes('settings'))

    assert.equal(navKeys.includes('reimbursement'), false)
    assert.equal(navKeys.includes('design-requests'), false)
    assert.equal(navKeys.includes('import'), false)
    assert.equal(navKeys.includes('credential-center'), false)
    assert.equal(portalKeys.includes('reimbursement'), false)
    assert.equal(portalKeys.includes('import'), false)
  })

  it('requires both module access and capability for capability-gated app entries', () => {
    const user = { role: 'user', moduleAccess: ['app:home', 'app:profile', 'app:3d-studio'] }

    const withoutCapability = getAppNavGroups({ user, hasCapability: () => false })
      .flatMap((group) => group.items.map((item) => item.key))
    const withCapability = getAppNavGroups({ user, hasCapability: () => true })
      .flatMap((group) => group.items.map((item) => item.key))

    assert.equal(withoutCapability.includes('three-studio'), false)
    assert.equal(withCapability.includes('three-studio'), true)
  })

  it('filters ops sidebar groups and home cards by module access', () => {
    const user = { role: 'race_admin', moduleAccess: ['app:home', 'app:profile', 'ops:home', 'ops:scan'] }

    const navKeys = getOpsNavGroups({ user })
      .flatMap((group) => group.items.map((item) => item.key))
    const portalKeys = getOpsPortalCards({ user }).map((item) => item.key)

    assert.ok(navKeys.includes('dashboard'))
    assert.ok(navKeys.includes('scan'))
    assert.equal(navKeys.includes('bibs'), false)
    assert.equal(navKeys.includes('credentials'), false)
    assert.equal(navKeys.includes('workbench'), false)
    assert.equal(navKeys.includes('design-requests'), false)
    assert.deepEqual(portalKeys, ['scan'])
  })

  it('registers design-request modules used by protected routes', () => {
    const moduleIds = listAllModuleIds()

    assert.ok(moduleIds.includes('app:design-requests'))
    assert.ok(moduleIds.includes('ops:design-requests'))
  })

  it('does not give org_admin execute modules without explicit access in strict mode', () => {
    const user = {
      role: 'org_admin',
      moduleAccess: ['admin:dashboard'],
      preferences: { strictSurfaceModules: true },
    }

    assert.equal(hasModuleAccess(user, 'ops', 'scan'), false)
    assert.equal(hasModuleAccess(user, 'admin', 'dashboard'), true)
  })

  it('keeps super_admin unrestricted in strict mode', () => {
    const user = {
      role: 'super_admin',
      moduleAccess: [],
      preferences: { strictSurfaceModules: true },
    }

    assert.equal(hasModuleAccess(user, 'ops', 'scan'), true)
    assert.equal(hasModuleAccess(user, 'admin', 'dashboard'), true)
  })
})

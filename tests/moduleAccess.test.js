import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_MODULES, hasModuleAccess } from '../src/utils/moduleAccess.js'
import { getAppNavGroups, getAppPortalCards } from '../src/components/app/appConfig.js'
import { getOpsNavGroups, getOpsPortalCards } from '../src/components/ops/opsConfig.js'
import { getAdminNavGroups } from '../src/components/admin/adminConfig.js'
import { listAllModuleIds } from '../server/src/modules/module-access/module-access.registry.js'
import { getRoleDefaultModules, hasCapability } from '../server/src/utils/capability-policy.js'

describe('module access helper', () => {
  it('requires backend-returned default modules for scoped users', () => {
    const user = { role: 'user', moduleAccess: [] }

    for (const moduleId of DEFAULT_MODULES) {
      const [surface, id] = moduleId.split(':')
      assert.equal(hasModuleAccess(user, surface, id), false)
    }

    assert.equal(hasModuleAccess({ role: 'user', moduleAccess: DEFAULT_MODULES }, 'app', 'home'), true)
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

  it('does not give org_admin or super_admin module access from role alone', () => {
    assert.equal(hasModuleAccess({ role: 'org_admin', moduleAccess: [] }, 'admin', 'dashboard'), false)
    assert.equal(hasModuleAccess({ role: 'super_admin', moduleAccess: [] }, 'ops', 'scan'), false)
    assert.equal(hasModuleAccess({ role: 'org_admin', moduleAccess: ['admin:dashboard'] }, 'admin', 'dashboard'), true)
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

  it('keeps organization-level app entries and hides race-scoped entries without a race context', () => {
    const user = {
      role: 'user',
      moduleAccess: ['app:home', 'app:profile', 'app:events', 'app:design-requests'],
    }
    const hasCapability = () => true

    const orgScopeKeys = getAppNavGroups({ user, hasCapability, raceId: '' })
      .flatMap((group) => group.items.map((item) => item.key))
    const raceScopeKeys = getAppNavGroups({ user, hasCapability, raceId: 'race-1' })
      .flatMap((group) => group.items.map((item) => item.key))

    assert.ok(orgScopeKeys.includes('design-requests'))
    assert.equal(orgScopeKeys.includes('import'), false)
    assert.equal(orgScopeKeys.includes('race-dashboard'), false)
    assert.ok(raceScopeKeys.includes('import'))
    assert.ok(raceScopeKeys.includes('race-dashboard'))
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

  it('lets an explicitly granted race operator use 3D studio without opening it to users', () => {
    assert.equal(hasCapability('race_admin', 'inventory', '3d_studio'), true)
    assert.equal(hasCapability('user', 'inventory', '3d_studio'), false)
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
    assert.ok(moduleIds.includes('admin:design-requests'))
    assert.ok(moduleIds.includes('admin:identity-center'))
    assert.ok(moduleIds.includes('admin:hr'))
    assert.ok(moduleIds.includes('admin:finance'))
    assert.ok(moduleIds.includes('admin:credentials'))
    assert.ok(moduleIds.includes('admin:inventory'))
    assert.ok(moduleIds.includes('admin:branding'))
    assert.ok(moduleIds.includes('admin:backups'))
    assert.ok(moduleIds.includes('admin:bib-tracking'))
  })

  it('does not give org_admin execute modules without explicit access', () => {
    const user = {
      role: 'org_admin',
      moduleAccess: ['admin:dashboard'],
    }

    assert.equal(hasModuleAccess(user, 'ops', 'scan'), false)
    assert.equal(hasModuleAccess(user, 'admin', 'dashboard'), true)
  })

  it('filters admin navigation by backend-returned module access', () => {
    const user = {
      role: 'org_admin',
      moduleAccess: ['admin:dashboard', 'admin:identity-center'],
    }
    const navKeys = getAdminNavGroups({ user, isSuperAdmin: false })
      .flatMap((group) => group.items.map((item) => item.key))

    assert.ok(navKeys.includes('dashboard'))
    assert.ok(navKeys.includes('identity-center'))
    assert.equal(navKeys.includes('team'), false)
    assert.equal(navKeys.includes('design-requests'), false)
  })
})

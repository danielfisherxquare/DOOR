import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getOpsNavGroups } from '../../src/components/ops/opsConfig.js'
import { getAdminNavGroups } from '../../src/components/admin/adminConfig.js'
import { getAppNavGroups, getAppRouteMeta } from '../../src/components/app/appConfig.js'
import { ADMIN_ROUTE_REGISTRY } from '../../src/routes/adminRouteRegistry.js'
import { APP_ROUTE_REGISTRY } from '../../src/routes/appRouteRegistry.js'
import { OPS_ROUTE_REGISTRY } from '../../src/routes/opsRouteRegistry.js'

function navigationItems(groups) {
  return groups.flatMap((group) => group.items.map((item) => ({ group, item })))
}

function routePathForNavigation(path) {
  if (path === '') return ''
  return path.replace(/^\//, '')
}

describe('surface route registries', () => {
  it('maps every OPS navigation entry to exactly one route and module', () => {
    const navEntries = navigationItems(getOpsNavGroups({ user: null, includeUnauthorized: true }))
    const routeEntries = OPS_ROUTE_REGISTRY.filter((route) => route.componentKey)

    for (const { group, item } of navEntries) {
      const expectedPath = routePathForNavigation(item.path)
      const matches = routeEntries.filter((route) => (
        route.routePath === expectedPath || route.routePath === `${expectedPath}/*`
      ))
      assert.equal(matches.length, 1, `OPS navigation ${item.key} must map to one route`)
      assert.equal(matches[0].moduleId, item.moduleId || group.moduleId)
    }
  })

  it('keeps OPS route keys and component paths unique', () => {
    const routeEntries = OPS_ROUTE_REGISTRY.filter((route) => route.componentKey)
    assert.equal(new Set(routeEntries.map((route) => route.key)).size, routeEntries.length)
    assert.equal(new Set(routeEntries.map((route) => route.routePath)).size, routeEntries.length)
  })

  it('maps every admin navigation entry to exactly one route and module', () => {
    const navEntries = navigationItems(getAdminNavGroups({
      isSuperAdmin: true,
      user: null,
      includeUnauthorized: true,
    }))
    const routeEntries = ADMIN_ROUTE_REGISTRY.filter((route) => route.componentKey)

    for (const { group, item } of navEntries) {
      const expectedPath = routePathForNavigation(item.path)
      const matches = routeEntries.filter((route) => route.routePath === expectedPath)
      assert.equal(matches.length, 1, `admin navigation ${item.key} must map to one route`)
      assert.equal(matches[0].moduleId, item.moduleId || group.moduleId)
    }
  })

  it('keeps admin route keys and component paths unique', () => {
    const routeEntries = ADMIN_ROUTE_REGISTRY.filter((route) => route.componentKey)
    assert.equal(new Set(routeEntries.map((route) => route.key)).size, routeEntries.length)
    assert.equal(new Set(routeEntries.map((route) => route.routePath)).size, routeEntries.length)
  })

  it('maps every app navigation entry to exactly one route and module', () => {
    const navEntries = navigationItems(getAppNavGroups({
      user: null,
      raceId: '',
      includeUnauthorized: true,
    }))

    for (const { group, item } of navEntries) {
      const expectedPath = routePathForNavigation(item.path)
      const matches = APP_ROUTE_REGISTRY.filter((route) => (
        route.routePath === expectedPath || route.routePath === `${expectedPath}/*`
      ))
      assert.equal(matches.length, 1, `app navigation ${item.key} must map to one route`)
      assert.equal(matches[0].moduleId, item.moduleId || group.moduleId || null)
    }
  })

  it('keeps app route keys and component paths unique', () => {
    assert.equal(new Set(APP_ROUTE_REGISTRY.map((route) => route.key)).size, APP_ROUTE_REGISTRY.length)
    assert.equal(new Set(APP_ROUTE_REGISTRY.map((route) => route.routePath)).size, APP_ROUTE_REGISTRY.length)
  })

  it('provides visible metadata for the app profile route', () => {
    assert.equal(getAppRouteMeta('/app/profile').title, '个人资料')
    assert.equal(getAppRouteMeta('/app/profile').groupKey, 'account')
  })
})

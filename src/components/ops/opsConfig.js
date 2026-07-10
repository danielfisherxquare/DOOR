import { buildSurfaceHref } from '../../utils/surfaceContext.js'
import { hasModuleAccess } from '../../utils/moduleAccess.js'
import {
  OPS_ROUTE_GROUPS,
  OPS_ROUTE_REGISTRY,
  listOpsNavigationRoutes,
} from '../../routes/opsRouteRegistry.js'

function hasNavigationModuleAccess(route, user) {
  if (!route.moduleId) return true
  return hasModuleAccess(user, 'ops', route.moduleId)
}

export function getOpsNavGroups(options = {}) {
  const user = options?.user || null
  const includeUnauthorized = options?.includeUnauthorized === true
  const navigationRoutes = listOpsNavigationRoutes()

  return OPS_ROUTE_GROUPS
    .map((group) => ({
      ...group,
      items: navigationRoutes
        .filter((route) => route.groupKey === group.key)
        .filter((route) => includeUnauthorized || hasNavigationModuleAccess(route, user))
        .map((route) => ({
          key: route.key,
          path: route.path,
          moduleId: route.moduleId,
          icon: route.icon,
          shortLabel: route.shortLabel,
          label: route.label,
          description: route.description,
          cardDescription: route.cardDescription,
        })),
    }))
    .filter((group) => group.items.length > 0)
}

export function getOpsRouteMeta(pathname) {
  const sorted = [...OPS_ROUTE_REGISTRY].sort((left, right) => right.path.length - left.path.length)
  return (
    sorted.find((route) => {
      const absolutePath = `/ops${route.path}`
      return route.exact
        ? pathname === absolutePath
        : pathname === absolutePath || pathname.startsWith(`${absolutePath}/`)
    }) || OPS_ROUTE_REGISTRY[0]
  )
}

export function buildOpsHref(routePath, { orgId, raceId } = {}) {
  return buildSurfaceHref(`/ops${routePath}`, { orgId, raceId })
}

export function getOpsPortalCards(options) {
  return getOpsNavGroups(options)
    .flatMap((group) => group.items)
    .filter((item) => item.key !== 'dashboard')
}

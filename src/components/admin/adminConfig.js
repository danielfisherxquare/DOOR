import { buildSurfaceHref } from '../../utils/surfaceContext.js'
import { hasModuleAccess } from '../../utils/moduleAccess.js'
import {
  ADMIN_ROUTE_GROUPS,
  ADMIN_ROUTE_REGISTRY,
  listAdminNavigationRoutes,
} from '../../routes/adminRouteRegistry.js'

function canAccessAdminRoute(route, user) {
  if (!route.moduleId) return true
  return hasModuleAccess(user, 'admin', route.moduleId)
}

export function getAdminNavGroups({ isSuperAdmin, user, includeUnauthorized = false } = {}) {
  const navigationRoutes = listAdminNavigationRoutes()
  return ADMIN_ROUTE_GROUPS
    .filter((group) => !group.superAdminOnly || isSuperAdmin)
    .map((group) => ({
      ...group,
      items: navigationRoutes
        .filter((route) => route.groupKey === group.key)
        .filter((route) => includeUnauthorized || canAccessAdminRoute(route, user))
        .map((route) => ({
          key: route.key,
          path: route.path,
          moduleId: route.moduleId,
          icon: route.icon,
          shortLabel: route.shortLabel,
          label: route.label,
          description: route.description,
        })),
    }))
    .filter((group) => group.items.length > 0)
}

export function getAdminRouteMeta(pathname) {
  const metaRoutes = ADMIN_ROUTE_REGISTRY.filter((route) => route.meta !== false && route.title)
  const sorted = [...metaRoutes].sort((left, right) => right.path.length - left.path.length)
  return (
    sorted.find((route) => {
      const absolutePath = `/admin${route.path}`
      return route.exact
        ? pathname === absolutePath
        : pathname === absolutePath || pathname.startsWith(`${absolutePath}/`)
    }) || ADMIN_ROUTE_REGISTRY[0]
  )
}

export function buildAdminHref(routePath, { selectedOrgId, selectedRaceId } = {}) {
  return buildSurfaceHref(`/admin${routePath}`, { orgId: selectedOrgId, raceId: selectedRaceId })
}

export function buildIdentityCenterHref(view, { selectedOrgId, selectedRaceId } = {}) {
  const params = new URLSearchParams()
  if (selectedOrgId) params.set('orgId', String(selectedOrgId))
  if (selectedRaceId) params.set('raceId', String(selectedRaceId))
  if (view) params.set('view', view)
  const query = params.toString()
  return `/admin/identity-center${query ? `?${query}` : ''}`
}

export function getPriorityShortcuts(context = {}) {
  return [
    { label: '身份中心', path: buildIdentityCenterHref('accounts', context) },
    { label: '授权工作台', path: buildIdentityCenterHref('user-race', context) },
    { label: '证件中心', path: buildAdminHref('/credential-center', context) },
    { label: '报销管理', path: buildAdminHref('/reimbursements', context) },
  ]
}

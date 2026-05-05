import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { buildSurfaceHref } from '../../utils/surfaceContext'

function detectInventorySurface(pathname) {
  if (pathname.startsWith('/ops/')) return 'ops'
  if (pathname.startsWith('/admin/')) return 'admin'
  return 'app'
}

function normalizeInventoryRoutePath(surface, routePath) {
  if (surface !== 'ops' || typeof routePath !== 'string') {
    return routePath
  }

  const opsRouteMap = {
    '/inventory': '/warehouse',
    '/inventory/inbound': '/warehouse/inbound',
    '/inventory/outbound': '/warehouse/outbound',
    '/inventory/space': '/warehouse/binding',
    '/inventory/control': '/warehouse/count',
    '/inventory/analytics': '/warehouse/count',
  }

  return opsRouteMap[routePath] || routePath
}

export function buildInventorySurfaceHref(surface, routePath, { orgId, raceId, params } = {}) {
  const normalizedRoutePath = normalizeInventoryRoutePath(surface, routePath)
  const href = buildSurfaceHref(`/${surface}${normalizedRoutePath}`, { orgId, raceId })
  if (!params || typeof params !== 'object') return href

  const [pathname, search = ''] = href.split('?')
  const nextParams = new URLSearchParams(search)

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      nextParams.delete(key)
      return
    }
    nextParams.set(key, String(value))
  })

  const query = nextParams.toString()
  return `${pathname}${query ? `?${query}` : ''}`
}

export function useInventorySurface() {
  const location = useLocation()

  return useMemo(() => {
    const surface = detectInventorySurface(location.pathname)
    return {
      surface,
      buildHref: (routePath, options = {}) => buildInventorySurfaceHref(surface, routePath, options),
    }
  }, [location.pathname])
}

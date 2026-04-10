import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { buildSurfaceHref } from '../../../utils/surfaceContext'

function detectCredentialSurface(pathname) {
  if (pathname.startsWith('/admin/')) return 'admin'
  if (pathname.startsWith('/ops/')) return 'ops'
  return 'app'
}

export function useCredentialSurface() {
  const location = useLocation()

  return useMemo(() => {
    const surface = detectCredentialSurface(location.pathname)

    return {
      surface,
      buildHref: (routePath, { orgId, raceId } = {}) => (
        buildSurfaceHref(`/${surface}${routePath}`, { orgId, raceId })
      ),
    }
  }, [location.pathname])
}

import { useMemo } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import useAuthStore from '../../../stores/authStore'
import useWorkspaceStore from '../../../features/workspace/workspaceStore'
import { createCredentialApi } from '../../../api/credential'
import {
  buildSurfaceHref,
  resolveSurfaceOrgId,
  resolveSurfaceRaceId,
} from '../../../utils/surfaceContext'

function detectCredentialSurface(pathname) {
  if (pathname.startsWith('/admin/')) return 'admin'
  if (pathname.startsWith('/ops/')) return 'ops'
  return 'app'
}

export function useCredentialSurface() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const user = useAuthStore((state) => state.user)
  const session = useWorkspaceStore((state) => state.session)
  const orgId = resolveSurfaceOrgId(searchParams, user, session)
  const raceId = resolveSurfaceRaceId(searchParams, user, orgId, session)

  return useMemo(() => {
    const surface = detectCredentialSurface(location.pathname)

    return {
      surface,
      orgId,
      raceId,
      credentialApi: createCredentialApi(surface),
      buildHref: (routePath, { orgId, raceId } = {}) => (
        buildSurfaceHref(`/${surface}${routePath}`, { orgId, raceId })
      ),
    }
  }, [location.pathname, orgId, raceId])
}

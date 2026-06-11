import { useCallback, useEffect, useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import useWorkspaceStore from './workspaceStore'
import { createWorkspaceSession, resolveWorkspaceSwitchRedirect } from './workspaceSession'

function cleanLegacySearch(searchParams) {
  const nextParams = new URLSearchParams(searchParams)
  nextParams.delete('orgId')
  nextParams.delete('raceId')
  return nextParams
}

export default function useSurfaceWorkspace(surface) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const session = useWorkspaceStore((state) => state.session)
  const setWorkspaceSession = useWorkspaceStore((state) => state.setWorkspaceSession)
  const rememberSurfacePath = useWorkspaceStore((state) => state.rememberSurfacePath)
  const user = useAuthStore((state) => state.user)

  const legacyOrgId = searchParams.get('orgId') || ''
  const legacyRaceId = searchParams.get('raceId') || ''

  useEffect(() => {
    if (!legacyOrgId && !legacyRaceId) return

    setWorkspaceSession(createWorkspaceSession({
      ...session,
      orgId: legacyOrgId || session?.orgId || '',
      raceId: legacyRaceId || session?.raceId || '',
      surface,
    }))
    setSearchParams(cleanLegacySearch(searchParams), { replace: true })
  }, [legacyOrgId, legacyRaceId, searchParams, session, setSearchParams, setWorkspaceSession, surface])

  useEffect(() => {
    if (!session?.orgId) return
    rememberSurfacePath(surface, location.pathname)
  }, [location.pathname, rememberSurfacePath, session?.orgId, surface])

  const selectedOrgId = session?.orgId || legacyOrgId || ''
  const selectedRaceId = session?.raceId || legacyRaceId || ''

  const currentContext = useMemo(() => ({
    orgId: selectedOrgId,
    raceId: selectedRaceId,
    selectedOrgId,
    selectedRaceId,
  }), [selectedOrgId, selectedRaceId])

  const switchWorkspace = useCallback(() => {
    const target = resolveWorkspaceSwitchRedirect({ currentPath: location.pathname, user })
    const redirect = encodeURIComponent(target)
    navigate(`/workspaces/select?redirect=${redirect}`)
  }, [location.pathname, navigate, user])

  return {
    session,
    selectedOrgId,
    selectedRaceId,
    currentContext,
    switchWorkspace,
    workspaceMissing: !selectedOrgId,
  }
}

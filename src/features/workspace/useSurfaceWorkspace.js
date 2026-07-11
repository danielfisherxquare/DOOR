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

    const nextSession = createWorkspaceSession({
      ...session,
      orgId: legacyOrgId || session?.orgId || '',
      raceId: legacyRaceId || session?.raceId || '',
      scopeType: legacyRaceId ? 'race' : session?.scopeType,
      surface,
    })
    const sessionAlreadyMatches = session?.orgId === nextSession.orgId
      && session?.raceId === nextSession.raceId
      && session?.scopeType === nextSession.scopeType
      && session?.surface === nextSession.surface

    if (!sessionAlreadyMatches) setWorkspaceSession(nextSession)
    setSearchParams(cleanLegacySearch(searchParams), { replace: true })
  }, [
    legacyOrgId,
    legacyRaceId,
    searchParams,
    session,
    setSearchParams,
    setWorkspaceSession,
    surface,
  ])

  useEffect(() => {
    const hasPlatformProfile = user?.role === 'super_admin' && user?.authzProfile?.scopeType === 'platform'
    if (surface !== 'admin' || !hasPlatformProfile || session?.scopeType === 'platform' || legacyOrgId || legacyRaceId) return

    setWorkspaceSession(createWorkspaceSession({
      scopeType: 'platform',
      surface: 'admin',
      lastAdminPath: location.pathname || '/admin',
    }))
  }, [legacyOrgId, legacyRaceId, location.pathname, session?.scopeType, setWorkspaceSession, surface, user])

  useEffect(() => {
    if (!session?.orgId && session?.scopeType !== 'platform') return
    rememberSurfacePath(surface, location.pathname)
  }, [location.pathname, rememberSurfacePath, session?.orgId, session?.scopeType, surface])

  const selectedOrgId = session?.orgId || legacyOrgId || ''
  const selectedRaceId = session?.raceId || legacyRaceId || ''
  const isPlatformScope = session?.scopeType === 'platform'

  const currentContext = useMemo(() => ({
    orgId: selectedOrgId,
    raceId: selectedRaceId,
    selectedOrgId,
    selectedRaceId,
    scopeType: isPlatformScope ? 'platform' : (selectedRaceId ? 'race' : 'org'),
  }), [isPlatformScope, selectedOrgId, selectedRaceId])

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
    workspaceMissing: !selectedOrgId && !(surface === 'admin' && isPlatformScope),
  }
}

import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useWorkspaceStore from '../features/workspace/workspaceStore'
import {
  canAccessWorkspaceSurface,
  canCommitWorkspaceProfile,
  getWorkspaceProfileKey,
  getWorkspaceProfileRefreshParams,
} from '../features/workspace/workspaceSession'

const EMPTY_PROFILE_REFRESH = {
  key: '',
  userKey: '',
  status: 'idle',
  profile: null,
}

function AccessLoadingState({ surface }) {
  return (
    <div className={`layout--${surface} tectonic-access-state`}>
      <div className="tectonic-access-state__content">
        <div className="tectonic-access-state__spinner" aria-hidden="true" />
        <p className="tectonic-access-state__copy">正在校验当前入口权限…</p>
      </div>
    </div>
  )
}

function SurfaceProtectedRoute({ surface, children }) {
  const { isAuthenticated, isBootstrapping, user, refreshAuthzProfile } = useAuthStore()
  const session = useWorkspaceStore((state) => state.session)
  const location = useLocation()
  const userKey = user?.id || user?.userId || user?.username || ''
  const profileRefreshParams = useMemo(
    () => getWorkspaceProfileRefreshParams(session),
    [session?.orgId, session?.raceId, session?.scopeType],
  )
  const profileKey = useMemo(
    () => getWorkspaceProfileKey(session),
    [session?.orgId, session?.raceId, session?.scopeType],
  )
  const [profileRefresh, setProfileRefresh] = useState(EMPTY_PROFILE_REFRESH)
  const profileRefreshMatches = profileRefresh.key === profileKey && profileRefresh.userKey === userKey
  const refreshedProfile = profileRefreshMatches && profileRefresh.status === 'ready'
    ? profileRefresh.profile
    : null
  const routeUser = refreshedProfile ? { ...user, authzProfile: refreshedProfile } : user
  const hasWorkspaceProfile = canCommitWorkspaceProfile(routeUser?.authzProfile, session)
  const isProfileRefreshPending = profileRefreshMatches && profileRefresh.status === 'pending'
  const didProfileRefreshFail = profileRefreshMatches && profileRefresh.status === 'failed'
  const shouldRefreshProfile = Boolean(
    isAuthenticated
    && !isBootstrapping
    && !user?.mustChangePassword
    && profileRefreshParams
    && profileKey
    && !hasWorkspaceProfile
    && !isProfileRefreshPending
    && !didProfileRefreshFail,
  )

  useEffect(() => {
    if (!shouldRefreshProfile) return undefined

    setProfileRefresh({
      key: profileKey,
      userKey,
      status: 'pending',
      profile: null,
    })

    refreshAuthzProfile(profileRefreshParams)
      .then((profile) => {
        setProfileRefresh((current) => {
          if (current.key !== profileKey || current.userKey !== userKey || current.status !== 'pending') {
            return current
          }
          return {
            key: profileKey,
            userKey,
            status: canCommitWorkspaceProfile(profile, session) ? 'ready' : 'failed',
            profile: profile || null,
          }
        })
      })
      .catch(() => {
        setProfileRefresh((current) => {
          if (current.key !== profileKey || current.userKey !== userKey || current.status !== 'pending') {
            return current
          }
          return {
            key: profileKey,
            userKey,
            status: 'failed',
            profile: null,
          }
        })
      })

    return undefined
  }, [
    profileKey,
    profileRefreshParams,
    refreshAuthzProfile,
    session,
    shouldRefreshProfile,
    userKey,
  ])

  if (isBootstrapping) {
    return <AccessLoadingState surface={surface} />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (user?.mustChangePassword && location.pathname !== '/app/settings') {
    return <Navigate to="/app/settings" replace />
  }

  if (shouldRefreshProfile || isProfileRefreshPending) {
    return <AccessLoadingState surface={surface} />
  }

  if (!canAccessWorkspaceSurface({ user: routeUser, session, surface })) {
    return (
      <div className={`layout--${surface} tectonic-access-state`}>
        <div className="tectonic-access-state__content">
          <div className="tectonic-access-state__icon">!</div>
          <h2 className="tectonic-access-state__title">权限不足</h2>
          <p className="tectonic-access-state__copy">当前账号没有访问该入口的权限。</p>
          <a href={user?.defaultSurface === 'admin' ? '/admin' : user?.defaultSurface === 'ops' ? '/ops' : '/app'} className="btn btn--primary">返回首页</a>
        </div>
      </div>
    )
  }

  return children
}

export default SurfaceProtectedRoute

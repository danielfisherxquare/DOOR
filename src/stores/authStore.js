import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import authApi from '../api/auth'
import { parseWorkspaceSession } from '../features/workspace/workspaceSession'

const WORKSPACE_SESSION_STORAGE_KEY = 'workspace-session'

function getSurfacePath(surface) {
  switch (surface) {
    case 'admin':
      return '/admin'
    case 'ops':
      return '/ops'
    case 'app':
    default:
      return '/app'
  }
}

function surfaceAccessFromProfile(profile) {
  const surfaces = Array.isArray(profile?.surfaces) ? profile.surfaces : []
  return surfaces.reduce((result, surface) => {
    result[surface] = true
    return result
  }, {})
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== ''
}

function toId(value) {
  return hasValue(value) ? String(value) : ''
}

function getUserOrgId(user) {
  return toId(user?.orgId || user?.org?.id || user?.organization?.id)
}

function readPersistedWorkspaceSession() {
  if (typeof window === 'undefined' || !window.localStorage) return null
  return parseWorkspaceSession(window.localStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY))
}

function getProfileOrgId(user, overrideOrgId, scopeType) {
  if (user?.role === 'super_admin' && scopeType === 'platform') return ''
  if (hasValue(overrideOrgId)) return toId(overrideOrgId)

  const workspaceSession = readPersistedWorkspaceSession()
  if (user?.role === 'super_admin' && workspaceSession?.scopeType === 'platform') return ''
  if (user?.role === 'super_admin') return ''

  const userOrgId = getUserOrgId(user)
  if (
    workspaceSession?.orgId
    && (!userOrgId || userOrgId === workspaceSession.orgId)
  ) {
    return workspaceSession.orgId
  }

  return toId(user?.preferences?.lastOrgId || userOrgId)
}

function getProfileRaceId(user, overrideRaceId, targetOrgId) {
  if (overrideRaceId !== undefined && overrideRaceId !== null) return toId(overrideRaceId)

  const workspaceSession = readPersistedWorkspaceSession()
  if (
    workspaceSession?.raceId
    && (!targetOrgId || workspaceSession.orgId === toId(targetOrgId))
  ) {
    return workspaceSession.raceId
  }

  return toId(user?.preferences?.lastRaceId)
}

function mergeAuthzProfile(user, profile) {
  if (!user || !profile) return user
  const surfaceAccess = surfaceAccessFromProfile(profile)
  const surfaces = Array.isArray(profile.surfaces) ? profile.surfaces : []
  const defaultSurface = surfaces.includes(user.defaultSurface)
    ? user.defaultSurface
    : (surfaces[0] || user.defaultSurface || 'app')

  return {
    ...user,
    defaultSurface,
    surfaceAccess,
    moduleAccess: Array.isArray(profile.modules) ? profile.modules : [],
    authzProfile: profile,
  }
}

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      isBootstrapping: true,
      error: null,

      bootstrapAuth: async () => {
        const token = get().token
        if (!token) {
          set({ isBootstrapping: false })
          return
        }
        try {
          const response = await authApi.getCurrentUser()
          if (response.success) {
            set({
              user: response.data,
              isAuthenticated: true,
            })
            await get().refreshAuthzProfile(response.data?.role === 'super_admin' ? { scopeType: 'platform' } : {})
            set({ isBootstrapping: false, isAuthenticated: true })
          } else {
            set({ isBootstrapping: false, isAuthenticated: false, user: null, token: null, refreshToken: null })
          }
        } catch {
          set({ isBootstrapping: false, isAuthenticated: false, user: null, token: null, refreshToken: null })
        }
      },

      hasRole: (...roles) => roles.includes(get().user?.role),
      canAccessSurface: (surface) => {
        const access = get().user?.surfaceAccess
        if (Array.isArray(access)) return access.includes(surface)
        return Boolean(access?.[surface])
      },
      hasCapability: (scope, capability) => {
        const scoped = get().user?.scopedCapabilities || {}
        return Array.isArray(scoped[scope]) && scoped[scope].includes(capability)
      },
      getDefaultLandingPath: () => {
        const user = get().user
        if (user?.mustChangePassword) {
          return '/app/settings'
        }
        return getSurfacePath(user?.defaultSurface)
      },
      canAccessAdmin: () => get().canAccessSurface('admin'),
      canAccessOps: () => get().canAccessSurface('ops'),
      canAccessApp: () => get().canAccessSurface('app'),

      refreshAuthzProfile: async ({ orgId, raceId, scopeType } = {}) => {
        const user = get().user
        const targetOrgId = getProfileOrgId(user, orgId, scopeType)
        const usesPlatformScope = user?.role === 'super_admin' && !targetOrgId
        if (!targetOrgId && !usesPlatformScope) return null

        try {
          const response = await authApi.getAuthzProfile({
            orgId: usesPlatformScope ? undefined : targetOrgId,
            raceId: usesPlatformScope ? undefined : getProfileRaceId(user, raceId, targetOrgId),
          })
          if (response.success) {
            const nextUser = mergeAuthzProfile(get().user, response.data)
            set({ user: nextUser })
            return response.data
          }
        } catch {
          // Keep the authenticated session usable; route guards still call the backend.
        }
        return null
      },

      login: async (username, password, rememberMe = false) => {
        set({ isLoading: true, error: null })
        try {
          const response = await authApi.login({ login: username, password, rememberMe })
          if (response.success) {
            const { user, accessToken, refreshToken } = response.data
            set({
              user,
              token: accessToken,
              refreshToken,
              isAuthenticated: false,
              isLoading: true,
              error: null,
            })
            await get().refreshAuthzProfile(user.role === 'super_admin' ? { scopeType: 'platform' } : {})
            const refreshedUser = get().user || user
            set({
              user: refreshedUser,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            })
            return {
              success: true,
              mustChangePassword: Boolean(refreshedUser?.mustChangePassword),
              defaultSurface: refreshedUser?.defaultSurface || 'app',
            }
          }
          set({ isLoading: false, error: response.message || '登录失败' })
          return { success: false, error: response.message }
        } catch (error) {
          const errorMessage = error.message || '登录失败，请稍后重试'
          set({ isLoading: false, error: errorMessage })
          return { success: false, error: errorMessage }
        }
      },

      register: async (username, email, password, orgName) => {
        set({ isLoading: true, error: null })
        try {
          const response = await authApi.register({ username, email, password, orgName })
          if (response.success) {
            const { user, accessToken, refreshToken } = response.data
            set({
              user,
              token: accessToken,
              refreshToken,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            })
            return { success: true }
          }
          set({ isLoading: false, error: response.message || '注册失败' })
          return { success: false, error: response.message }
        } catch (error) {
          const errorMessage = error.message || '注册失败，请稍后重试'
          set({ isLoading: false, error: errorMessage })
          return { success: false, error: errorMessage }
        }
      },

      logout: async () => {
        try {
          const { refreshToken } = get()
          await authApi.logout({ refreshToken })
        } catch (_error) {
          // ignore
        }

        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        })
      },

      fetchCurrentUser: async () => {
        try {
          const response = await authApi.getCurrentUser()
          if (response.success) {
            set({ user: response.data })
            await get().refreshAuthzProfile()
            return true
          }
          return false
        } catch {
          return false
        }
      },

      verifyEmail: async (token) => {
        try {
          return await authApi.verifyEmail(token)
        } catch (error) {
          return { success: false, message: error.message }
        }
      },

      forgotPassword: async (email) => {
        set({ isLoading: true, error: null })
        try {
          const response = await authApi.forgotPassword(email)
          set({ isLoading: false })
          return response
        } catch (error) {
          set({ isLoading: false, error: error.message })
          return { success: false, message: error.message }
        }
      },

      resetPassword: async (token, password) => {
        set({ isLoading: true, error: null })
        try {
          const response = await authApi.resetPassword(token, password)
          set({ isLoading: false })
          return response
        } catch (error) {
          set({ isLoading: false, error: error.message })
          return { success: false, message: error.message }
        }
      },

      checkAuth: () => Boolean(get().token),

      clearError: () => set({ error: null }),

      loadPreferences: async () => {
        try {
          const response = await authApi.getPreferences()
          if (response.success) {
            const user = get().user
            set({
              user: user ? { ...user, preferences: response.data } : null,
            })
            return response.data
          }
          return null
        } catch {
          return null
        }
      },

      updatePreferences: async (updates) => {
        try {
          const response = await authApi.updatePreferences(updates)
          if (response.success) {
            const user = get().user
            set({
              user: user ? { ...user, preferences: response.data } : null,
            })
            return response.data
          }
          return null
        } catch {
          return null
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)

export default useAuthStore

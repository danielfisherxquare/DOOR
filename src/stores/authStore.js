import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import authApi from '../api/auth'

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
              isBootstrapping: false,
            })
          } else {
            set({ isBootstrapping: false, isAuthenticated: false, user: null, token: null, refreshToken: null })
          }
        } catch {
          set({ isBootstrapping: false, isAuthenticated: false, user: null, token: null, refreshToken: null })
        }
      },

      hasRole: (...roles) => roles.includes(get().user?.role),
      canAccessSurface: (surface) => Boolean(get().user?.surfaceAccess?.[surface]),
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
              isAuthenticated: true,
              isLoading: false,
              error: null,
            })
            return {
              success: true,
              mustChangePassword: Boolean(user?.mustChangePassword),
              defaultSurface: user?.defaultSurface || 'app',
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

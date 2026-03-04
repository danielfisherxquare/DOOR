import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import authApi from '../api/auth'

const useAuthStore = create(
  persist(
    (set, get) => ({
      // 状态
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      isBootstrapping: true,
      error: null,

      // 启动时恢复会话
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
            set({ isBootstrapping: false, isAuthenticated: false, user: null, token: null })
          }
        } catch {
          set({ isBootstrapping: false, isAuthenticated: false, user: null, token: null })
        }
      },

      // 角色判断
      hasRole: (...roles) => roles.includes(get().user?.role),
      canAccessAdmin: () => ['org_admin', 'super_admin'].includes(get().user?.role),

      // 登录
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
              error: null
            })

            return { success: true }
          } else {
            set({
              isLoading: false,
              error: response.message || '登录失败'
            })
            return { success: false, error: response.message }
          }
        } catch (error) {
          const errorMessage = error.message || '登录失败，请稍后重试'
          set({
            isLoading: false,
            error: errorMessage
          })
          return { success: false, error: errorMessage }
        }
      },

      // 注册
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
              error: null
            })

            return { success: true }
          } else {
            set({
              isLoading: false,
              error: response.message || '注册失败'
            })
            return { success: false, error: response.message }
          }
        } catch (error) {
          const errorMessage = error.message || '注册失败，请稍后重试'
          set({
            isLoading: false,
            error: errorMessage
          })
          return { success: false, error: errorMessage }
        }
      },

      // 登出
      logout: async () => {
        try {
          const { refreshToken } = get()
          await authApi.logout({ refreshToken })
        } catch (error) {
          // 忽略登出错误
        }

        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null
        })
      },

      // 获取当前用户信息
      fetchCurrentUser: async () => {
        try {
          const response = await authApi.getCurrentUser()

          if (response.success) {
            set({ user: response.data })
            return true
          }
          return false
        } catch (error) {
          return false
        }
      },

      // 验证邮箱
      verifyEmail: async (token) => {
        try {
          const response = await authApi.verifyEmail(token)
          return response
        } catch (error) {
          return { success: false, message: error.message }
        }
      },

      // 忘记密码
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

      // 重置密码
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

      // 检查登录状态
      checkAuth: () => {
        const { token } = get()
        return !!token
      },

      // 清除错误
      clearError: () => {
        set({ error: null })
      }
    }),
    {
      name: 'auth-storage', // localStorage key
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
)

export default useAuthStore
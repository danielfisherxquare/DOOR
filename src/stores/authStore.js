import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useAuthStore = create(
  persist(
    (set, get) => ({
      // 状态
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // 登录
      login: async (username, password) => {
        set({ isLoading: true, error: null })
        
        try {
          // TODO: 替换为实际的后台认证接口
          // const response = await authApi.login({ username, password })
          
          // 模拟登录请求
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // 模拟验证（实际项目中应该调用后台API）
          if (username === 'admin' && password === 'admin123') {
            const mockUser = {
              id: 1,
              username: username,
              email: 'admin@example.com',
              avatar: null
            }
            const mockToken = 'mock-jwt-token-' + Date.now()
            
            set({
              user: mockUser,
              token: mockToken,
              isAuthenticated: true,
              isLoading: false,
              error: null
            })
            
            return { success: true }
          } else {
            set({
              isLoading: false,
              error: '用户名或密码错误'
            })
            return { success: false, error: '用户名或密码错误' }
          }
        } catch (error) {
          set({
            isLoading: false,
            error: error.message || '登录失败，请稍后重试'
          })
          return { success: false, error: error.message }
        }
      },

      // 登出
      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null
        })
      },

      // 检查登录状态
      checkAuth: () => {
        const { token } = get()
        if (token) {
          // TODO: 验证 token 是否有效
          // 可以调用后台接口验证 token
          return true
        }
        return false
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
        isAuthenticated: state.isAuthenticated
      })
    }
  )
)

export default useAuthStore
import axios from 'axios'
import useAuthStore from '../stores/authStore'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

request.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }

    const responseData = error.response?.data
    const isHtmlError = typeof responseData === 'string' && responseData.trim().startsWith('<')
    const message =
      responseData?.message ||
      responseData?.error ||
      (isHtmlError ? 'API 返回了 HTML 错误页，请检查后端服务或 Nginx /api 反代配置' : null) ||
      error.message ||
      '请求失败'

    return Promise.reject(new Error(message))
  }
)

export default request

import axios from 'axios'
import useAuthStore from '../stores/authStore'

// TECH DEBT: This function rewrites frontend API paths to match backend routes.
// New API modules should use the correct backend path directly instead of relying on this.
// Do not add new remapping rules. See agent.md "Frontend API Rules" for details.
function remapApiPath(url) {
  if (typeof url !== 'string' || !url.startsWith('/')) return url

  const replacements = [
    [/^\/assessment\/public/, '/public/assessment'],
    [/^\/tools/, '/public/tools'],
    [/^\/interview/, '/admin/interviews'],
    [/^\/projects/, '/admin/projects'],
    [/^\/races/, '/admin/races'],
    [/^\/org/, '/admin/org'],
  ]

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(url)) {
      return url.replace(pattern, replacement)
    }
  }

  return url
}

function isInvalidAuthResponse(error) {
  const status = error.response?.status
  const message = error.response?.data?.message || error.response?.data?.error || ''
  return (
    status === 401 ||
    (status === 404 &&
      typeof message === 'string' &&
      (message.includes('用户不存在') || message.includes('令牌')))
  )
}

function forceLocalLogout() {
  useAuthStore.getState().clearSession()

  try {
    window.localStorage.removeItem('auth-storage')
  } catch {
    // ignore storage cleanup failures
  }

  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}

function extractErrorMessage(error) {
  const responseData = error.response?.data
  const isHtmlError = typeof responseData === 'string' && responseData.trim().startsWith('<')
  return (
    responseData?.message ||
    responseData?.error ||
    (isHtmlError ? 'API 返回了 HTML 错误页，请检查后端服务或 Nginx /api 反代配置' : null) ||
    error.message ||
    '请求失败'
  )
}

function normalizeRequestError(error) {
  const responseData = error.response?.data
  const normalized = new Error(extractErrorMessage(error))
  normalized.name = 'RequestError'
  normalized.status = error.response?.status
  normalized.code = error.code
  normalized.apiCode = responseData?.code || null
  normalized.details = responseData?.data || null
  normalized.response = error.response
  normalized.cause = error
  return normalized
}

/**
 * 为 axios 实例安装统一的请求/响应拦截器
 */
function installInterceptors(instance, tokenSource) {
  instance.interceptors.request.use(
    (config) => {
      config.url = remapApiPath(config.url)
      const token = tokenSource()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      if (!(config.data instanceof FormData) && !config.headers['Content-Type']) {
        config.headers['Content-Type'] = 'application/json'
      }
      return config
    },
    (error) => Promise.reject(error)
  )

  instance.interceptors.response.use(
    (response) => response.data,
    (error) => {
      if (isInvalidAuthResponse(error)) {
        forceLocalLogout()
      }
      return Promise.reject(normalizeRequestError(error))
    }
  )

  return instance
}

const request = installInterceptors(
  axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
    timeout: 30000,
  }),
  () => useAuthStore.getState().token
)

// 用于 OCR 识别等长时间请求的 axios 实例（10 分钟超时）
export const requestWithLongTimeout = installInterceptors(
  axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
    timeout: 600000,
  }),
  () => useAuthStore.getState().token
)

export default request

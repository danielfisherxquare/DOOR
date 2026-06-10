import axios from 'axios'
import useAuthStore from '../stores/authStore'

function remapApiPath(url) {
  if (typeof url !== 'string' || !url.startsWith('/')) return url

  const replacements = [
    [/^\/assessment\/public/, '/public/assessment'],
    [/^\/tools/, '/public/tools'],
    [/^\/interview/, '/admin/interviews'],
    [/^\/projects/, '/admin/projects'],
    [/^\/races/, '/admin/races'],
    [/^\/org/, '/admin/org'],
    [/^\/records/, '/admin/records'],
    [/^\/lottery/, '/admin/lottery'],
    [/^\/audit/, '/admin/audit'],
    [/^\/bib-tracking/, '/admin/bibs'],
    [/^\/bib/, '/admin/bib'],
    [/^\/clothing/, '/admin/clothing'],
    [/^\/pipeline/, '/admin/pipeline'],
    [/^\/column-mappings/, '/admin/column-mappings'],
    [/^\/import-sessions/, '/admin/import-sessions'],
    [/^\/credential/, '/admin/credentials'],
    [/^\/jobs/, '/admin/jobs'],
  ]

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(url)) {
      return url.replace(pattern, replacement)
    }
  }

  return url
}

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000
})

function isInvalidAuthResponse(error) {
  const status = error.response?.status
  const message = error.response?.data?.message || error.response?.data?.error || ''
  return status === 401 || (
    status === 404 &&
    typeof message === 'string' &&
    (message.includes('用户不存在') || message.includes('令牌'))
  )
}

function forceLocalLogout() {
  useAuthStore.setState({
    user: null,
    token: null,
    refreshToken: null,
    isAuthenticated: false,
    error: null,
  })

  try {
    window.localStorage.removeItem('auth-storage')
  } catch {
    // ignore storage cleanup failures
  }

  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}

// 用于 OCR 识别等长时间请求的 axios 实例（10 分钟超时）
export const requestWithLongTimeout = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 600000
})

/**
 * 获取认证 Token（从 request 默认头或 localStorage）
 */
function getAuthToken() {
  // 优先从 request 默认头获取
  const storeToken = request.defaults?.headers?.common?.Authorization
  if (storeToken) {
    return String(storeToken).replace(/^Bearer\s+/i, '')
  }

  // 回退到 localStorage
  try {
    const persisted = JSON.parse(window.localStorage.getItem('auth-storage') || '{}')
    return persisted?.state?.token || ''
  } catch {
    return ''
  }
}

// 为长超时实例添加相同的请求拦截器和响应拦截器
requestWithLongTimeout.interceptors.request.use(
  (config) => {
    config.url = remapApiPath(config.url)
    const token = getAuthToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    // FormData 不需要设置 Content-Type，让浏览器自动设置
    if (!(config.data instanceof FormData) && !config.headers['Content-Type']) {
      config.headers['Content-Type'] = 'application/json'
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 为长超时实例添加响应拦截器，处理 401 错误
requestWithLongTimeout.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (isInvalidAuthResponse(error)) {
      forceLocalLogout()
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

request.interceptors.request.use(
  (config) => {
    config.url = remapApiPath(config.url)
    const token = useAuthStore.getState().token
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

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (isInvalidAuthResponse(error)) {
      forceLocalLogout()
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

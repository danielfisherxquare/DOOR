import axios from 'axios'
import { ApiError, isApiErrorResponse } from '@arcspro/contracts'
import { notifyAuthExpired, readAccessToken } from '../auth/auth-session-adapter.js'

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

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000
})

function isInvalidAuthResponse(error) {
  const status = error.response?.status
  const responseData = error.response?.data
  const message = responseData?.error?.message || responseData?.message || responseData?.error || ''
  return status === 401 || (
    status === 404 &&
    typeof message === 'string' &&
    (message.includes('用户不存在') || message.includes('令牌'))
  )
}

function getRequestId(error) {
  return error.response?.data?.requestId
    || error.response?.headers?.['x-request-id']
    || ''
}

function toApiError(error) {
  const responseData = error.response?.data
  const structuredError = isApiErrorResponse(responseData) ? responseData.error : null
  const isHtmlError = typeof responseData === 'string' && responseData.trim().startsWith('<')
  const legacyError = typeof responseData?.error === 'string' ? responseData.error : null
  const status = Number.isInteger(error.response?.status) ? error.response.status : 0
  const message =
    structuredError?.message
    || responseData?.message
    || legacyError
    || (isHtmlError ? 'API 返回了 HTML 错误页，请检查后端服务或 Nginx /api 反代配置' : null)
    || error.message
    || '请求失败'

  return new ApiError(message, {
    code: structuredError?.code || (status ? `HTTP_${status}` : 'NETWORK_ERROR'),
    status,
    details: structuredError?.details,
    requestId: getRequestId(error),
    cause: error,
  })
}

function handleRequestError(error) {
  if (isInvalidAuthResponse(error)) {
    notifyAuthExpired({
      status: error.response?.status || 0,
      requestId: getRequestId(error),
    })
  }

  return Promise.reject(toApiError(error))
}

// 用于 OCR 识别等长时间请求的 axios 实例（10 分钟超时）
export const requestWithLongTimeout = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 600000
})

// 为长超时实例添加相同的请求拦截器和响应拦截器
requestWithLongTimeout.interceptors.request.use(
  (config) => {
    config.url = remapApiPath(config.url)
    const token = readAccessToken()
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
  handleRequestError,
)

request.interceptors.request.use(
  (config) => {
    config.url = remapApiPath(config.url)
    const token = readAccessToken()
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
  handleRequestError,
)

export default request

import axios from 'axios'
import { notifyAuthExpired, readAccessToken } from '../auth/auth-session-adapter.js'
import { readWorkspaceRequestContext } from '../auth/request-context-adapter.js'
import { toApiError } from './apiResponse.js'

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || '/api'

const request = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000
})

export const requestRaw = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
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

function handleRequestError(error) {
  const apiError = toApiError(error)
  if (isInvalidAuthResponse(error)) {
    notifyAuthExpired({
      status: apiError.status,
      code: apiError.code,
      requestId: apiError.requestId,
    })
  }

  return Promise.reject(apiError)
}

function attachRequestContext(config) {
  const token = readAccessToken()
  const workspace = readWorkspaceRequestContext()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (workspace?.scopeType) {
    config.headers['X-ArcSpro-Scope-Type'] = workspace.scopeType
  }
  if (workspace?.orgId) {
    config.headers['X-ArcSpro-Org-Id'] = workspace.orgId
  }
  if (workspace?.raceId) {
    config.headers['X-ArcSpro-Race-Id'] = workspace.raceId
  }
  if (!(config.data instanceof FormData) && !config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json'
  }
  return config
}

function configureRequestClient(client, { unwrapResponse }) {
  client.interceptors.request.use(
    attachRequestContext,
    (error) => Promise.reject(error),
  )
  client.interceptors.response.use(
    (response) => (unwrapResponse ? response.data : response),
    handleRequestError,
  )
}

// 用于 OCR 识别等长时间请求的 axios 实例（10 分钟超时）
export const requestWithLongTimeout = axios.create({
  baseURL: API_BASE_URL,
  timeout: 600000
})

configureRequestClient(request, { unwrapResponse: true })
configureRequestClient(requestRaw, { unwrapResponse: false })
configureRequestClient(requestWithLongTimeout, { unwrapResponse: true })

export default request

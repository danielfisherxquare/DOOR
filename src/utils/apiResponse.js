import { ApiError, isApiErrorResponse } from '@arcspro/contracts'

export function unwrapData(response) {
  if (response?.data !== undefined) {
    return response.data
  }
  return response
}

export function toApiError(error) {
  if (error instanceof ApiError) return error

  const responseData = error?.response?.data
  const structuredError = isApiErrorResponse(responseData) ? responseData.error : null
  const isHtmlError = typeof responseData === 'string' && responseData.trim().startsWith('<')
  const legacyError = typeof responseData?.error === 'string' ? responseData.error : null
  const status = Number.isInteger(error?.response?.status) ? error.response.status : 0
  const message =
    structuredError?.message ||
    responseData?.error?.message ||
    responseData?.message ||
    legacyError ||
    (isHtmlError ? 'API 返回了 HTML 错误页，请检查后端服务或 Nginx /api 反代配置' : null) ||
    error?.message ||
    '请求失败'
  const requestId =
    structuredError?.requestId ||
    responseData?.requestId ||
    error?.response?.headers?.['x-request-id'] ||
    ''

  return new ApiError(message, {
    code: structuredError?.code || (status ? `HTTP_${status}` : 'NETWORK_ERROR'),
    status,
    details: structuredError?.details,
    requestId,
    cause: error,
  })
}

export function unwrapRecordsQueryResult(response) {
  const data = unwrapData(response)
  if (data && typeof data === 'object') {
    return data
  }
  return { records: [], total: 0 }
}

export function unwrapListData(response, candidateKeys = []) {
  const data = unwrapData(response)
  if (Array.isArray(data)) return data

  const keys = [...candidateKeys, 'data', 'items', 'records', 'results']
  const findList = (payload, depth = 0) => {
    if (Array.isArray(payload)) return payload
    if (!payload || typeof payload !== 'object') return null

    for (const key of keys) {
      if (Array.isArray(payload[key])) return payload[key]
    }

    if (depth < 1 && payload.data && typeof payload.data === 'object') {
      return findList(payload.data, depth + 1)
    }

    return null
  }

  const list = findList(data)
  if (list) return list

  return []
}

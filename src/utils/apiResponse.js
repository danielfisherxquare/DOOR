import { ApiError, isApiErrorResponse } from '@arcspro/contracts'

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

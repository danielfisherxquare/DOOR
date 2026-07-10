function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export const WORKSPACE_SCOPE_TYPES = Object.freeze(['platform', 'org', 'race'])

export function isWorkspaceScopeType(value) {
  return WORKSPACE_SCOPE_TYPES.includes(value)
}

export function createSuccessResponse(data, meta) {
  return meta === undefined
    ? { success: true, data }
    : { success: true, data, meta }
}

export function createErrorResponse({ code, message, details, requestId } = {}) {
  if (typeof code !== 'string' || code.length === 0) {
    throw new TypeError('API error code must be a non-empty string')
  }
  if (typeof message !== 'string' || message.length === 0) {
    throw new TypeError('API error message must be a non-empty string')
  }

  const error = details === undefined
    ? { code, message }
    : { code, message, details }
  const response = { success: false, error, message }

  return requestId ? { ...response, requestId } : response
}

export function isApiErrorResponse(value) {
  return isRecord(value)
    && value.success === false
    && isRecord(value.error)
    && typeof value.error.code === 'string'
    && value.error.code.length > 0
    && typeof value.error.message === 'string'
    && value.error.message.length > 0
}

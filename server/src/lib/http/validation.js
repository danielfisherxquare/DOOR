export function validationError(message = '请求参数校验失败', details, code = 'VALIDATION_ERROR') {
  const error = new Error(message)
  error.status = 400
  error.code = code
  error.expose = true
  if (details !== undefined) error.details = details
  return error
}

export function requireRecord(value, label = '请求体') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError(`${label}必须是对象`)
  }
  return value
}

export function pickFields(value, allowedFields, { label = '请求体' } = {}) {
  const record = requireRecord(value, label)
  const result = {}

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      result[field] = record[field]
    }
  }

  return result
}

export function parseWithSchema(schema, value, options = {}) {
  if (typeof schema?.safeParse !== 'function') {
    throw new TypeError('schema.safeParse must be a function')
  }

  const result = schema.safeParse(value)
  if (result.success) return result.data

  throw validationError(
    options.message || '请求参数校验失败',
    result.error?.issues || result.error,
    options.code || 'VALIDATION_ERROR',
  )
}

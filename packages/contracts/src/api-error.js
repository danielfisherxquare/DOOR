export class ApiError extends Error {
  constructor(message, options = {}) {
    const { cause } = options
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'ApiError'
    this.code = options.code || 'UNKNOWN_ERROR'
    this.status = Number.isInteger(options.status) ? options.status : 0
    this.details = options.details
    this.requestId = options.requestId || ''
  }
}

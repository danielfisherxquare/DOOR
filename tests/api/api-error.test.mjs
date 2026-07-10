import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ApiError } from '@arcspro/contracts'
import { toApiError } from '../../src/utils/apiResponse.js'

function transportError(status, code, details) {
  return Object.assign(new Error(`transport ${status}`), {
    response: {
      status,
      headers: { 'x-request-id': `header-${status}` },
      data: {
        success: false,
        error: {
          code,
          message: `业务错误 ${status}`,
          details,
          requestId: `body-${status}`,
        },
        message: `业务错误 ${status}`,
      },
    },
  })
}

describe('client API errors', () => {
  it('keeps 403, 409, and 422 distinguishable', () => {
    const forbidden = toApiError(transportError(403, 'FORBIDDEN', { surface: 'admin' }))
    const conflict = toApiError(transportError(409, 'CONCURRENT_EXECUTION', { version: 7 }))
    const invalid = toApiError(transportError(422, 'VALIDATION_FAILED', { field: 'email' }))

    assert.ok(forbidden instanceof ApiError)
    assert.deepEqual(
      [forbidden.status, conflict.status, invalid.status],
      [403, 409, 422],
    )
    assert.deepEqual(
      [forbidden.code, conflict.code, invalid.code],
      ['FORBIDDEN', 'CONCURRENT_EXECUTION', 'VALIDATION_FAILED'],
    )
    assert.deepEqual(invalid.details, { field: 'email' })
    assert.equal(forbidden.requestId, 'body-403')
  })

  it('keeps legacy message-only responses usable during migration', () => {
    const cause = Object.assign(new Error('Request failed'), {
      response: {
        status: 404,
        headers: { 'x-request-id': 'legacy-404' },
        data: { success: false, message: '旧接口仍可读取' },
      },
    })

    const error = toApiError(cause)

    assert.equal(error.code, 'HTTP_404')
    assert.equal(error.status, 404)
    assert.equal(error.message, '旧接口仍可读取')
    assert.equal(error.requestId, 'legacy-404')
    assert.equal(error.cause, cause)
  })

  it('does not wrap an ApiError twice', () => {
    const original = new ApiError('已经规范化', { code: 'KNOWN', status: 409 })
    assert.equal(toApiError(original), original)
  })
})

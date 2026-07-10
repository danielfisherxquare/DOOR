import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { sendCreated, sendSuccess } from '../../src/lib/http/response.js'
import { parseWithSchema, pickFields, requireRecord } from '../../src/lib/http/validation.js'

function fakeResponse() {
  return {
    statusCode: null,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

describe('HTTP response helpers', () => {
  it('sends the shared success envelope with optional metadata', () => {
    const res = fakeResponse()

    sendSuccess(res, [{ id: 1 }], { meta: { total: 1 } })

    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, {
      success: true,
      data: [{ id: 1 }],
      meta: { total: 1 },
    })
  })

  it('uses 201 for created resources', () => {
    const res = fakeResponse()

    sendCreated(res, { id: 1 })

    assert.equal(res.statusCode, 201)
    assert.deepEqual(res.body, { success: true, data: { id: 1 } })
  })
})

describe('HTTP validation helpers', () => {
  it('copies only explicitly allowed request fields', () => {
    assert.deepEqual(pickFields({ name: '赛事', role: 'user', isAdmin: true }, ['name', 'role']), {
      name: '赛事',
      role: 'user',
    })
  })

  it('rejects non-object request bodies with a stable API error', () => {
    assert.throws(
      () => requireRecord([], 'body'),
      (error) => error.status === 400 && error.code === 'VALIDATION_ERROR' && error.expose === true,
    )
  })

  it('returns parsed schema data and exposes validation issues', () => {
    const schema = {
      safeParse(value) {
        if (value?.name) return { success: true, data: { name: String(value.name).trim() } }
        return { success: false, error: { issues: [{ path: ['name'], message: 'Required' }] } }
      },
    }

    assert.deepEqual(parseWithSchema(schema, { name: ' 赛事 ' }), { name: '赛事' })
    assert.throws(
      () => parseWithSchema(schema, {}),
      (error) =>
        error.status === 400 &&
        error.code === 'VALIDATION_ERROR' &&
        error.details[0].path[0] === 'name',
    )
  })
})

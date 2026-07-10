import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  configureAuthSessionAdapter,
  resetAuthSessionAdapterForTests,
} from '../../src/auth/auth-session-adapter.js'
import { requestRaw } from '../../src/utils/request.js'

describe('raw API transport', () => {
  let originalAdapter

  beforeEach(() => {
    originalAdapter = requestRaw.defaults.adapter
  })

  afterEach(() => {
    requestRaw.defaults.adapter = originalAdapter
    resetAuthSessionAdapterForTests()
  })

  it('preserves binary response metadata while using the shared auth boundary', async () => {
    configureAuthSessionAdapter({
      getAccessToken: () => 'binary-token',
      onAuthExpired: () => {},
    })

    requestRaw.defaults.adapter = async (config) => ({
      data: new Uint8Array([1, 2, 3]),
      status: 200,
      statusText: 'OK',
      headers: { 'content-disposition': 'attachment; filename="proof.bin"' },
      config,
    })

    const response = await requestRaw.get('/admin/proof', { responseType: 'arraybuffer' })

    assert.deepEqual([...response.data], [1, 2, 3])
    assert.equal(response.headers['content-disposition'], 'attachment; filename="proof.bin"')
    assert.equal(response.config.headers.get('Authorization'), 'Bearer binary-token')
  })
})

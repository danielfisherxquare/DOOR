import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  configureAuthSessionAdapter,
  notifyAuthExpired,
  readAccessToken,
  resetAuthSessionAdapterForTests,
} from '../../src/auth/auth-session-adapter.js'

describe('auth session adapter', () => {
  afterEach(() => {
    resetAuthSessionAdapterForTests()
  })

  it('has inert defaults before the auth store configures it', () => {
    assert.equal(readAccessToken(), '')
    assert.equal(notifyAuthExpired({ status: 401 }), false)
  })

  it('reads the current token without importing the auth store', () => {
    let token = 'token-a'
    configureAuthSessionAdapter({
      getAccessToken: () => token,
      onAuthExpired: () => {},
    })

    assert.equal(readAccessToken(), 'token-a')
    token = 'token-b'
    assert.equal(readAccessToken(), 'token-b')
  })

  it('notifies the configured owner with transport context', () => {
    const notifications = []
    configureAuthSessionAdapter({
      getAccessToken: () => '',
      onAuthExpired: (context) => notifications.push(context),
    })

    const context = { status: 401, requestId: 'req-401' }
    assert.equal(notifyAuthExpired(context), true)
    assert.deepEqual(notifications, [context])
  })

  it('rejects incomplete adapters at the boundary', () => {
    assert.throws(
      () => configureAuthSessionAdapter({ getAccessToken: () => '' }),
      /onAuthExpired must be a function/,
    )
  })
})

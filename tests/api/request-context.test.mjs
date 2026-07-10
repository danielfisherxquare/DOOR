import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  configureRequestContextAdapter,
  readWorkspaceRequestContext,
  resetRequestContextAdapterForTests,
} from '../../src/auth/request-context-adapter.js'
import { requestRaw } from '../../src/utils/request.js'

describe('workspace request context adapter', () => {
  const originalAdapter = requestRaw.defaults.adapter

  afterEach(() => {
    requestRaw.defaults.adapter = originalAdapter
    resetRequestContextAdapterForTests()
  })

  it('has an inert default and validates its owner contract', () => {
    assert.equal(readWorkspaceRequestContext(), null)
    assert.throws(
      () => configureRequestContextAdapter({}),
      /getWorkspaceContext must be a function/,
    )
  })

  it('attaches the selected workspace to every API transport', async () => {
    configureRequestContextAdapter({
      getWorkspaceContext: () => ({ scopeType: 'race', orgId: 'org-1', raceId: 'race-9' }),
    })
    requestRaw.defaults.adapter = async (config) => ({
      data: null,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })

    const response = await requestRaw.get('/ops/warehouse/workbench/overview')

    assert.equal(response.config.headers.get('X-ArcSpro-Scope-Type'), 'race')
    assert.equal(response.config.headers.get('X-ArcSpro-Org-Id'), 'org-1')
    assert.equal(response.config.headers.get('X-ArcSpro-Race-Id'), 'race-9')
  })

  it('omits empty organization and race headers for platform workspaces', async () => {
    configureRequestContextAdapter({
      getWorkspaceContext: () => ({ scopeType: 'platform', orgId: '', raceId: '' }),
    })
    requestRaw.defaults.adapter = async (config) => ({
      data: null,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })

    const response = await requestRaw.get('/admin/system/backups')

    assert.equal(response.config.headers.get('X-ArcSpro-Scope-Type'), 'platform')
    assert.equal(response.config.headers.has('X-ArcSpro-Org-Id'), false)
    assert.equal(response.config.headers.has('X-ArcSpro-Race-Id'), false)
  })
})

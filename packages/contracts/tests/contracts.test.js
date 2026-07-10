import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  ApiError,
  ALL_MODULES,
  RECORD_EXACT_FILTER_FIELDS,
  RECORD_FILTER_FIELDS,
  RECORD_SORT_FIELDS,
  SURFACES,
  WORKSPACE_SCOPE_TYPES,
  createErrorResponse,
  createSuccessResponse,
  isApiErrorResponse,
  isWorkspaceScopeType,
  listAllModuleIds,
} from '../src/index.js'

describe('shared contracts', () => {
  it('defines the three application surfaces and workspace scope types', () => {
    assert.deepEqual(SURFACES, ['app', 'ops', 'admin'])
    assert.deepEqual(WORKSPACE_SCOPE_TYPES, ['platform', 'org', 'race'])
    assert.equal(isWorkspaceScopeType('org'), true)
    assert.equal(isWorkspaceScopeType('organization'), false)
  })

  it('keeps module IDs unique and aligned with their surface', () => {
    const moduleIds = listAllModuleIds()

    assert.equal(moduleIds.length, 32)
    assert.equal(new Set(moduleIds).size, moduleIds.length)
    assert.deepEqual(Object.keys(ALL_MODULES), SURFACES)

    for (const [surface, modules] of Object.entries(ALL_MODULES)) {
      assert.ok(modules.length > 0)
      for (const module of modules) {
        assert.match(module.id, new RegExp(`^${surface}:[a-z0-9-]+$`))
        assert.equal(typeof module.name, 'string')
        assert.equal(typeof module.isDefault, 'boolean')
      }
    }
  })

  it('creates a stable success response without inventing metadata', () => {
    assert.deepEqual(createSuccessResponse({ id: 7 }), {
      success: true,
      data: { id: 7 },
    })
    assert.deepEqual(createSuccessResponse(['a'], { total: 1 }), {
      success: true,
      data: ['a'],
      meta: { total: 1 },
    })
  })

  it('creates a structured error response with migration compatibility', () => {
    assert.deepEqual(
      createErrorResponse({
        code: 'VALIDATION_FAILED',
        message: '字段不合法',
        details: { field: 'email' },
        requestId: 'req-7',
      }),
      {
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: '字段不合法',
          details: { field: 'email' },
          requestId: 'req-7',
        },
        message: '字段不合法',
      },
    )
  })

  it('recognizes structured API errors but rejects legacy and malformed payloads', () => {
    const response = createErrorResponse({ code: 'NOT_FOUND', message: '资源不存在' })

    assert.equal(isApiErrorResponse(response), true)
    assert.equal(isApiErrorResponse({ success: false, message: '旧错误' }), false)
    assert.equal(isApiErrorResponse({ success: false, error: '字符串错误' }), false)
    assert.equal(isApiErrorResponse(null), false)
  })

  it('preserves transport context in ApiError', () => {
    const cause = new Error('socket closed')
    const error = new ApiError('请求失败', {
      code: 'NETWORK_ERROR',
      status: 503,
      details: { retryable: true },
      requestId: 'req-8',
      cause,
    })

    assert.equal(error.name, 'ApiError')
    assert.equal(error.message, '请求失败')
    assert.equal(error.code, 'NETWORK_ERROR')
    assert.equal(error.status, 503)
    assert.deepEqual(error.details, { retryable: true })
    assert.equal(error.requestId, 'req-8')
    assert.equal(error.cause, cause)
  })

  it('shares record filter and sort fields across server and frontend', () => {
    assert.equal(RECORD_FILTER_FIELDS.includes('event'), true)
    assert.equal(RECORD_FILTER_FIELDS.includes('orgId'), false)
    assert.deepEqual(RECORD_EXACT_FILTER_FIELDS, ['phone', 'idNumber'])
    assert.equal(RECORD_SORT_FIELDS.includes('createdAt'), true)
    assert.equal(new Set(RECORD_SORT_FIELDS).size, RECORD_SORT_FIELDS.length)
  })
})

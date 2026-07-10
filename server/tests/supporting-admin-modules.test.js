import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import express from 'express'
import request from 'supertest'

import { createCalendarService } from '../src/modules/calendar/calendar.service.js'
import { createHealthRouter } from '../src/modules/health/health.routes.js'
import {
  parseOperationLogFilters,
  resolveOperationLogOrgId,
} from '../src/modules/operation-log/operation-log.schema.js'
import { sanitizeParams } from '../src/middleware/operation-log.js'

describe('calendar module', () => {
  it('limits organization users to their own calendar rows', async () => {
    const calls = []
    const service = createCalendarService({
      repository: {
        getRaces: async (orgId) => {
          calls.push(['races', orgId])
          return [{ id: 1, title: 'Race', date: '2026-07-10' }]
        },
        getMilestones: async (orgId) => {
          calls.push(['milestones', orgId])
          return [{ id: 2, title: 'Milestone', date: '2026-07-11', race_id: 1 }]
        },
      },
    })

    assert.deepEqual(
      await service.getEvents({ role: 'org_admin', orgId: 'org-1' }, {}),
      [
        { id: 1, title: 'Race', date: '2026-07-10', type: 'race' },
        { id: 2, title: 'Milestone', date: '2026-07-11', race_id: 1, type: 'milestone' },
      ],
    )
    assert.deepEqual(calls, [
      ['races', 'org-1'],
      ['milestones', 'org-1'],
    ])
    await assert.rejects(
      () => service.getEvents({ role: 'org_admin', orgId: 'org-1' }, { orgId: 'org-2' }),
      (error) => error.status === 403,
    )
  })
})

describe('health module', () => {
  it('keeps readiness dependency failures behind a 503 probe response', async () => {
    const app = express()
    app.use(
      '/api/health',
      createHealthRouter({
        checkReadiness: async () => {
          throw new Error('database unavailable')
        },
      }),
    )

    const response = await request(app).get('/api/health/ready')
    assert.equal(response.status, 503)
    assert.deepEqual(response.body, { status: 'error', database: 'disconnected' })
  })
})

describe('operation log module', () => {
  it('normalizes filters and enforces organization scope', () => {
    assert.equal(
      resolveOperationLogOrgId({ role: 'org_admin', orgId: 'org-1' }, { orgId: 'org-1' }),
      'org-1',
    )
    assert.throws(
      () =>
        resolveOperationLogOrgId(
          { role: 'org_admin', orgId: 'org-1' },
          { orgId: 'org-2' },
        ),
      (error) => error.status === 403,
    )
    assert.equal(resolveOperationLogOrgId({ role: 'super_admin' }, {}), null)
    assert.deepEqual(
      parseOperationLogFilters({
        page: '2',
        pageSize: '5000',
        module: ' races ',
        keyword: ' test ',
        ignored: 'forged',
      }),
      { page: 2, pageSize: 200, module: 'races', keyword: 'test' },
    )
  })

  it('redacts nested credentials without mutating the live request body', () => {
    const requestBody = {
      password: 'plain',
      settings: {
        apiKey: 'sk-secret',
        label: 'OCR',
      },
    }
    assert.deepEqual(
      sanitizeParams({ query: { token: 'query-secret' }, body: requestBody }),
      {
        query: { token: '***' },
        body: {
          password: '***',
          settings: { apiKey: '***', label: 'OCR' },
        },
      },
    )
    assert.equal(requestBody.password, 'plain')
    assert.equal(requestBody.settings.apiKey, 'sk-secret')
  })
})

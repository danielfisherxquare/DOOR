import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import express from 'express'
import request from 'supertest'

import { createAuthorization } from '../../src/authz/authorization.js'
import { createAuthorize } from '../../src/middleware/authorize.js'
import { errorHandler } from '../../src/middleware/error-handler.js'

describe('authorization adapter', () => {
  it('maps organization surface and module decisions to relation checks', async () => {
    const calls = []
    const authorization = createAuthorization({
      resolveRelationService: async () => ({
        async assert(authContext, relationRequest) {
          calls.push({ authContext, relationRequest })
        },
      }),
    })

    await authorization.assertAll({ userId: 'u-1', role: 'user' }, [
      {
        action: 'enter',
        resource: { kind: 'surface', surface: 'admin' },
        workspace: { scopeType: 'org', orgId: 'org-1' },
      },
      {
        action: 'open',
        resource: { kind: 'module', surface: 'admin', moduleId: 'identity-center' },
        workspace: { scopeType: 'org', orgId: 'org-1' },
      },
    ])

    assert.deepEqual(
      calls.map((entry) => entry.relationRequest),
      [
        { relation: 'can_enter', object: 'surface:org-1/admin' },
        { relation: 'can_open', object: 'module:org-1/admin/identity-center' },
      ],
    )
  })

  it('maps race-scoped execution decisions to race objects', async () => {
    const calls = []
    const authorization = createAuthorization({
      resolveRelationService: async () => ({
        async assert(_authContext, relationRequest) {
          calls.push(relationRequest)
        },
      }),
    })

    await authorization.assert(
      { userId: 'u-1', role: 'race_admin' },
      'open',
      { kind: 'module', surface: 'ops', moduleId: 'scan' },
      { scopeType: 'race', orgId: 'org-1', raceId: '1001' },
    )

    assert.deepEqual(calls, [{ relation: 'can_open', object: 'module:race-1001/ops/scan' }])
  })

  it('maps platform workspaces and domain resources to relation checks', async () => {
    const calls = []
    const authorization = createAuthorization({
      resolveRelationService: async () => ({
        async assert(_authContext, relationRequest) {
          calls.push(relationRequest)
        },
      }),
    })

    await authorization.assertAll({ userId: 'u-super', role: 'super_admin' }, [
      {
        action: 'open',
        resource: { kind: 'module', surface: 'admin', moduleId: 'orgs' },
        workspace: { scopeType: 'platform' },
      },
      {
        action: 'manage',
        resource: { kind: 'platform' },
        workspace: { scopeType: 'platform' },
      },
      {
        action: 'manage',
        resource: { kind: 'organization' },
        workspace: { scopeType: 'org', orgId: 'org-1' },
      },
      {
        action: 'operate',
        resource: { kind: 'race' },
        workspace: { scopeType: 'race', raceId: '1001' },
      },
    ])

    assert.deepEqual(calls, [
      { relation: 'can_open', object: 'module:platform-root/admin/orgs' },
      { relation: 'can_manage', object: 'platform:root' },
      { relation: 'can_manage', object: 'organization:org-1' },
      { relation: 'can_operate', object: 'race:1001' },
    ])
  })

  it('centralizes session, role, and capability checks behind one seam', async () => {
    const authorization = createAuthorization()
    const authContext = {
      userId: 'u-race-admin',
      role: 'race_admin',
    }

    await authorization.assert(authContext, 'authenticate', { kind: 'session' })
    await authorization.assert(authContext, 'assume', {
      kind: 'role',
      roles: ['race_admin', 'org_admin'],
    })
    await authorization.assert(authContext, 'use', {
      kind: 'capability',
      scope: 'self',
      name: 'operate',
    })
  })

  it('returns stable denial codes from the adapter boundary', async () => {
    const authorization = createAuthorization()

    await assert.rejects(
      () =>
        authorization.assert({ userId: 'u-user', role: 'user' }, 'assume', {
          kind: 'role',
          roles: ['org_admin'],
        }),
      (error) => error.status === 403 && error.code === 'ROLE_DENIED',
    )
  })
})

describe('authorize middleware', () => {
  it('resolves request workspace once and sends all checks to the adapter', async () => {
    const calls = []
    const authorization = {
      async assertAll(authContext, decisions) {
        calls.push({ authContext, decisions })
      },
    }
    const authorize = createAuthorize({ authorization })
    const app = express()
    app.use((req, _res, next) => {
      req.authContext = { userId: 'u-1', role: 'race_admin', orgId: 'org-1' }
      next()
    })
    app.get(
      '/ops/check',
      authorize({
        scope: 'race',
        checks: [
          { action: 'enter', resource: { kind: 'surface', surface: 'ops' } },
          { action: 'open', resource: { kind: 'module', surface: 'ops', moduleId: 'scan' } },
        ],
      }),
      (_req, res) => res.json({ success: true }),
    )
    app.use(errorHandler)

    const response = await request(app).get('/ops/check?raceId=1001')

    assert.equal(response.status, 200)
    assert.deepEqual(calls[0], {
      authContext: { userId: 'u-1', role: 'race_admin', orgId: 'org-1' },
      decisions: [
        {
          action: 'enter',
          resource: { kind: 'surface', surface: 'ops' },
          workspace: { scopeType: 'race', orgId: 'org-1', raceId: '1001' },
        },
        {
          action: 'open',
          resource: { kind: 'module', surface: 'ops', moduleId: 'scan' },
          workspace: { scopeType: 'race', orgId: 'org-1', raceId: '1001' },
        },
      ],
    })
  })

  it('resolves a dynamic platform-or-organization scope from the request', async () => {
    const calls = []
    const authorize = createAuthorize({
      authorization: {
        async assertAll(_authContext, decisions) {
          calls.push(decisions)
        },
      },
    })
    const app = express()
    app.use((req, _res, next) => {
      req.authContext = { userId: 'u-super', role: 'super_admin', orgId: null }
      next()
    })
    app.get(
      '/admin/orgs',
      authorize({
        scope: (req) => (req.query.orgId ? 'org' : 'platform'),
        action: 'open',
        resource: { kind: 'module', surface: 'admin', moduleId: 'orgs' },
      }),
      (_req, res) => res.json({ success: true }),
    )

    assert.equal((await request(app).get('/admin/orgs')).status, 200)
    assert.equal((await request(app).get('/admin/orgs?orgId=org-1')).status, 200)
    assert.deepEqual(calls.map(([decision]) => decision.workspace), [
      { scopeType: 'platform', orgId: null, raceId: null },
      { scopeType: 'org', orgId: 'org-1', raceId: null },
    ])
  })

  it('resolves race workspace context from explicit transport fields before route matching', async () => {
    const calls = []
    const authorize = createAuthorize({
      authorization: {
        async assertAll(_authContext, decisions) {
          calls.push(decisions)
        },
      },
    })
    const app = express()
    app.use((req, _res, next) => {
      req.authContext = { userId: 'u-ops', role: 'race_admin', orgId: 'org-1' }
      next()
    })
    app.use(
      '/ops/warehouse',
      authorize({
        scope: 'race',
        action: 'open',
        resource: { kind: 'module', surface: 'ops', moduleId: 'warehouse' },
      }),
      (_req, res) => res.json({ success: true }),
    )

    const response = await request(app)
      .get('/ops/warehouse/workbench/overview')
      .set('X-ArcSpro-Scope-Type', 'race')
      .set('X-ArcSpro-Org-Id', 'org-1')
      .set('X-ArcSpro-Race-Id', 'race-9')

    assert.equal(response.status, 200)
    assert.deepEqual(calls[0][0].workspace, {
      scopeType: 'race',
      orgId: 'org-1',
      raceId: 'race-9',
    })
  })

})

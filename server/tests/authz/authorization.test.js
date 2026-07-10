import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import express from 'express'
import request from 'supertest'

import { createAuthorization } from '../../src/authz/authorization.js'
import { createAuthorize } from '../../src/middleware/authorize.js'
import { errorHandler } from '../../src/middleware/error-handler.js'
import { createRequirePermission } from '../../src/middleware/require-permission.js'

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

  it('preserves legacy role, capability, surface, and explicit module checks behind one seam', async () => {
    const checkedModules = []
    const authorization = createAuthorization({
      checkUserModuleAccess: async (userId, moduleId) => {
        checkedModules.push([userId, moduleId])
        return moduleId === 'app:reimbursements'
      },
    })
    const authContext = {
      userId: 'u-race-admin',
      role: 'race_admin',
    }

    await authorization.assert(authContext, 'authenticate', { kind: 'session' })
    await authorization.assert(authContext, 'enter', {
      kind: 'surface',
      surface: 'ops',
      policy: 'legacy-role',
    })
    await authorization.assert(authContext, 'assume', {
      kind: 'role',
      roles: ['race_admin', 'org_admin'],
    })
    await authorization.assert(authContext, 'open', {
      kind: 'module',
      surface: 'app',
      moduleId: 'reimbursements',
      policy: 'legacy-role-or-grant',
    })
    await authorization.assert(authContext, 'use', {
      kind: 'capability',
      scope: 'self',
      name: 'operate',
    })

    assert.deepEqual(checkedModules, [['u-race-admin', 'app:reimbursements']])
  })

  it('returns stable denial codes from the adapter boundary', async () => {
    const authorization = createAuthorization({ checkUserModuleAccess: async () => false })

    await assert.rejects(
      () =>
        authorization.assert({ userId: 'u-user', role: 'user' }, 'open', {
          kind: 'module',
          surface: 'admin',
          moduleId: 'finance',
          policy: 'legacy-role-or-grant',
        }),
      (error) => error.status === 403 && error.code === 'MODULE_DENIED',
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

  it('routes legacy permission declarations through the authorization adapter', async () => {
    const calls = []
    const authorization = {
      async assertAll(authContext, decisions) {
        calls.push({ authContext, decisions })
      },
    }
    const requirePermission = createRequirePermission({ authorization })
    const app = express()
    app.use((req, _res, next) => {
      req.authContext = { userId: 'u-1', role: 'org_admin', orgId: 'org-1' }
      next()
    })
    app.get(
      '/legacy',
      requirePermission({
        surface: 'admin',
        roles: ['org_admin'],
        module: { surface: 'admin', moduleId: 'finance' },
        capability: { scope: 'org', name: 'view' },
      }),
      (_req, res) => res.json({ success: true }),
    )

    const response = await request(app).get('/legacy')

    assert.equal(response.status, 200)
    assert.deepEqual(
      calls[0].decisions.map(({ action, resource }) => ({ action, resource })),
      [
        { action: 'authenticate', resource: { kind: 'session' } },
        {
          action: 'enter',
          resource: { kind: 'surface', surface: 'admin', policy: 'legacy-role' },
        },
        { action: 'assume', resource: { kind: 'role', roles: ['org_admin'] } },
        {
          action: 'open',
          resource: {
            kind: 'module',
            surface: 'admin',
            moduleId: 'finance',
            policy: 'legacy-role-or-grant',
            strictSurfaceModules: false,
          },
        },
        {
          action: 'use',
          resource: { kind: 'capability', scope: 'org', name: 'view' },
        },
      ],
    )
  })
})

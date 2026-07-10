import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createIdentityCenterController } from '../src/modules/identity-center/identity-center.controller.js'
import {
  parseIdentityListQuery,
  parseIdentityModuleMatrixPayload,
  parseIdentityOrgRacePayload,
  parseIdentityUserRacePayload,
} from '../src/modules/identity-center/identity-center.schema.js'

describe('identity-center schemas', () => {
  it('normalizes pagination and caps list queries', () => {
    assert.deepEqual(
      parseIdentityListQuery({ orgId: ' org-1 ', page: '2', limit: '100', keyword: ' runner ' }),
      { orgId: 'org-1', page: 2, limit: 100, keyword: 'runner' },
    )
    assert.throws(
      () => parseIdentityListQuery({ page: 0 }),
      (error) => error.status === 400 && error.code === 'IDENTITY_CENTER_INPUT_INVALID',
    )
    assert.throws(() => parseIdentityListQuery({ limit: 101 }), /limit/)
  })

  it('requires complete module replacement rows and strips forged scope', () => {
    assert.deepEqual(
      parseIdentityModuleMatrixPayload({
        updates: [{ userId: ' user-1 ', modules: ['app:home', ' app:map ', 'app:map'] }],
        orgId: 'forged',
      }),
      [{ userId: 'user-1', modules: ['app:home', 'app:map'] }],
    )
    assert.throws(
      () => parseIdentityModuleMatrixPayload({ updates: [{ userId: 'user-1' }] }),
      /modules/,
    )
  })

  it('rejects invalid or duplicate organization race permissions', () => {
    assert.deepEqual(
      parseIdentityOrgRacePayload({
        permissions: [{ raceId: '7', accessLevel: 'viewer' }],
      }),
      [{ raceId: 7, accessLevel: 'viewer' }],
    )
    assert.throws(
      () => parseIdentityOrgRacePayload({ permissions: [{ raceId: 7, accessLevel: 'edtor' }] }),
      /accessLevel/,
    )
    assert.throws(
      () =>
        parseIdentityOrgRacePayload({
          permissions: [
            { raceId: 7, accessLevel: 'viewer' },
            { raceId: 7, accessLevel: 'editor' },
          ],
        }),
      /重复/,
    )
  })

  it('requires explicit user permissions so malformed writes cannot clear rows', () => {
    assert.deepEqual(
      parseIdentityUserRacePayload({
        updates: [
          {
            userId: 'user-1',
            explicitPermissions: [{ raceId: '7', accessLevel: 'editor' }],
          },
        ],
      }),
      [
        {
          userId: 'user-1',
          explicitPermissions: [{ raceId: 7, accessLevel: 'editor' }],
        },
      ],
    )
    assert.throws(
      () => parseIdentityUserRacePayload({ updates: [{ userId: 'user-1' }] }),
      /explicitPermissions/,
    )
  })
})

describe('identity-center controller boundary', () => {
  it('passes normalized full-replacement rows and scoped query values to the service', async () => {
    let received
    const controller = createIdentityCenterController({
      service: {
        async saveOrgRaceMatrix(...args) {
          received = args
          return { races: [] }
        },
      },
    })
    const request = {
      authContext: { userId: 'admin-1', role: 'super_admin' },
      query: { orgId: ' org-1 ' },
      body: { permissions: [{ raceId: '7', accessLevel: 'viewer' }], orgId: 'forged' },
    }
    let body
    const response = {
      status(status) {
        assert.equal(status, 200)
        return response
      },
      json(value) {
        body = value
        return value
      },
    }

    await controller.saveOrgRaceMatrix(request, response, assert.fail)

    assert.deepEqual(received, [
      request.authContext,
      'org-1',
      [{ raceId: 7, accessLevel: 'viewer' }],
    ])
    assert.deepEqual(body, { success: true, data: { races: [] } })
  })
})

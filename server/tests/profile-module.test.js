import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createProfileController } from '../src/modules/profile/profile.controller.js'
import {
  parseProfileContextQuery,
  parseProfileUpdate,
  parseProfileUserId,
} from '../src/modules/profile/profile.schema.js'
import { createProfileService } from '../src/modules/profile/profile.service.js'

describe('profile schemas', () => {
  it('normalizes context selection without retaining unknown query fields', () => {
    assert.deepEqual(
      parseProfileContextQuery({ orgId: ' org-1 ', raceId: '7', role: 'super_admin' }),
      { orgId: 'org-1', raceId: '7' },
    )
    assert.equal(parseProfileUserId(' user-1 '), 'user-1')
  })

  it('whitelists editable profile fields and validates skills', () => {
    assert.deepEqual(
      parseProfileUpdate({
        phone: ' 13800138000 ',
        bio: ' Runner ',
        skills: [' Timing ', 'Ops'],
        role: 'super_admin',
        orgId: 'forged',
      }),
      { phone: '13800138000', bio: 'Runner', skills: ['Timing', 'Ops'] },
    )
    assert.throws(
      () => parseProfileUpdate({ skills: 'Timing' }),
      (error) => error.code === 'PROFILE_UPDATE_INVALID',
    )
  })
})

describe('profile service boundaries', () => {
  it('keeps an unscoped super admin in the platform workspace', async () => {
    const service = createProfileService({
      repository: {
        async findContextAccount() {
          return { id: 'user-1', role: 'super_admin', org_id: null, preferences: {} }
        },
        async listOrganizations() {
          return [{ id: 'org-1', name: 'Org 1', slug: 'org-1' }]
        },
      },
      authz: {
        async loadRows() {
          return {}
        },
        async buildProfile() {},
      },
      raceAccess: {
        async listVisibleRacesForOrg() {
          assert.fail('platform scope must not load races before an organization is selected')
        },
      },
    })

    const result = await service.getContextOptions({
      userId: 'user-1',
      requestedOrgId: null,
      requestedRaceId: null,
    })
    assert.equal(result.current.scopeType, 'platform')
    assert.equal(result.current.orgId, null)
    assert.equal(result.canSwitchOrg, true)
    assert.equal(result.canSwitchRace, false)
  })

  it('blocks viewing a user from another organization', async () => {
    const service = createProfileService({
      repository: {
        async findPublicUser() {
          return { id: 'user-2', org_id: 'org-2' }
        },
      },
    })

    await assert.rejects(
      () =>
        service.getUser({
          authContext: { role: 'user', orgId: 'org-1' },
          userId: 'user-2',
        }),
      (error) => error.status === 403 && error.code === 'PROFILE_USER_FORBIDDEN',
    )
  })

  it('passes only parsed update fields to the repository', async () => {
    let received
    const service = createProfileService({
      repository: {
        async updateUser(userId, updates) {
          received = { userId, updates }
        },
      },
    })

    await service.updateMe({
      userId: 'user-1',
      data: { phone: '13800138000', skills: ['Timing'] },
    })
    assert.deepEqual(received, {
      userId: 'user-1',
      updates: { phone: '13800138000', skills: ['Timing'] },
    })
  })
})

describe('profile controller boundary', () => {
  it('parses the update body before calling the service', async () => {
    let received
    const controller = createProfileController({
      service: {
        async updateMe(input) {
          received = input
          return { updated: true }
        },
      },
    })
    const req = {
      authContext: { userId: 'user-1' },
      body: { bio: ' Runner ', role: 'super_admin' },
    }
    const response = { status: () => response, json: (body) => body }

    await controller.updateMe(req, response, assert.fail)

    assert.deepEqual(received, { userId: 'user-1', data: { bio: 'Runner' } })
  })
})

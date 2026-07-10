import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createCredentialController } from '../src/modules/credential/credential.controller.js'
import {
  parseCredentialPayload,
  parseCredentialRaceId,
  parseCredentialResourceId,
  parseCredentialStatusFilter,
} from '../src/modules/credential/credential.schema.js'

describe('credential schemas', () => {
  it('normalizes identifiers and status filters', () => {
    assert.equal(parseCredentialRaceId('7'), 7)
    assert.equal(parseCredentialResourceId('9'), 9)
    assert.deepEqual(parseCredentialStatusFilter({ status: ' approved ', ignored: true }), {
      status: 'approved',
    })
  })

  it('whitelists access-area fields and strips forged scope', () => {
    assert.deepEqual(
      parseCredentialPayload('accessArea', {
        accessCode: ' 13 ',
        accessName: ' Media ',
        sortOrder: '2',
        isActive: true,
        orgId: 'forged',
        raceId: 999,
      }),
      { accessCode: '13', accessName: 'Media', sortOrder: 2, isActive: true },
    )
  })

  it('preserves decimal credential template dimensions used by the UI', () => {
    assert.deepEqual(
      parseCredentialPayload('styleTemplate', {
        pageWidth: 283.46,
        pageHeight: '396.85',
      }),
      { pageWidth: 283.46, pageHeight: 396.85 },
    )
  })

  it('validates and normalizes recipient identity numbers', () => {
    assert.deepEqual(
      parseCredentialPayload('issue', {
        recipientName: ' Runner ',
        recipientIdCard: ' 11010119900101123x ',
        remark: ' desk ',
      }),
      {
        recipientName: 'Runner',
        recipientIdCard: '11010119900101123X',
        remark: 'desk',
      },
    )
    assert.throws(
      () => parseCredentialPayload('issue', { recipientName: 'Runner', recipientIdCard: 'bad' }),
      (error) => error.code === 'CREDENTIAL_ISSUE_INVALID',
    )
  })
})

describe('credential controller boundary', () => {
  it('passes a parsed request payload and request context to the service', async () => {
    let received
    const controller = createCredentialController({
      service: {
        async createRequest(...args) {
          received = args
          return { id: 1 }
        },
      },
    })
    const req = {
      id: 'request-1',
      authContext: { userId: 'user-1', orgId: 'org-1', role: 'user' },
      params: { raceId: '7' },
      body: {
        sourceMode: 'self_service',
        categoryId: '3',
        personName: ' Runner ',
        accessCodes: ['13'],
        orgId: 'forged',
      },
    }
    const response = { status: () => response, json: (body) => body }

    await controller.createRequest(req, response, assert.fail)

    assert.deepEqual(received, [
      { userId: 'user-1', orgId: 'org-1', role: 'user', requestId: 'request-1' },
      7,
      {
        sourceMode: 'self_service',
        categoryId: 3,
        personName: 'Runner',
        accessCodes: ['13'],
      },
    ])
  })
})

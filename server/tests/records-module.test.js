import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { createRecordController } from '../src/modules/records/record.controller.js'
import {
  parseBulkRecordUpdate,
  parseRecordQuery,
  parseRecordUpdate,
} from '../src/modules/records/record.schema.js'
import { createRecordService } from '../src/modules/records/record.service.js'

function fakeResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

describe('record schemas', () => {
  it('normalizes query pagination and rejects invalid ranges', () => {
    assert.deepEqual(parseRecordQuery({ raceId: '1001', keyword: ' 张 ', offset: 5 }), {
      raceId: 1001,
      keyword: '张',
      filters: [],
      offset: 5,
      limit: 50,
      sort: undefined,
    })

    assert.throws(
      () => parseRecordQuery({ limit: 1001 }),
      (error) => error.status === 400 && error.code === 'RECORD_QUERY_INVALID',
    )
  })

  it('whitelists mutable record fields', () => {
    assert.deepEqual(
      parseRecordUpdate({ name: '张三', lotteryStatus: '中签', orgId: 'forged', raceId: 999 }),
      { name: '张三', lotteryStatus: '中签' },
    )

    assert.throws(
      () => parseRecordUpdate({ orgId: 'forged' }),
      (error) => error.status === 400 && error.code === 'RECORD_UPDATE_EMPTY',
    )
  })

  it('normalizes bulk updates without retaining raw request objects', () => {
    const raw = {
      updates: [{ id: '7', data: { auditStatus: 'passed', orgId: 'forged' } }],
    }
    const parsed = parseBulkRecordUpdate(raw)

    assert.notEqual(parsed, raw)
    assert.notEqual(parsed.updates, raw.updates)
    assert.deepEqual(parsed, {
      updates: [{ id: 7, data: { auditStatus: 'passed' } }],
    })
  })

  it('keeps the not-equals filter used by the records workbench', () => {
    assert.deepEqual(
      parseRecordQuery({ filters: [{ field: 'event', operator: 'notEquals', value: '10K' }] })
        .filters,
      [{ field: 'event', operator: 'notEquals', value: '10K' }],
    )
  })

  it('rejects unknown sort fields and unsupported encrypted filters', () => {
    assert.throws(
      () => parseRecordQuery({ sort: { field: 'unknown_column', direction: 'asc' } }),
      (error) => error.code === 'RECORD_QUERY_INVALID',
    )
    assert.throws(
      () =>
        parseRecordQuery({
          filters: [{ field: 'phone', operator: 'contains', value: '138' }],
        }),
      (error) => error.code === 'RECORD_QUERY_INVALID',
    )
    assert.deepEqual(
      parseRecordQuery({
        filters: [{ field: 'phone', operator: 'equals', value: '13800138000' }],
      }).filters,
      [{ field: 'phone', operator: 'equals', value: '13800138000' }],
    )
  })
})

describe('record service boundaries', () => {
  it('resolves query scope through race authorization before calling the repository', async () => {
    const calls = []
    const service = createRecordService({
      repository: {
        async query(...args) {
          calls.push(args)
          return { records: [], total: 0 }
        },
      },
      resolveAccess: async (authContext, raceId, method) => {
        assert.deepEqual(authContext, { userId: 'u-1', orgId: 'org-1', role: 'user' })
        assert.equal(raceId, 1001)
        assert.equal(method, 'POST')
        return { operatorOrgId: 'org-operator' }
      },
    })

    const result = await service.queryRecords({
      authContext: { userId: 'u-1', orgId: 'org-1', role: 'user' },
      method: 'POST',
      input: parseRecordQuery({ raceId: 1001 }),
    })

    assert.deepEqual(result, { records: [], total: 0 })
    assert.deepEqual(calls, [
      ['org-operator', 1001, { keyword: '', filters: [], offset: 0, limit: 50, sort: undefined }],
    ])
  })

  it('looks up record race scope inside the authenticated organization', async () => {
    const calls = []
    const service = createRecordService({
      repository: {
        async findRecordScope(orgId, recordId) {
          calls.push([orgId, recordId])
          return { id: recordId, raceId: 1001 }
        },
      },
    })

    assert.equal(
      await service.resolveRaceIdForRecord({ userId: 'u-1', orgId: 'org-1', role: 'org_admin' }, 9),
      1001,
    )
    assert.deepEqual(calls, [['org-1', 9]])
  })

  it('resolves bulk scope from visible records and rejects cross-race batches', async () => {
    const service = createRecordService({
      repository: {
        async findRecordScopes() {
          return [
            { id: 1, raceId: 1001 },
            { id: 2, raceId: 1002 },
          ]
        },
      },
    })

    await assert.rejects(
      () =>
        service.resolveRaceIdForBulk(
          { userId: 'u-1', orgId: 'org-1', role: 'org_admin' },
          {
            updates: [
              { id: 1, data: { name: 'A' } },
              { id: 2, data: { name: 'B' } },
            ],
          },
        ),
      (error) => error.status === 400 && error.code === 'RECORD_BULK_CROSS_RACE',
    )
  })

  it('owns the transaction boundary for bulk writes', async () => {
    const calls = []
    const trx = { id: 'trx-1' }
    const service = createRecordService({
      database: {
        async transaction(callback) {
          calls.push('transaction')
          return callback(trx)
        },
      },
      repository: {
        async bulkUpdate(orgId, updates, transaction) {
          calls.push([orgId, updates, transaction])
          return { updated: updates.length }
        },
      },
    })

    const updates = [{ id: 1, data: { name: 'A' } }]
    assert.deepEqual(await service.bulkUpdateRecords({ orgId: 'org-1', updates }), { updated: 1 })
    assert.deepEqual(calls, ['transaction', ['org-1', updates, trx]])
  })
})

describe('record controller boundary', () => {
  it('passes parsed update fields to the service and returns the shared envelope', async () => {
    const calls = []
    const controller = createRecordController({
      service: {
        async updateRecord(input) {
          calls.push(input)
          return { id: 7, name: input.data.name }
        },
      },
    })
    const req = {
      params: { recordId: '7' },
      body: { name: '新姓名', orgId: 'forged' },
      raceAccess: { operatorOrgId: 'org-1' },
    }
    const res = fakeResponse()

    await controller.update(req, res, assert.fail)

    assert.deepEqual(calls, [{ orgId: 'org-1', recordId: 7, data: { name: '新姓名' } }])
    assert.deepEqual(res.body, { success: true, data: { id: 7, name: '新姓名' } })
  })
})

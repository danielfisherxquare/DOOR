import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { createImportSessionController } from '../src/modules/import-sessions/import-session.controller.js'
import {
  buildDuplicatePlan,
  createCommitImportSessionHandler,
} from '../src/modules/import-sessions/commit-import-session.handler.js'
import {
  parseChunkPage,
  parseCommitImportSession,
  parseImportChunk,
  parseImportSummary,
  parseSessionId,
} from '../src/modules/import-sessions/import-session.schema.js'
import { createImportSessionService } from '../src/modules/import-sessions/import-session.service.js'

const SESSION_ID = '0de8a344-b35c-47cf-b224-62f92f3525db'

describe('import session schemas', () => {
  it('normalizes session, summary, chunk, page, and commit inputs', () => {
    assert.equal(parseSessionId(SESSION_ID), SESSION_ID)
    assert.deepEqual(
      parseImportSummary({ rawCount: '2', rawPreview: [{ name: 'A' }], stats: { pinyin: 1 } }),
      { rawCount: 2, rawPreview: [{ name: 'A' }], stats: { pinyin: 1 } },
    )
    assert.deepEqual(parseImportChunk([{ name: 'A' }]), [{ name: 'A' }])
    assert.deepEqual(parseChunkPage({ offset: '3', limit: '200' }), { offset: 3, limit: 200 })
    assert.deepEqual(parseCommitImportSession({ raceId: '7', category: 'Emergency' }), {
      raceId: 7,
      category: 'Medic',
    })
  })

  it('rejects oversized or malformed import payloads with stable codes', () => {
    assert.throws(
      () => parseSessionId('not-a-uuid'),
      (error) => error.status === 400 && error.code === 'IMPORT_SESSION_ID_INVALID',
    )
    assert.throws(
      () => parseImportChunk(new Array(2001).fill({ name: 'A' })),
      (error) => error.code === 'IMPORT_CHUNK_TOO_LARGE',
    )
    assert.throws(
      () => parseCommitImportSession({ raceId: 7, category: 'Unknown' }),
      (error) => error.code === 'IMPORT_CATEGORY_INVALID',
    )
  })
})

describe('import session service boundaries', () => {
  it('resolves a super-admin organization from the selected race through the repository', async () => {
    const calls = []
    const service = createImportSessionService({
      repository: {
        async findRaceScope(raceId) {
          calls.push(raceId)
          return { id: raceId, orgId: 'org-7' }
        },
      },
    })

    assert.equal(
      await service.resolveOrgId({
        authContext: { role: 'super_admin', orgId: null },
        input: { raceId: 7 },
      }),
      'org-7',
    )
    assert.deepEqual(calls, [7])
  })

  it('owns the append transaction and passes only parsed rows to the repository', async () => {
    const committed = []
    const trx = { id: 'trx-import' }
    const rows = [{ name: 'A' }]
    const service = createImportSessionService({
      database: {
        async transaction(callback) {
          return callback(trx)
        },
      },
      repository: {
        async appendChunk(orgId, sessionId, parsedRows, transaction) {
          committed.push([orgId, sessionId, parsedRows, transaction])
          return 1
        },
      },
    })

    assert.equal(await service.appendChunk({ orgId: 'org-1', sessionId: SESSION_ID, rows }), 1)
    assert.deepEqual(committed, [['org-1', SESSION_ID, rows, trx]])
  })
})

describe('import session controller boundary', () => {
  it('parses commit input once for the race guard and controller', () => {
    const controller = createImportSessionController({ service: {} })
    const req = { body: { raceId: '7', category: 'Emergency' } }

    assert.equal(controller.resolveRaceIdByCommit(req), 7)
    assert.deepEqual(req.importCommitInput, { raceId: 7, category: 'Medic' })
  })
})

describe('commit import transaction', () => {
  it('counts normalized in-batch duplicates without producing negative counts for rows without IDs', () => {
    const plan = buildDuplicatePlan(
      [
        { idNumber: '110 101', runnerCategory: 'Mass', source: 'a.xlsx' },
        { idNumber: '110101', runnerCategory: 'Mass', source: 'b.xlsx' },
        { name: 'No ID', runnerCategory: 'Mass' },
      ],
      [],
    )

    assert.equal(plan.newRecords.length, 2)
    assert.equal(plan.newRecords[0].duplicateCount, 2)
    assert.equal(plan.internalUpdateCount, 1)
  })

  it('does not create special-category records that cannot be matched to an existing registration', () => {
    const plan = buildDuplicatePlan([{ name: 'No ID', runnerCategory: 'Pacer' }], [])

    assert.equal(plan.newRecords.length, 0)
    assert.deepEqual(plan.rejectedRecords, [
      {
        idNumber: '',
        name: 'No ID',
        incomingCategory: 'Pacer',
        reason: 'requires_mass_registration',
      },
    ])
  })

  it('rolls record inserts back when marking the session committed fails', async () => {
    const durableWrites = []
    const repository = {
      async lockRaceScope() {
        return { id: 7, orgId: 'org-1' }
      },
      async lockOpenSession() {
        return { id: SESSION_ID, status: 'open' }
      },
      async listAllRows() {
        return [{ name: 'A', source: 'file.xlsx' }]
      },
      async listRecordDuplicateCandidates() {
        return []
      },
      async insertRecords(rows, trx) {
        trx.pending.push(...rows)
      },
      async updateRecord() {
        assert.fail('no duplicate record should be updated')
      },
      async markCommitted() {
        throw new Error('injected mark failure')
      },
    }
    const database = {
      async transaction(callback) {
        const trx = { pending: [] }
        try {
          const result = await callback(trx)
          durableWrites.push(...trx.pending)
          return result
        } catch (error) {
          trx.pending.length = 0
          throw error
        }
      },
    }
    const handler = createCommitImportSessionHandler({
      repository,
      recordMapper: {
        toDbInsert: (record) => record,
        toDbUpdate: (record) => record,
      },
      logger: { info() {} },
    })

    await assert.rejects(
      () =>
        handler(
          {
            orgId: 'org-1',
            payload: { sessionId: SESSION_ID, raceId: 7, category: 'Mass' },
          },
          { knex: database, heartbeat: async () => {} },
        ),
      /injected mark failure/,
    )
    assert.deepEqual(durableWrites, [])
  })
})

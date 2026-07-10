import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createBibController } from '../src/modules/bib/bib.controller.js'
import {
  parseBibAssignments,
  parseBibRaceId,
  parseBibTemplate,
} from '../src/modules/bib/bib.schema.js'
import { createBibService } from '../src/modules/bib/bib.service.js'

describe('bib schemas', () => {
  it('normalizes templates and removes forged scope fields', () => {
    assert.equal(parseBibRaceId('7'), 7)
    assert.deepEqual(
      parseBibTemplate({
        raceId: '7',
        event: ' Full ',
        prefix: ' A ',
        startNumber: '1',
        endNumber: '9999',
        padding: '4',
        orgId: 'forged',
      }),
      {
        raceId: 7,
        event: 'Full',
        prefix: 'A',
        startNumber: 1,
        endNumber: 9999,
        padding: 4,
      },
    )
  })

  it('rejects duplicate records and duplicate non-empty bib numbers', () => {
    assert.throws(
      () =>
        parseBibAssignments({
          assignments: [
            { recordId: 1, bibNumber: 'A001' },
            { recordId: 1, bibNumber: 'A002' },
          ],
        }),
      (error) => error.code === 'BIB_ASSIGNMENTS_DUPLICATE_RECORD',
    )
    assert.throws(
      () =>
        parseBibAssignments({
          assignments: [
            { recordId: 1, bibNumber: 'A001' },
            { recordId: 2, bibNumber: 'A001' },
          ],
        }),
      (error) => error.code === 'BIB_ASSIGNMENTS_DUPLICATE_NUMBER',
    )
  })
})

describe('bib service transaction boundary', () => {
  it('reuses the first rollback snapshot instead of overwriting its baseline', async () => {
    const service = createBibService({
      database: { transaction: (callback) => callback({ id: 'trx-bib' }) },
      repository: {
        async lockRaceScope() {},
        async assertNoActiveExecution() {},
      },
      snapshots: {
        async hasSnapshot() {
          return true
        },
        async createSnapshot() {
          assert.fail('an existing bib snapshot must not be overwritten')
        },
      },
    })

    assert.deepEqual(await service.createSnapshot({ orgId: 'org-1', raceId: 7 }), {
      reused: true,
    })
  })

  it('rolls back snapshot and record changes when assignment persistence fails', async () => {
    const durable = []
    const database = {
      async transaction(callback) {
        const trx = { pending: [] }
        try {
          const result = await callback(trx)
          durable.push(...trx.pending)
          return result
        } catch (error) {
          trx.pending.length = 0
          throw error
        }
      },
    }
    const service = createBibService({
      database,
      snapshots: {
        async hasSnapshot() {
          return false
        },
        async createSnapshot(_orgId, _raceId, _type, _metadata, trx) {
          trx.pending.push('snapshot')
          return { snapshotId: 5, itemCount: 2 }
        },
      },
      repository: {
        async lockRaceScope() {},
        async assertNoActiveExecution() {},
        async lockAssignmentRecords(_orgId, _raceId, recordIds) {
          return recordIds
        },
        async createExecution(_orgId, _raceId, trx) {
          trx.pending.push('execution')
          return 11
        },
        async applyAssignments(_orgId, _raceId, _assignments, trx) {
          trx.pending.push('record updates')
          throw new Error('injected bib assignment failure')
        },
      },
    })

    await assert.rejects(
      () =>
        service.bulkAssign({
          orgId: 'org-1',
          raceId: 7,
          assignments: [{ recordId: 1, bibNumber: 'A001' }],
        }),
      /injected bib assignment failure/u,
    )
    assert.deepEqual(durable, [])
  })
})

describe('bib controller boundary', () => {
  it('passes validated assignments instead of the raw request body', async () => {
    let received
    const controller = createBibController({
      service: {
        async bulkAssign(input) {
          received = input
          return { updated: input.assignments.length }
        },
      },
    })
    const req = {
      params: { raceId: '7' },
      body: {
        assignments: [{ recordId: '1', bibNumber: ' A001 ', orgId: 'forged' }],
        orgId: 'forged',
      },
      raceAccess: { operatorOrgId: 'org-1' },
    }
    const response = { status: () => response, json: (body) => body }

    await controller.bulkAssign(req, response, assert.fail)

    assert.deepEqual(received, {
      orgId: 'org-1',
      raceId: 7,
      assignments: [
        {
          recordId: 1,
          bibNumber: 'A001',
          bagWindowNo: '',
          bagNo: '',
          expoWindowNo: '',
          bibColor: '',
        },
      ],
    })
  })
})

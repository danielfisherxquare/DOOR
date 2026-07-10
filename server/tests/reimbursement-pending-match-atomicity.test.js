import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createPendingMatchWorkflow } from '../src/modules/reimbursement/reimbursement-pending-match.workflow.js'

function createFixture({ failAttachment = false, failMatchUpdate = false } = {}) {
  let durable = {
    match: { id: 'match-1', project_id: 'project-1', status: 'pending', payment_data: {} },
    records: [],
    attachments: [],
  }
  const database = {
    async transaction(work) {
      const staged = structuredClone(durable)
      const result = await work({ state: staged })
      durable = staged
      return result
    },
  }
  const workflow = createPendingMatchWorkflow({
    database,
    findMatchForUpdate: async (trx) => trx.state.match,
    findTargetRecordForUpdate: async (_trx, _match, targetRecordId) => ({
      id: targetRecordId,
    }),
    createRejectedRecord: async (trx) => {
      const record = { id: 'record-1' }
      trx.state.records.push(record)
      return record
    },
    attachPaymentEvidence: async (trx, recordId) => {
      trx.state.attachments.push({ recordId })
      if (failAttachment) throw new Error('attachment failed')
    },
    mergePaymentReview: async () => {},
    markMatchResolved: async (trx, _match, recordId, status) => {
      if (failMatchUpdate) throw new Error('match update failed')
      trx.state.match = { ...trx.state.match, status, resolved_record_id: recordId }
      return trx.state.match
    },
    refreshProject: async () => {},
  })

  return { workflow, state: () => durable }
}

describe('reimbursement pending-match atomicity', () => {
  it('rolls back resolved state when attachment persistence fails', async () => {
    const fixture = createFixture({ failAttachment: true })

    await assert.rejects(() => fixture.workflow.resolve('match-1', 'record-1'), /attachment/)

    assert.equal(fixture.state().match.status, 'pending')
    assert.deepEqual(fixture.state().attachments, [])
  })

  it('rolls back the created record when rejecting the match cannot finish', async () => {
    const fixture = createFixture({ failMatchUpdate: true })

    await assert.rejects(() => fixture.workflow.reject('match-1'), /match update/)

    assert.equal(fixture.state().match.status, 'pending')
    assert.deepEqual(fixture.state().records, [])
    assert.deepEqual(fixture.state().attachments, [])
  })
})

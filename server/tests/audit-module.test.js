import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { runAtomicAuditStep } from '../src/modules/audit/audit.job-handler.js'
import { parseAuditStepInput, parseAuditRaceId } from '../src/modules/audit/audit.schema.js'
import { createAuditService } from '../src/modules/audit/audit.service.js'

describe('audit schemas', () => {
  it('normalizes race and underage inputs without retaining arbitrary request fields', () => {
    assert.equal(parseAuditRaceId('7'), 7)
    assert.deepEqual(
      parseAuditStepInput('underage', {
        raceDate: '2026-03-19',
        runId: 999,
        orgId: 'forged',
      }),
      { raceDate: '2026-03-19' },
    )
    assert.deepEqual(parseAuditStepInput('blacklist', { raceDate: 'ignored' }), {})
  })

  it('rejects unknown steps and invalid dates with stable codes', () => {
    assert.throws(
      () => parseAuditStepInput('unknown', {}),
      (error) => error.code === 'AUDIT_STEP_INVALID',
    )
    assert.throws(
      () => parseAuditStepInput('underage', { raceDate: '2026-02-31' }),
      (error) => error.code === 'AUDIT_RACE_DATE_INVALID',
    )
  })
})

describe('audit service boundaries', () => {
  it('creates the run and job in one transaction', async () => {
    const durable = []
    const service = createAuditService({
      database: {
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
      },
      repository: {
        async lockRaceScope(_orgId, _raceId, trx) {
          trx.pending.push('race lock')
        },
        async hasActiveAuditJobs() {
          return false
        },
        async createRun(_orgId, _raceId, _stepNumber, _stepName, trx) {
          trx.pending.push('run')
          return { id: 91 }
        },
      },
      jobs: {
        async enqueue() {
          throw new Error('injected enqueue failure')
        },
      },
    })

    await assert.rejects(
      () =>
        service.enqueueStep({
          orgId: 'org-1',
          raceId: 7,
          stepName: 'underage',
          payload: { raceDate: '2026-03-19' },
          userId: 'user-1',
        }),
      /injected enqueue failure/,
    )
    assert.deepEqual(durable, [])
  })

  it('refuses to reset while an audit job is queued or running', async () => {
    const service = createAuditService({
      database: { transaction: (callback) => callback({ id: 'trx-audit' }) },
      repository: {
        async lockRaceScope() {},
        async hasActiveAuditJobs() {
          return true
        },
        async resetAudit() {
          assert.fail('reset must not run while an audit job is active')
        },
      },
    })

    await assert.rejects(
      () => service.resetAudit({ orgId: 'org-1', raceId: 7 }),
      (error) => error.status === 409 && error.code === 'AUDIT_JOB_ACTIVE',
    )
  })
})

describe('atomic audit jobs', () => {
  it('rolls step writes back and marks the run failed outside the transaction', async () => {
    const durable = []
    const failures = []
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
    const handler = async (_job, { knex: trx }) => {
      trx.pending.push('partial record update')
      throw new Error('injected audit failure')
    }
    const repository = {
      async lockRaceScope() {
        return { id: 7 }
      },
      async failRun(orgId, raceId, runId, error, db) {
        assert.equal(db, database)
        failures.push({ orgId, raceId, runId, message: error.message })
      },
    }

    await assert.rejects(
      () =>
        runAtomicAuditStep({
          job: { orgId: 'org-1', payload: { raceId: 7, runId: 91 } },
          context: { knex: database, heartbeat: async () => {} },
          handler,
          repository,
        }),
      /injected audit failure/,
    )
    assert.deepEqual(durable, [])
    assert.deepEqual(failures, [
      { orgId: 'org-1', raceId: 7, runId: 91, message: 'injected audit failure' },
    ])
  })
})

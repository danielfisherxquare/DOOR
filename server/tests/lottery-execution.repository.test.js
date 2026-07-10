import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  assertNoActivePipelineExecution,
  assertNoFinalizedLotteryV2,
  assertNoLotteryV1Snapshot,
  lockLotteryRace,
} from '../src/modules/lottery/lottery-execution.repository.js'

function createDatabase({
  race = { id: 7 },
  activeExecution = null,
  finalizedV2 = null,
  v1Snapshot = null,
} = {}) {
  const calls = []

  const database = (table) => {
    const query = {
      where(criteria) {
        calls.push(['where', table, criteria])
        return query
      },
      whereIn(column, values) {
        calls.push(['whereIn', table, column, values])
        return query
      },
      forUpdate() {
        calls.push(['forUpdate', table])
        return query
      },
      first(column) {
        calls.push(['first', table, column])
        if (table === 'races') return Promise.resolve(race)
        if (table === 'pipeline_executions') return Promise.resolve(activeExecution)
        if (table === 'lottery_v2_snapshots') return Promise.resolve(finalizedV2)
        if (table === 'pipeline_snapshots') return Promise.resolve(v1Snapshot)
        return Promise.resolve(null)
      },
    }
    return query
  }

  return { calls, database }
}

describe('lottery execution repository', () => {
  it('locks the tenant-scoped race row before a lottery mutation', async () => {
    const { calls, database } = createDatabase()

    const row = await lockLotteryRace('org-1', 7, database)

    assert.deepEqual(row, { id: 7 })
    assert.deepEqual(calls, [
      ['where', 'races', { id: 7, org_id: 'org-1' }],
      ['forUpdate', 'races'],
      ['first', 'races', 'id'],
    ])
  })

  it('rejects a race outside the operator organization', async () => {
    const { database } = createDatabase({ race: null })

    await assert.rejects(
      () => lockLotteryRace('org-1', 7, database),
      (error) => {
        assert.equal(error.status, 404)
        assert.equal(error.code, 'LOTTERY_RACE_NOT_FOUND')
        return true
      },
    )
  })

  it('blocks finalize or rollback while either execution type is running', async () => {
    const { calls, database } = createDatabase({
      activeExecution: { id: 12, execution_type: 'lottery' },
    })

    await assert.rejects(
      () => assertNoActivePipelineExecution(
        'org-1',
        7,
        ['lottery', 'rollback_lottery'],
        database,
      ),
      (error) => {
        assert.equal(error.status, 409)
        assert.equal(error.code, 'CONCURRENT_EXECUTION')
        return true
      },
    )
    assert.deepEqual(
      calls.find((call) => call[0] === 'whereIn'),
      ['whereIn', 'pipeline_executions', 'execution_type', ['lottery', 'rollback_lottery']],
    )
  })

  it('prevents V1 execution while a V2 result remains finalized', async () => {
    const { database } = createDatabase({ finalizedV2: { id: 'snapshot-1' } })

    await assert.rejects(
      () => assertNoFinalizedLotteryV2('org-1', 7, database),
      (error) => {
        assert.equal(error.status, 409)
        assert.equal(error.code, 'LOTTERY_V2_ALREADY_FINALIZED')
        return true
      },
    )
  })

  it('prevents V2 execution while a V1 snapshot awaits rollback', async () => {
    const { database } = createDatabase({ v1Snapshot: { id: 21 } })

    await assert.rejects(
      () => assertNoLotteryV1Snapshot('org-1', 7, database),
      (error) => {
        assert.equal(error.status, 409)
        assert.equal(error.code, 'LOTTERY_V1_SNAPSHOT_EXISTS')
        return true
      },
    )
  })
})

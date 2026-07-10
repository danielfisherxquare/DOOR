import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseLotteryListEntries,
  parseLotteryListUpdate,
  parseLotteryRaceCapacity,
  parseLotteryWeight,
} from '../src/modules/lottery/lottery.schema.js'
import { createLotteryService } from '../src/modules/lottery/lottery.service.js'

describe('lottery schemas', () => {
  it('normalizes capacity and strips forged scope fields', () => {
    assert.deepEqual(
      parseLotteryRaceCapacity(7, {
        event: '  Full ',
        targetCount: '100',
        drawRatio: '0.8',
        reservedRatio: '0.2',
        lotteryModeOverride: 'lottery',
        raceId: 999,
        orgId: 'forged',
      }),
      {
        raceId: 7,
        event: 'Full',
        targetCount: 100,
        drawRatio: 0.8,
        reservedRatio: 0.2,
        lotteryModeOverride: 'lottery',
      },
    )
  })

  it('copies list entries and mutable update fields without retaining request objects', () => {
    const raw = {
      entries: [
        {
          raceId: '7',
          listType: 'blacklist',
          name: 'A',
          idNumber: '110101',
          orgId: 'forged',
        },
      ],
    }
    const parsed = parseLotteryListEntries(raw)

    assert.notEqual(parsed.entries, raw.entries)
    assert.deepEqual(parsed, {
      raceId: 7,
      entries: [{ raceId: 7, listType: 'blacklist', name: 'A', idNumber: '110101' }],
    })
    assert.deepEqual(parseLotteryListUpdate({ name: 'B', raceId: 999, listType: 'whitelist' }), {
      name: 'B',
    })
  })

  it('rejects cross-race batches and malformed weight config', () => {
    assert.throws(
      () =>
        parseLotteryListEntries({
          entries: [
            { raceId: 7, listType: 'whitelist', idNumber: 'A' },
            { raceId: 8, listType: 'blacklist', idNumber: 'B' },
          ],
        }),
      (error) => error.code === 'LOTTERY_LIST_CROSS_RACE',
    )
    assert.throws(
      () => parseLotteryWeight({ raceId: 7, weightConfig: [] }),
      (error) => error.code === 'LOTTERY_WEIGHT_INVALID',
    )
  })
})

describe('lottery service scope', () => {
  it('resolves list entry scope inside the authenticated organization', async () => {
    const calls = []
    const service = createLotteryService({
      repository: {
        async findListScope(orgId, id) {
          calls.push([orgId, id])
          return { id, raceId: 7 }
        },
      },
    })

    assert.equal(await service.resolveListRaceId({ role: 'org_admin', orgId: 'org-1' }, 91), 7)
    assert.deepEqual(calls, [['org-1', 91]])
  })

  it('returns the active finalize job instead of enqueueing a duplicate', async () => {
    const service = createLotteryService({
      database: { transaction: (callback) => callback({ id: 'trx-v1' }) },
      executions: {
        async lockLotteryRace() {},
        async findActiveLotteryJob() {
          return { id: 'job-v1', type: 'lottery:finalize' }
        },
        async assertNoFinalizedLotteryV2() {},
      },
      jobs: {
        async enqueue() {
          assert.fail('duplicate finalize must not enqueue another job')
        },
      },
    })

    assert.deepEqual(
      await service.enqueueFinalize({ orgId: 'org-1', raceId: 7, userId: 'user-1' }),
      { jobId: 'job-v1', reused: true },
    )
  })
})

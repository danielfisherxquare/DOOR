import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createLotteryV2Controller } from '../src/modules/lottery-v2/lottery-v2.controller.js'
import {
  parseLotteryV2Config,
  parseLotteryV2RaceId,
} from '../src/modules/lottery-v2/lottery-v2.schema.js'
import { createLotteryV2WorkflowService } from '../src/modules/lottery-v2/lottery-v2.workflow.service.js'

describe('lottery v2 schemas', () => {
  it('normalizes the public config and removes forged scope fields', () => {
    assert.equal(parseLotteryV2RaceId('7'), 7)
    assert.deepEqual(
      parseLotteryV2Config({
        apparelScopeMode: 'event_gender_size',
        sizeMatchPolicy: 'exact',
        performanceRatio: '0.35',
        genderRatio: { M: '0.55', F: '0.45' },
        regionDimension: 'city',
        regionRatios: { Shanghai: '0.2' },
        seed: '  race-seed  ',
        fallbackStrategy: 'same_pool',
        orgId: 'forged',
        raceId: 999,
      }),
      {
        apparelScopeMode: 'event_gender_size',
        sizeMatchPolicy: 'exact',
        performanceRatio: 0.35,
        genderRatio: { M: 0.55, F: 0.45 },
        regionDimension: 'city',
        regionRatios: { Shanghai: 0.2 },
        seed: 'race-seed',
        fallbackStrategy: 'same_pool',
      },
    )
  })

  it('rejects arbitrary record dimensions and invalid ratio maps', () => {
    assert.throws(
      () => parseLotteryV2Config({ regionDimension: 'id' }),
      (error) => error.code === 'LOTTERY_V2_CONFIG_INVALID',
    )
    assert.throws(
      () => parseLotteryV2Config({ regionRatios: { Shanghai: -1 } }),
      (error) => error.code === 'LOTTERY_V2_CONFIG_INVALID',
    )
  })
})

describe('lottery v2 workflow service', () => {
  it('returns the same active preview job instead of enqueueing a duplicate', async () => {
    const service = createLotteryV2WorkflowService({
      database: { transaction: (callback) => callback({ id: 'trx-v2' }) },
      executions: {
        async lockLotteryRace() {},
        async findActiveLotteryJob() {
          return { id: 'job-1', type: 'lottery-v2:preview' }
        },
        async assertNoLotteryV1Snapshot() {},
        async assertNoFinalizedLotteryV2() {},
      },
      jobs: {
        async enqueue() {
          assert.fail('duplicate preview must not enqueue another job')
        },
      },
    })

    assert.deepEqual(
      await service.enqueuePreview({ orgId: 'org-1', raceId: 7, userId: 'user-1' }),
      { jobId: 'job-1', reused: true },
    )
  })

  it('blocks a finalize request while a preview job is active', async () => {
    const service = createLotteryV2WorkflowService({
      database: { transaction: (callback) => callback({ id: 'trx-v2' }) },
      executions: {
        async lockLotteryRace() {},
        async findActiveLotteryJob() {
          return { id: 'job-1', type: 'lottery-v2:preview' }
        },
        async assertNoLotteryV1Snapshot() {},
        async assertNoFinalizedLotteryV2() {},
      },
    })

    await assert.rejects(
      () => service.enqueueFinalize({ orgId: 'org-1', raceId: 7, userId: 'user-1' }),
      (error) => error.status === 409 && error.code === 'LOTTERY_JOB_ACTIVE',
    )
  })
})

describe('lottery v2 controller boundary', () => {
  it('passes only validated config fields to the workflow service', async () => {
    let received
    const controller = createLotteryV2Controller({
      service: {
        async saveConfig(input) {
          received = input
          return input.data
        },
      },
    })
    const req = {
      params: { raceId: '7' },
      body: { seed: 'safe', orgId: 'forged' },
      raceAccess: { operatorOrgId: 'org-1' },
    }
    const response = { status: () => response, json: (body) => body }

    await controller.saveConfig(req, response, assert.fail)

    assert.deepEqual(received, {
      orgId: 'org-1',
      raceId: 7,
      data: { seed: 'safe' },
    })
  })
})

import knex from '../../db/knex.js'
import * as jobRepository from '../jobs/job.repository.js'
import * as executionRepository from '../lottery/lottery-execution.repository.js'
import * as lotteryV2Engine from './lottery-v2.service.js'

function serviceError(status, code, message) {
  const error = new Error(message)
  error.status = status
  error.code = code
  error.expose = true
  return error
}

export function createLotteryV2WorkflowService({
  engine = lotteryV2Engine,
  jobs = jobRepository,
  executions = executionRepository,
  database = knex,
  now = Date.now,
} = {}) {
  async function enqueueAction({ orgId, raceId, userId, type }) {
    return database.transaction(async (trx) => {
      await executions.lockLotteryRace(orgId, raceId, trx)
      const active = await executions.findActiveLotteryJob(orgId, raceId, trx)
      if (active) {
        if (active.type === type) return { jobId: active.id, reused: true }
        throw serviceError(409, 'LOTTERY_JOB_ACTIVE', '当前赛事已有抽签任务排队或执行中')
      }

      await executions.assertNoLotteryV1Snapshot(orgId, raceId, trx)
      await executions.assertNoFinalizedLotteryV2(orgId, raceId, trx)

      const job = await jobs.enqueue(
        orgId,
        type,
        { raceId },
        `${type}:${raceId}:${now()}`,
        userId,
        raceId,
        trx,
      )
      return { jobId: job.id, reused: false }
    })
  }

  return {
    getConfig: ({ orgId, raceId }) => engine.getConfig(orgId, raceId),
    saveConfig: ({ orgId, raceId, data }) => engine.saveConfig(orgId, raceId, data),
    getPreview: ({ orgId, raceId }) => engine.getLatestPreview(orgId, raceId),
    getResults: ({ orgId, raceId }) => engine.getResults(orgId, raceId),
    rollback: ({ orgId, raceId }) => engine.rollbackLatest(orgId, raceId),
    enqueuePreview: (input) => enqueueAction({ ...input, type: 'lottery-v2:preview' }),
    enqueueFinalize: (input) => enqueueAction({ ...input, type: 'lottery-v2:finalize' }),
  }
}

export const lotteryV2WorkflowService = createLotteryV2WorkflowService()

import knex from '../../db/knex.js'
import * as jobRepository from '../jobs/job.repository.js'
import * as auditRepository from './audit.repository.js'
import { getAuditStepDefinition } from './audit.schema.js'

function serviceError(status, code, message) {
  const error = new Error(message)
  error.status = status
  error.code = code
  error.expose = true
  return error
}

export function createAuditService({
  repository = auditRepository,
  jobs = jobRepository,
  database = knex,
} = {}) {
  return {
    getPrepStats({ orgId, raceId }) {
      return repository.getPrepStats(orgId, raceId)
    },

    resetAudit({ orgId, raceId }) {
      return database.transaction(async (trx) => {
        await repository.lockRaceScope(orgId, raceId, trx)
        if (await repository.hasActiveAuditJobs(orgId, raceId, trx)) {
          throw serviceError(409, 'AUDIT_JOB_ACTIVE', '当前赛事仍有审核任务在执行，暂不能重置')
        }
        return repository.resetAudit(orgId, raceId, trx)
      })
    },

    enqueueStep({ orgId, raceId, stepName, payload, userId }) {
      const definition = getAuditStepDefinition(stepName)
      return database.transaction(async (trx) => {
        await repository.lockRaceScope(orgId, raceId, trx)
        if (await repository.hasActiveAuditJobs(orgId, raceId, trx)) {
          throw serviceError(409, 'AUDIT_JOB_ACTIVE', '当前赛事已有审核任务在执行')
        }
        const run = await repository.createRun(
          orgId,
          raceId,
          definition.stepNumber,
          definition.jobName,
          trx,
        )
        const job = await jobs.enqueue(
          orgId,
          `audit:${definition.jobName}`,
          {
            raceId,
            runId: run.id,
            stepNumber: definition.stepNumber,
            stepName: definition.jobName,
            ...payload,
          },
          `audit:${definition.jobName}:${raceId}:${run.id}`,
          userId,
          raceId,
          trx,
        )
        return { jobId: job.id, runId: run.id }
      })
    },
  }
}

export const auditService = createAuditService()

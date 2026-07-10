import { listTargets as defaultListTargets } from '../../services/job-executor.js'
import { scheduler as defaultScheduler } from '../../services/scheduler.js'
import * as defaultRepository from './sys-job.repository.js'

function jobError(message, code, status = 400) {
  const error = new Error(message)
  error.status = status
  error.code = code
  error.expose = true
  return error
}

export function createSysJobService({
  repository = defaultRepository,
  scheduler = defaultScheduler,
  listTargets = defaultListTargets,
} = {}) {
  function assertTarget(target) {
    if (target && !listTargets().includes(target)) {
      throw jobError('invokeTarget 未注册', 'SYS_JOB_TARGET_NOT_REGISTERED')
    }
  }

  return {
    listJobs: () => repository.listJobs(),

    createJob(data) {
      assertTarget(data.invokeTarget)
      return repository.createJob(data)
    },

    async updateJob(id, data) {
      assertTarget(data.invokeTarget)
      const job = await repository.updateJob(id, data)
      if (job?.status === 'running') scheduler.scheduleJob(job)
      return job
    },

    async deleteJob(id) {
      const deleted = await repository.deleteJob(id)
      if (deleted) scheduler.stopJob(id)
      return deleted
    },

    async startJob(id) {
      const existing = await repository.getJob(id)
      if (!existing) return null
      assertTarget(existing.invoke_target)
      const job = await repository.updateJobStatus(id, 'running')
      scheduler.scheduleJob(job)
      return job
    },

    async pauseJob(id) {
      const existing = await repository.getJob(id)
      if (!existing) return null
      const job = await repository.updateJobStatus(id, 'paused')
      scheduler.stopJob(id)
      return job
    },

    async runOnce(id) {
      const result = await scheduler.triggerOnce(id)
      if (result?.success === false) {
        throw jobError(
          result.error || '任务执行失败',
          result.skipped ? 'SYS_JOB_EXECUTION_SKIPPED' : 'SYS_JOB_EXECUTION_FAILED',
          result.skipped ? 409 : 500,
        )
      }
      return result
    },
    getLogs: (id, filters) => repository.getJobLogs(id, filters),
    listTargets,
  }
}

export const sysJobService = createSysJobService()

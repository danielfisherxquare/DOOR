import request from '../utils/request'
import { unwrapData } from '../utils/apiResponse'
import { resolveSurfacePrefix } from '../utils/surfaceApi'
import { pollJobResult } from '../utils/jobPolling'

/**
 * 审核 API — 对应后端 /api/audit
 *
 * ⚠️ 审核步骤通过 Job 引擎执行：
 *   POST → { jobId } → pollJobResult → { affected, remaining }
 */

const JOB_POLL_TIMEOUT = 120000 // 2 分钟

function getBasePath() {
    return resolveSurfacePrefix(
        {
            admin: '/admin/audit',
            app: '/app/audit',
        },
        'app'
    )
}

function getJobsBasePath() {
    return resolveSurfacePrefix(
        {
            admin: '/admin/jobs',
            app: '/app/jobs',
        },
        'app'
    )
}

export const auditApi = {
    // ── 统计 ──────────────────────────────────────────────────
  getPrepStats: (raceId) => request.get(`${getBasePath()}/prep-stats/${raceId}`).then(unwrapData),

    // ── 重置 ──────────────────────────────────────────────────
  resetAudit: (raceId) => request.post(`${getBasePath()}/reset/${raceId}`).then(unwrapData),

    // ── 5 步审核（含 Job 轮询封装）──────────────────────────
    /**
     * 执行审核步骤（封装 Job 入队 + 轮询）
     * @param {string} stepName - underage/blacklist/fake-elite/direct-lock/mass-pool
     * @param {number} raceId
     * @param {object} payload - 额外参数（如 raceDate）
     * @param {object} options - { onProgress }
     * @returns {Promise<{ affected: number, remaining: number }>}
     */
    runAuditStep: async (stepName, raceId, payload = {}, options = {}) => {
        const resp = await request.post(`${getBasePath()}/step/${stepName}/${raceId}`, payload)
        const { jobId } = unwrapData(resp)
    return pollJobResult(jobId, {
      ...options,
      timeout: JOB_POLL_TIMEOUT,
      jobsBasePath: getJobsBasePath(),
      errorLabel: '审核步骤',
    })
    },

    // ── 便捷方法 ──────────────────────────────────────────────
    stepUnderage: (raceId, payload, options) =>
        auditApi.runAuditStep('underage', raceId, payload, options),

    stepBlacklist: (raceId, payload, options) =>
        auditApi.runAuditStep('blacklist', raceId, payload, options),

    stepFakeElite: (raceId, payload, options) =>
        auditApi.runAuditStep('fake-elite', raceId, payload, options),

    stepDirectLock: (raceId, payload, options) =>
        auditApi.runAuditStep('direct-lock', raceId, payload, options),

    stepMassPool: (raceId, payload, options) =>
        auditApi.runAuditStep('mass-pool', raceId, payload, options),
}

export default auditApi

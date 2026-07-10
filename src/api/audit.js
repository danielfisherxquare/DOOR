import request from '../utils/request'
import { resolveSurfacePrefix } from '../utils/surfaceApi'

/**
 * 审核 API — 对应后端 /api/audit
 *
 * ⚠️ 审核步骤通过 Job 引擎执行：
 *   POST → { jobId } → pollJobResult → { affected, remaining }
 */

const JOB_POLL_INTERVAL = 1000  // 1 秒
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

/**
 * 轮询 Job 结果
 * @param {string} jobId - Job ID
 * @param {object} options - { interval, timeout, onProgress }
 * @returns {Promise<object>} Job result
 */
async function pollJobResult(jobId, options = {}) {
    const interval = options.interval || JOB_POLL_INTERVAL
    const timeout = options.timeout || JOB_POLL_TIMEOUT
    const onProgress = options.onProgress || (() => { })

    const startTime = Date.now()

    while (true) {
        const response = await request.get(`${getJobsBasePath()}/${jobId}`)
        const job = response.data

        if (!job) throw new Error('Job 不存在')

        // 通知调用方当前进度
        onProgress({
            status: job.status,
            progress: job.progress || 0,
            message: job.message || '',
        })

        if (job.status === 'succeeded') {
            return { success: true, data: job.result || {} }
        }
        if (job.status === 'failed') {
            throw new Error(job.error?.message || `审核步骤失败: ${jobId}`)
        }

        // 检查超时
        if (Date.now() - startTime > timeout) {
            throw new Error(`审核步骤超时 (${timeout / 1000}s): ${jobId}`)
        }

        // 等待下一轮
        await new Promise(resolve => setTimeout(resolve, interval))
    }
}

export const auditApi = {
    // ── 统计 ──────────────────────────────────────────────────
    getPrepStats: (raceId) =>
        request.get(`${getBasePath()}/prep-stats/${raceId}`),

    // ── 重置 ──────────────────────────────────────────────────
    resetAudit: (raceId) =>
        request.post(`${getBasePath()}/reset/${raceId}`),

    // ── 5 步审核（含 Job 轮询封装）──────────────────────────
    /**
     * 执行审核步骤（封装 Job 入队 + 轮询）
     * @param {string} stepName - underage/blacklist/fake-elite/direct-lock/mass-pool
     * @param {number} raceId
     * @param {object} payload - 额外参数（如 raceDate）
     * @param {object} options - { onProgress }
     * @returns {Promise<{ success: true, data: { affected: number, remaining: number } }>}
     */
    runAuditStep: async (stepName, raceId, payload = {}, options = {}) => {
        const response = await request.post(`${getBasePath()}/step/${stepName}/${raceId}`, payload)
        const { jobId } = response.data
        return pollJobResult(jobId, options)
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

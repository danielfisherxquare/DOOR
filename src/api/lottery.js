import request from '../utils/request'
import { resolveSurfacePrefix } from '../utils/surfaceApi'

const JOB_POLL_INTERVAL = 1000
const JOB_POLL_TIMEOUT = 180000

function getBasePath() {
    return resolveSurfacePrefix({
        admin: '/admin/lottery',
        app: '/app/lottery',
    }, 'app')
}

function getV2BasePath() {
    return resolveSurfacePrefix({
        admin: '/admin/lottery-v2',
        app: '/app/lottery-v2',
    }, 'app')
}

function getJobsBasePath() {
    return resolveSurfacePrefix({
        admin: '/admin/jobs',
        app: '/app/jobs',
    }, 'app')
}

async function pollJobResult(jobId, options = {}) {
    const interval = options.interval || JOB_POLL_INTERVAL
    const timeout = options.timeout || JOB_POLL_TIMEOUT
    const onProgress = options.onProgress || (() => { })
    const startTime = Date.now()

    while (true) {
        const response = await request.get(`${getJobsBasePath()}/${jobId}`)
        const job = response.data

        if (!job) {
            throw new Error('抽签任务不存在')
        }

        onProgress({
            status: job.status,
            progress: job.progress || 0,
            message: job.message || '',
        })

        if (job.status === 'succeeded') {
            return { success: true, data: job.result || {} }
        }

        if (job.status === 'failed') {
            throw new Error(job.error?.message || '抽签任务失败')
        }

        if (Date.now() - startTime > timeout) {
            throw new Error(`抽签任务超时 (${timeout / 1000}s)`)
        }

        await new Promise((resolve) => setTimeout(resolve, interval))
    }
}

/**
 * 抽签配置 API — 应用层 /api/app/lottery，后台层 /api/admin/lottery。
 *
 * 覆盖: race_capacity / lottery_configs / lottery_lists / lottery_rules / lottery_weights
 */
export const lotteryApi = {
    // ── race_capacity ────────────────────────────────────────
    getRaceCapacity: (raceId) =>
        request.get(`${getBasePath()}/configs/${raceId}`),

    saveRaceCapacity: (raceId, data) =>
        request.post(`${getBasePath()}/configs/${raceId}`, data),

    deleteRaceCapacity: (id) =>
        request.delete(`${getBasePath()}/configs/entry/${id}`),

    // ── lottery_lists ────────────────────────────────────────
    getLotteryLists: (raceId, listType) =>
        request.get(`${getBasePath()}/lists/${raceId}`, { params: { listType } }),

    saveLotteryLists: (entries) =>
        request.post(`${getBasePath()}/lists`, { entries }),

    deleteLotteryList: (id) =>
        request.delete(`${getBasePath()}/lists/entry/${id}`),

    clearLotteryLists: (raceId, listType) =>
        request.delete(`${getBasePath()}/lists/${raceId}`, { params: { listType } }),

    updateLotteryList: (id, data) =>
        request.put(`${getBasePath()}/lists/entry/${id}`, data),

    bulkAddLotteryLists: (entries) =>
        request.post(`${getBasePath()}/lists/bulk-add`, { entries }),

    bulkPutLotteryLists: (entries) =>
        request.post(`${getBasePath()}/lists/bulk-put`, { entries }),

    bulkDeleteLotteryLists: (ids) =>
        request.post(`${getBasePath()}/lists/bulk-delete`, { ids }),

    getLotteryListConflicts: (raceId) =>
        request.get(`${getBasePath()}/lists/conflicts/${raceId}`),

    // ── lottery_rules ────────────────────────────────────────
    getLotteryRules: (raceId) =>
        request.get(`${getBasePath()}/rules/${raceId}`),

    saveLotteryRule: (data) =>
        request.post(`${getBasePath()}/rules`, data),

    // ── lottery_weights ──────────────────────────────────────
    getLotteryWeights: (raceId) =>
        request.get(`${getBasePath()}/weights/${raceId}`),

    saveLotteryWeight: (data) =>
        request.post(`${getBasePath()}/weights`, data),

    deleteLotteryWeight: (id) =>
        request.delete(`${getBasePath()}/weights/${id}`),

    clearAllLotteryWeights: (raceId) =>
        request.delete(`${getBasePath()}/weights/all/${raceId}`),

    // ── Phase 6: 抽签执行 / 结果 / 快照 / 回滚 ─────────────
    finalizeLottery: async (raceId, options = {}) => {
        const response = await request.post(`${getBasePath()}/finalize/${raceId}`)
        const { jobId } = response.data
        return pollJobResult(jobId, options)
    },

    getLotteryResults: (raceId) =>
        request.get(`${getBasePath()}/results/${raceId}`),

    hasSnapshot: (raceId) =>
        request.get(`${getBasePath()}/has-snapshot/${raceId}`),

    rollbackLottery: (raceId) =>
        request.post(`${getBasePath()}/rollback/${raceId}`),

    // ── Lottery V2 Beta ─────────────────────────────────────
    getLotteryV2Config: (raceId) =>
        request.get(`${getV2BasePath()}/config/${raceId}`),

    saveLotteryV2Config: (raceId, data) =>
        request.put(`${getV2BasePath()}/config/${raceId}`, data),

    previewLotteryV2: async (raceId, options = {}) => {
        const response = await request.post(`${getV2BasePath()}/preview/${raceId}`)
        const { jobId } = response.data
        return pollJobResult(jobId, options)
    },

    getLotteryV2Preview: (raceId) =>
        request.get(`${getV2BasePath()}/preview/${raceId}`),

    finalizeLotteryV2: async (raceId, options = {}) => {
        const response = await request.post(`${getV2BasePath()}/finalize/${raceId}`)
        const { jobId } = response.data
        return pollJobResult(jobId, options)
    },

    getLotteryV2Results: (raceId) =>
        request.get(`${getV2BasePath()}/results/${raceId}`),

    rollbackLotteryV2: (raceId) =>
        request.post(`${getV2BasePath()}/rollback/${raceId}`),
}

export default lotteryApi

import request from '../utils/request'

const JOB_POLL_INTERVAL = 1000
const JOB_POLL_TIMEOUT = 180000
const BASE_PATH = '/app/lottery'
const V2_BASE_PATH = '/app/lottery-v2'
const JOBS_BASE_PATH = '/app/jobs'

async function pollJobResult(jobId, options = {}) {
    const interval = options.interval || JOB_POLL_INTERVAL
    const timeout = options.timeout || JOB_POLL_TIMEOUT
    const onProgress = options.onProgress || (() => { })
    const startTime = Date.now()

    while (true) {
        const response = await request.get(`${JOBS_BASE_PATH}/${jobId}`)
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
 * 抽签配置 API — 应用层 /api/app/lottery。
 *
 * 覆盖: race_capacity / lottery_configs / lottery_lists / lottery_rules / lottery_weights
 */
export const lotteryApi = {
    // ── race_capacity ────────────────────────────────────────
    getRaceCapacity: (raceId) =>
        request.get(`${BASE_PATH}/configs/${raceId}`),

    saveRaceCapacity: (raceId, data) =>
        request.post(`${BASE_PATH}/configs/${raceId}`, data),

    deleteRaceCapacity: (id) =>
        request.delete(`${BASE_PATH}/configs/entry/${id}`),

    // ── lottery_lists ────────────────────────────────────────
    getLotteryLists: (raceId, listType) =>
        request.get(`${BASE_PATH}/lists/${raceId}`, { params: { listType } }),

    saveLotteryLists: (entries) =>
        request.post(`${BASE_PATH}/lists`, { entries }),

    deleteLotteryList: (id) =>
        request.delete(`${BASE_PATH}/lists/entry/${id}`),

    clearLotteryLists: (raceId, listType) =>
        request.delete(`${BASE_PATH}/lists/${raceId}`, { params: { listType } }),

    updateLotteryList: (id, data) =>
        request.put(`${BASE_PATH}/lists/entry/${id}`, data),

    bulkAddLotteryLists: (entries) =>
        request.post(`${BASE_PATH}/lists/bulk-add`, { entries }),

    bulkPutLotteryLists: (entries) =>
        request.post(`${BASE_PATH}/lists/bulk-put`, { entries }),

    bulkDeleteLotteryLists: (ids) =>
        request.post(`${BASE_PATH}/lists/bulk-delete`, { ids }),

    getLotteryListConflicts: (raceId) =>
        request.get(`${BASE_PATH}/lists/conflicts/${raceId}`),

    // ── lottery_rules ────────────────────────────────────────
    getLotteryRules: (raceId) =>
        request.get(`${BASE_PATH}/rules/${raceId}`),

    saveLotteryRule: (data) =>
        request.post(`${BASE_PATH}/rules`, data),

    // ── lottery_weights ──────────────────────────────────────
    getLotteryWeights: (raceId) =>
        request.get(`${BASE_PATH}/weights/${raceId}`),

    saveLotteryWeight: (data) =>
        request.post(`${BASE_PATH}/weights`, data),

    deleteLotteryWeight: (id) =>
        request.delete(`${BASE_PATH}/weights/${id}`),

    clearAllLotteryWeights: (raceId) =>
        request.delete(`${BASE_PATH}/weights/all/${raceId}`),

    // ── Phase 6: 抽签执行 / 结果 / 快照 / 回滚 ─────────────
    finalizeLottery: async (raceId, options = {}) => {
        const response = await request.post(`${BASE_PATH}/finalize/${raceId}`)
        const { jobId } = response.data
        return pollJobResult(jobId, options)
    },

    getLotteryResults: (raceId) =>
        request.get(`${BASE_PATH}/results/${raceId}`),

    hasSnapshot: (raceId) =>
        request.get(`${BASE_PATH}/has-snapshot/${raceId}`),

    rollbackLottery: (raceId) =>
        request.post(`${BASE_PATH}/rollback/${raceId}`),

    // ── Lottery V2 Beta ─────────────────────────────────────
    getLotteryV2Config: (raceId) =>
        request.get(`${V2_BASE_PATH}/config/${raceId}`),

    saveLotteryV2Config: (raceId, data) =>
        request.put(`${V2_BASE_PATH}/config/${raceId}`, data),

    previewLotteryV2: async (raceId, options = {}) => {
        const response = await request.post(`${V2_BASE_PATH}/preview/${raceId}`)
        const { jobId } = response.data
        return pollJobResult(jobId, options)
    },

    getLotteryV2Preview: (raceId) =>
        request.get(`${V2_BASE_PATH}/preview/${raceId}`),

    finalizeLotteryV2: async (raceId, options = {}) => {
        const response = await request.post(`${V2_BASE_PATH}/finalize/${raceId}`)
        const { jobId } = response.data
        return pollJobResult(jobId, options)
    },

    getLotteryV2Results: (raceId) =>
        request.get(`${V2_BASE_PATH}/results/${raceId}`),

    rollbackLotteryV2: (raceId) =>
        request.post(`${V2_BASE_PATH}/rollback/${raceId}`),
}

export default lotteryApi

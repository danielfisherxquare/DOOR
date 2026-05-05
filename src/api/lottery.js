import request from '../utils/request'
import { unwrapData } from '../utils/apiResponse'

const JOB_POLL_INTERVAL = 1000
const JOB_POLL_TIMEOUT = 180000

async function pollJobResult(jobId, options = {}) {
    const interval = options.interval || JOB_POLL_INTERVAL
    const timeout = options.timeout || JOB_POLL_TIMEOUT
    const onProgress = options.onProgress || (() => { })
    const startTime = Date.now()

    while (true) {
        const response = await request.get(`/jobs/${jobId}`)
        const job = unwrapData(response)

        if (!job) {
            throw new Error('抽签任务不存在')
        }

        onProgress({
            status: job.status,
            progress: job.progress || 0,
            message: job.message || '',
        })

        if (job.status === 'succeeded') {
            return job.result || {}
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
 * 抽签配置 API — 对应后端 /api/lottery
 *
 * 覆盖: race_capacity / lottery_configs / lottery_lists / lottery_rules / lottery_weights
 */
export const lotteryApi = {
    // ── race_capacity ────────────────────────────────────────
    getRaceCapacity: (raceId) =>
        request.get(`/lottery/configs/${raceId}`).then(unwrapData),

    saveRaceCapacity: (raceId, data) =>
        request.post(`/lottery/configs/${raceId}`, data).then(unwrapData),

    deleteRaceCapacity: (id) =>
        request.delete(`/lottery/configs/entry/${id}`).then(unwrapData),

    // ── lottery_lists ────────────────────────────────────────
    getLotteryLists: (raceId, listType) =>
        request.get(`/lottery/lists/${raceId}`, { params: { listType } }).then(unwrapData),

    saveLotteryLists: (entries) =>
        request.post('/lottery/lists', { entries }).then(unwrapData),

    deleteLotteryList: (id) =>
        request.delete(`/lottery/lists/entry/${id}`).then(unwrapData),

    clearLotteryLists: (raceId, listType) =>
        request.delete(`/lottery/lists/${raceId}`, { params: { listType } }).then(unwrapData),

    updateLotteryList: (id, data) =>
        request.put(`/lottery/lists/entry/${id}`, data).then(unwrapData),

    bulkAddLotteryLists: (entries) =>
        request.post('/lottery/lists/bulk-add', { entries }).then(unwrapData),

    bulkPutLotteryLists: (entries) =>
        request.post('/lottery/lists/bulk-put', { entries }).then(unwrapData),

    bulkDeleteLotteryLists: (ids) =>
        request.post('/lottery/lists/bulk-delete', { ids }).then(unwrapData),

    getLotteryListConflicts: (raceId) =>
        request.get(`/lottery/lists/conflicts/${raceId}`).then(unwrapData),

    // ── lottery_rules ────────────────────────────────────────
    getLotteryRules: (raceId) =>
        request.get(`/lottery/rules/${raceId}`).then(unwrapData),

    saveLotteryRule: (data) =>
        request.post('/lottery/rules', data).then(unwrapData),

    // ── lottery_weights ──────────────────────────────────────
    getLotteryWeights: (raceId) =>
        request.get(`/lottery/weights/${raceId}`).then(unwrapData),

    saveLotteryWeight: (data) =>
        request.post('/lottery/weights', data).then(unwrapData),

    deleteLotteryWeight: (id) =>
        request.delete(`/lottery/weights/${id}`).then(unwrapData),

    clearAllLotteryWeights: (raceId) =>
        request.delete(`/lottery/weights/all/${raceId}`).then(unwrapData),

    // ── Phase 6: 抽签执行 / 结果 / 快照 / 回滚 ─────────────
    finalizeLottery: async (raceId, options = {}) => {
        const response = await request.post(`/lottery/finalize/${raceId}`)
        const { jobId } = unwrapData(response)
        return pollJobResult(jobId, options)
    },

    getLotteryResults: (raceId) =>
        request.get(`/lottery/results/${raceId}`).then(unwrapData),

    hasSnapshot: (raceId) =>
        request.get(`/lottery/has-snapshot/${raceId}`).then((response) => Boolean(unwrapData(response)?.hasSnapshot)),

    rollbackLottery: (raceId) =>
        request.post(`/lottery/rollback/${raceId}`).then(unwrapData),

    // ── Lottery V2 Beta ─────────────────────────────────────
    getLotteryV2Config: (raceId) =>
        request.get(`/lottery-v2/config/${raceId}`).then(unwrapData),

    saveLotteryV2Config: (raceId, data) =>
        request.put(`/lottery-v2/config/${raceId}`, data).then(unwrapData),

    previewLotteryV2: async (raceId, options = {}) => {
        const response = await request.post(`/lottery-v2/preview/${raceId}`)
        const { jobId } = unwrapData(response)
        return pollJobResult(jobId, options)
    },

    getLotteryV2Preview: (raceId) =>
        request.get(`/lottery-v2/preview/${raceId}`).then(unwrapData),

    finalizeLotteryV2: async (raceId, options = {}) => {
        const response = await request.post(`/lottery-v2/finalize/${raceId}`)
        const { jobId } = unwrapData(response)
        return pollJobResult(jobId, options)
    },

    getLotteryV2Results: (raceId) =>
        request.get(`/lottery-v2/results/${raceId}`).then(unwrapData),

    rollbackLotteryV2: (raceId) =>
        request.post(`/lottery-v2/rollback/${raceId}`).then(unwrapData),
}

export default lotteryApi

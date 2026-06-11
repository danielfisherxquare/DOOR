import request from '../utils/request'
import { unwrapData } from '../utils/apiResponse'
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
 * 抽签配置 API — 应用层 /api/app/lottery，后台层 /api/admin/lottery。
 *
 * 覆盖: race_capacity / lottery_configs / lottery_lists / lottery_rules / lottery_weights
 */
export const lotteryApi = {
    // ── race_capacity ────────────────────────────────────────
    getRaceCapacity: (raceId) =>
        request.get(`${getBasePath()}/configs/${raceId}`).then(unwrapData),

    saveRaceCapacity: (raceId, data) =>
        request.post(`${getBasePath()}/configs/${raceId}`, data).then(unwrapData),

    deleteRaceCapacity: (id) =>
        request.delete(`${getBasePath()}/configs/entry/${id}`).then(unwrapData),

    // ── lottery_lists ────────────────────────────────────────
    getLotteryLists: (raceId, listType) =>
        request.get(`${getBasePath()}/lists/${raceId}`, { params: { listType } }).then(unwrapData),

    saveLotteryLists: (entries) =>
        request.post(`${getBasePath()}/lists`, { entries }).then(unwrapData),

    deleteLotteryList: (id) =>
        request.delete(`${getBasePath()}/lists/entry/${id}`).then(unwrapData),

    clearLotteryLists: (raceId, listType) =>
        request.delete(`${getBasePath()}/lists/${raceId}`, { params: { listType } }).then(unwrapData),

    updateLotteryList: (id, data) =>
        request.put(`${getBasePath()}/lists/entry/${id}`, data).then(unwrapData),

    bulkAddLotteryLists: (entries) =>
        request.post(`${getBasePath()}/lists/bulk-add`, { entries }).then(unwrapData),

    bulkPutLotteryLists: (entries) =>
        request.post(`${getBasePath()}/lists/bulk-put`, { entries }).then(unwrapData),

    bulkDeleteLotteryLists: (ids) =>
        request.post(`${getBasePath()}/lists/bulk-delete`, { ids }).then(unwrapData),

    getLotteryListConflicts: (raceId) =>
        request.get(`${getBasePath()}/lists/conflicts/${raceId}`).then(unwrapData),

    // ── lottery_rules ────────────────────────────────────────
    getLotteryRules: (raceId) =>
        request.get(`${getBasePath()}/rules/${raceId}`).then(unwrapData),

    saveLotteryRule: (data) =>
        request.post(`${getBasePath()}/rules`, data).then(unwrapData),

    // ── lottery_weights ──────────────────────────────────────
    getLotteryWeights: (raceId) =>
        request.get(`${getBasePath()}/weights/${raceId}`).then(unwrapData),

    saveLotteryWeight: (data) =>
        request.post(`${getBasePath()}/weights`, data).then(unwrapData),

    deleteLotteryWeight: (id) =>
        request.delete(`${getBasePath()}/weights/${id}`).then(unwrapData),

    clearAllLotteryWeights: (raceId) =>
        request.delete(`${getBasePath()}/weights/all/${raceId}`).then(unwrapData),

    // ── Phase 6: 抽签执行 / 结果 / 快照 / 回滚 ─────────────
    finalizeLottery: async (raceId, options = {}) => {
        const response = await request.post(`${getBasePath()}/finalize/${raceId}`)
        const { jobId } = unwrapData(response)
        return pollJobResult(jobId, options)
    },

    getLotteryResults: (raceId) =>
        request.get(`${getBasePath()}/results/${raceId}`).then(unwrapData),

    hasSnapshot: (raceId) =>
        request.get(`${getBasePath()}/has-snapshot/${raceId}`).then((response) => Boolean(unwrapData(response)?.hasSnapshot)),

    rollbackLottery: (raceId) =>
        request.post(`${getBasePath()}/rollback/${raceId}`).then(unwrapData),

    // ── Lottery V2 Beta ─────────────────────────────────────
    getLotteryV2Config: (raceId) =>
        request.get(`${getV2BasePath()}/config/${raceId}`).then(unwrapData),

    saveLotteryV2Config: (raceId, data) =>
        request.put(`${getV2BasePath()}/config/${raceId}`, data).then(unwrapData),

    previewLotteryV2: async (raceId, options = {}) => {
        const response = await request.post(`${getV2BasePath()}/preview/${raceId}`)
        const { jobId } = unwrapData(response)
        return pollJobResult(jobId, options)
    },

    getLotteryV2Preview: (raceId) =>
        request.get(`${getV2BasePath()}/preview/${raceId}`).then(unwrapData),

    finalizeLotteryV2: async (raceId, options = {}) => {
        const response = await request.post(`${getV2BasePath()}/finalize/${raceId}`)
        const { jobId } = unwrapData(response)
        return pollJobResult(jobId, options)
    },

    getLotteryV2Results: (raceId) =>
        request.get(`${getV2BasePath()}/results/${raceId}`).then(unwrapData),

    rollbackLotteryV2: (raceId) =>
        request.post(`${getV2BasePath()}/rollback/${raceId}`).then(unwrapData),
}

export default lotteryApi

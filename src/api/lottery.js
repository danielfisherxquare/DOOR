import request from '../utils/request'

/**
 * 抽签配置 API — 对应后端 /api/lottery
 *
 * 覆盖: race_capacity / lottery_configs / lottery_lists / lottery_rules / lottery_weights
 */
export const lotteryApi = {
    // ── race_capacity ────────────────────────────────────────
    getRaceCapacity: (raceId) =>
        request.get(`/lottery/configs/${raceId}`),

    saveRaceCapacity: (raceId, data) =>
        request.post(`/lottery/configs/${raceId}`, data),

    // ── lottery_lists ────────────────────────────────────────
    getLotteryLists: (raceId, listType) =>
        request.get(`/lottery/lists/${raceId}`, { params: { listType } }),

    saveLotteryLists: (entries) =>
        request.post('/lottery/lists', { entries }),

    deleteLotteryList: (id) =>
        request.delete(`/lottery/lists/entry/${id}`),

    clearLotteryLists: (raceId, listType) =>
        request.delete(`/lottery/lists/${raceId}`, { params: { listType } }),

    updateLotteryList: (id, data) =>
        request.put(`/lottery/lists/entry/${id}`, data),

    bulkAddLotteryLists: (entries) =>
        request.post('/lottery/lists/bulk-add', { entries }),

    bulkPutLotteryLists: (entries) =>
        request.post('/lottery/lists/bulk-put', { entries }),

    bulkDeleteLotteryLists: (ids) =>
        request.post('/lottery/lists/bulk-delete', { ids }),

    getLotteryListConflicts: (raceId) =>
        request.get(`/lottery/lists/conflicts/${raceId}`),

    // ── lottery_rules ────────────────────────────────────────
    getLotteryRules: (raceId) =>
        request.get(`/lottery/rules/${raceId}`),

    saveLotteryRule: (data) =>
        request.post('/lottery/rules', data),

    // ── lottery_weights ──────────────────────────────────────
    getLotteryWeights: (raceId) =>
        request.get(`/lottery/weights/${raceId}`),

    saveLotteryWeight: (data) =>
        request.post('/lottery/weights', data),

    deleteLotteryWeight: (id) =>
        request.delete(`/lottery/weights/${id}`),

    clearAllLotteryWeights: (raceId) =>
        request.delete(`/lottery/weights/all/${raceId}`),

    // ── Phase 6: 抽签执行 / 结果 / 快照 / 回滚 ─────────────
    finalizeLottery: (raceId) =>
        request.post(`/lottery/finalize/${raceId}`),

    getLotteryResults: (raceId) =>
        request.get(`/lottery/results/${raceId}`),

    hasSnapshot: (raceId) =>
        request.get(`/lottery/has-snapshot/${raceId}`),

    rollbackLottery: (raceId) =>
        request.post(`/lottery/rollback/${raceId}`),
}

export default lotteryApi

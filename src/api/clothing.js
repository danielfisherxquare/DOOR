import request from '../utils/request'

/**
 * 服装库存 API — 对应后端 /api/clothing
 */
export const clothingApi = {
    /**
     * 获取库存列表
     * @param {number} raceId
     */
    getLimits: (raceId) =>
        request.get(`/clothing/limits/${raceId}`),

    /**
     * 保存单条库存（UPSERT）
     * @param {object} data - { raceId, event, gender, size, totalInventory, usedCount }
     */
    saveLimit: (data) =>
        request.post('/clothing/limits', data),

    /**
     * 批量保存库存（UPSERT）
     * @param {Array} items
     */
    saveLimits: (items) =>
        request.post('/clothing/limits/bulk', { items }),

    /**
     * 增减已用量
     * @param {object} data - { raceId, event, gender, size, delta }
     */
    incrementUsed: (data) =>
        request.post('/clothing/limits/increment', data),

    /**
     * 库存统计
     * @param {number} raceId
     */
    getStatistics: (raceId) =>
        request.get(`/clothing/statistics/${raceId}`),
}

export default clothingApi

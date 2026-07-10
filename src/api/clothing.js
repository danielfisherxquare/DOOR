import request from '../utils/request'

const BASE_PATH = '/app/clothing'

/**
 * 服装库存 API — 应用层 /api/app/clothing。
 */
export const clothingApi = {
    /**
     * 获取库存列表
     * @param {number} raceId
     */
    getLimits: (raceId) =>
        request.get(`${BASE_PATH}/limits/${raceId}`),

    /**
     * 保存单条库存（UPSERT）
     * @param {object} data - { raceId, event, gender, size, totalInventory, usedCount }
     */
    saveLimit: (data) =>
        request.post(`${BASE_PATH}/limits`, data),

    /**
     * 批量保存库存（UPSERT）
     * @param {Array} items
     */
    saveLimits: (items) =>
        request.post(`${BASE_PATH}/limits/bulk`, { items }),

    /**
     * 增减已用量
     * @param {object} data - { raceId, event, gender, size, delta }
     */
    incrementUsed: (data) =>
        request.post(`${BASE_PATH}/limits/increment`, data),

    /**
     * 库存统计
     * @param {number} raceId
     */
    getStatistics: (raceId) =>
        request.get(`${BASE_PATH}/statistics/${raceId}`),
}

export default clothingApi

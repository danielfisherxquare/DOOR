import request from '../utils/request'
import { resolveSurfacePrefix } from '../utils/surfaceApi'

function getBasePath() {
  return resolveSurfacePrefix(
    {
        admin: '/admin/clothing',
        app: '/app/clothing',
    },
    'app'
  )
}

/**
 * 服装库存 API — 应用层 /api/app/clothing，后台层 /api/admin/clothing。
 */
export const clothingApi = {
    /**
     * 获取库存列表
     * @param {number} raceId
     */
  getLimits: (raceId) => request.get(`${getBasePath()}/limits/${raceId}`),

    /**
     * 保存单条库存（UPSERT）
     * @param {object} data - { raceId, event, gender, size, totalInventory, usedCount }
     */
  saveLimit: (data) => request.post(`${getBasePath()}/limits`, data),

    /**
     * 批量保存库存（UPSERT）
     * @param {Array} items
     */
  saveLimits: (items) => request.post(`${getBasePath()}/limits/bulk`, { items }),

    /**
     * 增减已用量
     * @param {object} data - { raceId, event, gender, size, delta }
     */
  incrementUsed: (data) => request.post(`${getBasePath()}/limits/increment`, data),

    /**
     * 库存统计
     * @param {number} raceId
     */
  getStatistics: (raceId) => request.get(`${getBasePath()}/statistics/${raceId}`),
}

export default clothingApi

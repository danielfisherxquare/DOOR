import request from '../utils/request'

/**
 * 赛事 API — 对应后端 /api/races
 */
export const racesApi = {
    /**
     * 获取组织下所有赛事
     * @returns {Promise<{ success: boolean, data: Array }>}
     */
    getAll: () => request.get('/races'),

    /**
     * 获取单个赛事详情
     * @param {number|string} raceId
     * @returns {Promise<{ success: boolean, data: object }>}
     */
    getById: (raceId) => request.get(`/races/${raceId}`),

    /**
     * 创建赛事
     * @param {object} data - { name, date, location, events, conflictRule, ... }
     * @returns {Promise<{ success: boolean, data: object }>}
     */
    create: (data) => request.post('/races', data),

    /**
     * 更新赛事
     * @param {number|string} raceId
     * @param {object} data - 需要更新的字段
     * @returns {Promise<{ success: boolean, data: object }>}
     */
    update: (raceId, data) => request.put(`/races/${raceId}`, data),

    /**
     * 删除赛事
     * @param {number|string} raceId
     * @returns {Promise<{ success: boolean }>}
     */
    remove: (raceId) => request.delete(`/races/${raceId}`),
}

export default racesApi

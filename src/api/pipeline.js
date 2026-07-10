import request from '../utils/request'

const BASE_PATH = '/app/pipeline'
const CLOTHING_BASE_PATH = '/app/clothing'

/**
 * 出发区 + 成绩规则 API — 应用层 /api/app/pipeline。
 */
export const pipelineApi = {
    // ── start_zones ──────────────────────────────────────────
    getStartZones: (raceId) =>
        request.get(`${BASE_PATH}/start-zones/${raceId}`),

    saveStartZone: (data) =>
        request.post(`${BASE_PATH}/start-zones`, data),

    deleteStartZone: (id) =>
        request.delete(`${BASE_PATH}/start-zones/${id}`),

    // ── performance_rules ────────────────────────────────────
    getPerformanceRules: (raceId) =>
        request.get(`${BASE_PATH}/performance-rules/${raceId}`),

    savePerformanceRule: (data) =>
        request.post(`${BASE_PATH}/performance-rules`, data),

    // ── filter execution ──────────────────────────────────────
    /**
     * 执行成绩筛选（同步，非 Job）
     * @param {number} raceId
     * @returns {Promise<{ success: true, data: { qualifiedCount, unqualifiedCount, noTimeCount } }>}
     */
    filterPerformance: (raceId) =>
        request.post(`${BASE_PATH}/filter-performance/${raceId}`),

    getPreview: (raceId) =>
        request.get(`${BASE_PATH}/preview/${raceId}`),

    getClothingLimits: (raceId) =>
        request.get(`${CLOTHING_BASE_PATH}/limits/${raceId}`),
}

export default pipelineApi

import request from '../utils/request'
import { resolveSurfacePrefix } from '../utils/surfaceApi'

function getBasePath() {
    return resolveSurfacePrefix({
        admin: '/admin/pipeline',
        app: '/app/pipeline',
    }, 'app')
}

function getClothingBasePath() {
    return resolveSurfacePrefix({
        admin: '/admin/clothing',
        app: '/app/clothing',
    }, 'app')
}

/**
 * 出发区 + 成绩规则 API — 应用层 /api/app/pipeline，后台层 /api/admin/pipeline。
 */
export const pipelineApi = {
    // ── start_zones ──────────────────────────────────────────
    getStartZones: (raceId) =>
        request.get(`${getBasePath()}/start-zones/${raceId}`),

    saveStartZone: (data) =>
        request.post(`${getBasePath()}/start-zones`, data),

    deleteStartZone: (id) =>
        request.delete(`${getBasePath()}/start-zones/${id}`),

    // ── performance_rules ────────────────────────────────────
    getPerformanceRules: (raceId) =>
        request.get(`${getBasePath()}/performance-rules/${raceId}`),

    savePerformanceRule: (data) =>
        request.post(`${getBasePath()}/performance-rules`, data),

    // ── filter execution ──────────────────────────────────────
    /**
     * 执行成绩筛选（同步，非 Job）
     * @param {number} raceId
     * @returns {Promise<{ success: true, data: { qualifiedCount, unqualifiedCount, noTimeCount } }>}
     */
    filterPerformance: (raceId) =>
        request.post(`${getBasePath()}/filter-performance/${raceId}`),

    getPreview: (raceId) =>
        request.get(`${getBasePath()}/preview/${raceId}`),

    getClothingLimits: (raceId) =>
        request.get(`${getClothingBasePath()}/limits/${raceId}`),
}

export default pipelineApi

import request from '../utils/request'
import { unwrapData } from '../utils/apiResponse'
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
        request.get(`${getBasePath()}/start-zones/${raceId}`).then(unwrapData),

    saveStartZone: (data) =>
        request.post(`${getBasePath()}/start-zones`, data).then(unwrapData),

    deleteStartZone: (id) =>
        request.delete(`${getBasePath()}/start-zones/${id}`).then(unwrapData),

    // ── performance_rules ────────────────────────────────────
    getPerformanceRules: (raceId) =>
        request.get(`${getBasePath()}/performance-rules/${raceId}`).then(unwrapData),

    savePerformanceRule: (data) =>
        request.post(`${getBasePath()}/performance-rules`, data).then(unwrapData),

    // ── filter execution ──────────────────────────────────────
    /**
     * 执行成绩筛选（同步，非 Job）
     * @param {number} raceId
     * @returns {Promise<{ qualifiedCount, unqualifiedCount, noTimeCount }>}
     */
    filterPerformance: (raceId) =>
        request.post(`${getBasePath()}/filter-performance/${raceId}`).then(unwrapData),

    // ── Phase 6: Pipeline 执行 ────────────────────────────────
    executePipeline: (raceId) =>
        request.post(`${getBasePath()}/execute/${raceId}`).then(unwrapData),

    getExecutionStatus: (executionId) =>
        request.get(`${getBasePath()}/execution/${executionId}`).then(unwrapData),

    getPreview: (raceId) =>
        request.get(`${getBasePath()}/preview/${raceId}`).then(unwrapData),

    previewPipeline: (raceId) =>
        pipelineApi.getPreview(raceId),

    getClothingLimits: (raceId) =>
        request.get(`${getClothingBasePath()}/limits/${raceId}`).then(unwrapData),
}

export default pipelineApi

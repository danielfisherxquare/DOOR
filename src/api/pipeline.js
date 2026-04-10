import request from '../utils/request'
import { unwrapData } from '../utils/apiResponse'

/**
 * 出发区 + 成绩规则 API — 对应后端 /api/pipeline
 */
export const pipelineApi = {
    // ── start_zones ──────────────────────────────────────────
    getStartZones: (raceId) =>
        request.get(`/pipeline/start-zones/${raceId}`).then(unwrapData),

    saveStartZone: (data) =>
        request.post('/pipeline/start-zones', data).then(unwrapData),

    deleteStartZone: (id) =>
        request.delete(`/pipeline/start-zones/${id}`).then(unwrapData),

    // ── performance_rules ────────────────────────────────────
    getPerformanceRules: (raceId) =>
        request.get(`/pipeline/performance-rules/${raceId}`).then(unwrapData),

    savePerformanceRule: (data) =>
        request.post('/pipeline/performance-rules', data).then(unwrapData),

    // ── filter execution ──────────────────────────────────────
    /**
     * 执行成绩筛选（同步，非 Job）
     * @param {number} raceId
     * @returns {Promise<{ qualifiedCount, unqualifiedCount, noTimeCount }>}
     */
    filterPerformance: (raceId) =>
        request.post(`/pipeline/filter-performance/${raceId}`).then(unwrapData),

    // ── Phase 6: Pipeline 执行 ────────────────────────────────
    executePipeline: (raceId) =>
        request.post(`/pipeline/execute/${raceId}`).then(unwrapData),

    getExecutionStatus: (executionId) =>
        request.get(`/pipeline/execution/${executionId}`).then(unwrapData),

    getPreview: (raceId) =>
        request.get(`/pipeline/preview/${raceId}`).then(unwrapData),

    previewPipeline: (raceId) =>
        pipelineApi.getPreview(raceId),

    getClothingLimits: (raceId) =>
        request.get(`/clothing/limits/${raceId}`).then(unwrapData),
}

export default pipelineApi

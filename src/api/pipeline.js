import request from '../utils/request'

/**
 * 出发区 + 成绩规则 API — 对应后端 /api/pipeline
 */
export const pipelineApi = {
    // ── start_zones ──────────────────────────────────────────
    getStartZones: (raceId) =>
        request.get(`/pipeline/start-zones/${raceId}`),

    saveStartZone: (data) =>
        request.post('/pipeline/start-zones', data),

    deleteStartZone: (id) =>
        request.delete(`/pipeline/start-zones/${id}`),

    // ── performance_rules ────────────────────────────────────
    getPerformanceRules: (raceId) =>
        request.get(`/pipeline/performance-rules/${raceId}`),

    savePerformanceRule: (data) =>
        request.post('/pipeline/performance-rules', data),

    // ── filter execution ──────────────────────────────────────
    /**
     * 执行成绩筛选（同步，非 Job）
     * @param {number} raceId
     * @returns {Promise<{ qualifiedCount, unqualifiedCount, noTimeCount }>}
     */
    filterPerformance: (raceId) =>
        request.post(`/pipeline/filter-performance/${raceId}`),

    // ── Phase 6: Pipeline 执行 ────────────────────────────────
    executePipeline: (raceId) =>
        request.post(`/pipeline/execute/${raceId}`),

    getExecutionStatus: (executionId) =>
        request.get(`/pipeline/execution/${executionId}`),

    previewPipeline: (raceId) =>
        request.post(`/pipeline/preview/${raceId}`),
}

export default pipelineApi

import request from '../utils/request'

const BASE_PATH = '/app/bib'

/**
 * Bib 排号 API — 应用层 /api/app/bib。
 *
 * 覆盖: bib_numbering_configs / bib_assignments / 排号快照
 */
export const bibApi = {
    // ── Overview ──────────────────────────────────────────────
    getBibOverview: (raceId) =>
        request.get(`${BASE_PATH}/overview/${raceId}`),

    // ── Templates CRUD ───────────────────────────────────────
    getBibTemplates: (raceId) =>
        request.get(`${BASE_PATH}/templates/${raceId}`),

    saveBibTemplate: (data) =>
        request.post(`${BASE_PATH}/templates`, data),

    deleteBibTemplate: (id) =>
        request.delete(`${BASE_PATH}/templates/${id}`),

    // ── Dataset ──────────────────────────────────────────────
    getBibDataset: (raceId) =>
        request.get(`${BASE_PATH}/dataset/${raceId}`),

    getBibExecutionDataset: (raceId) =>
        request.get(`${BASE_PATH}/execution-dataset/${raceId}`),

    // ── Snapshot ─────────────────────────────────────────────
    createBibSnapshot: (raceId) =>
        request.post(`${BASE_PATH}/snapshot/${raceId}`),

    hasBibSnapshot: (raceId) =>
        request.get(`${BASE_PATH}/has-snapshot/${raceId}`),

    rollbackBib: (raceId) =>
        request.post(`${BASE_PATH}/rollback/${raceId}`),

    // ── Bulk Assign ─────────────────────────────────────────
    bulkAssignBib: (raceId, assignments) =>
        request.post(`${BASE_PATH}/bulk-assign/${raceId}`, { assignments }),

    // ── Clear ────────────────────────────────────────────────
    clearBib: (raceId) =>
        request.post(`${BASE_PATH}/clear/${raceId}`),
}

export default bibApi

import request from '../utils/request'

/**
 * Bib 排号 API — 对应后端 /api/bib
 *
 * 覆盖: bib_numbering_configs / bib_assignments / 排号快照
 */
export const bibApi = {
    // ── Overview ──────────────────────────────────────────────
    getBibOverview: (raceId) =>
        request.get(`/bib/overview/${raceId}`),

    // ── Templates CRUD ───────────────────────────────────────
    getBibTemplates: (raceId) =>
        request.get(`/bib/templates/${raceId}`),

    saveBibTemplate: (data) =>
        request.post('/bib/templates', data),

    deleteBibTemplate: (id) =>
        request.delete(`/bib/templates/${id}`),

    // ── Dataset ──────────────────────────────────────────────
    getBibDataset: (raceId) =>
        request.get(`/bib/dataset/${raceId}`),

    getBibExecutionDataset: (raceId) =>
        request.get(`/bib/execution-dataset/${raceId}`),

    // ── Snapshot ─────────────────────────────────────────────
    createBibSnapshot: (raceId) =>
        request.post(`/bib/snapshot/${raceId}`),

    rollbackBib: (raceId) =>
        request.post(`/bib/rollback/${raceId}`),

    // ── Bulk Assign ─────────────────────────────────────────
    bulkAssignBib: (raceId, assignments) =>
        request.post(`/bib/bulk-assign/${raceId}`, { assignments }),

    // ── Clear ────────────────────────────────────────────────
    clearBib: (raceId) =>
        request.post(`/bib/clear/${raceId}`),
}

export default bibApi

import request from '../utils/request'
import { unwrapData } from '../utils/apiResponse'

/**
 * Bib 排号 API — 对应后端 /api/bib
 *
 * 覆盖: bib_numbering_configs / bib_assignments / 排号快照
 */
export const bibApi = {
    // ── Overview ──────────────────────────────────────────────
    getBibOverview: (raceId) =>
        request.get(`/bib/overview/${raceId}`).then(unwrapData),

    // ── Templates CRUD ───────────────────────────────────────
    getBibTemplates: (raceId) =>
        request.get(`/bib/templates/${raceId}`).then(unwrapData),

    saveBibTemplate: (data) =>
        request.post('/bib/templates', data).then(unwrapData),

    deleteBibTemplate: (id) =>
        request.delete(`/bib/templates/${id}`).then(unwrapData),

    // ── Dataset ──────────────────────────────────────────────
    getBibDataset: (raceId) =>
        request.get(`/bib/dataset/${raceId}`).then(unwrapData),

    getBibExecutionDataset: (raceId) =>
        request.get(`/bib/execution-dataset/${raceId}`).then(unwrapData),

    // ── Snapshot ─────────────────────────────────────────────
    createBibSnapshot: (raceId) =>
        request.post(`/bib/snapshot/${raceId}`).then(unwrapData),

    hasBibSnapshot: (raceId) =>
        request.get(`/bib/has-snapshot/${raceId}`).then(unwrapData).then(d => d.hasSnapshot),

    rollbackBib: (raceId) =>
        request.post(`/bib/rollback/${raceId}`).then(unwrapData),

    // ── Bulk Assign ─────────────────────────────────────────
    bulkAssignBib: (raceId, assignments) =>
        request.post(`/bib/bulk-assign/${raceId}`, { assignments }).then(unwrapData),

    // ── Clear ────────────────────────────────────────────────
    clearBib: (raceId) =>
        request.post(`/bib/clear/${raceId}`).then(unwrapData),
}

export default bibApi

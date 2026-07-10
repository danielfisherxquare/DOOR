import request from '../utils/request'
import { resolveSurfacePrefix } from '../utils/surfaceApi'

function getBasePath() {
    return resolveSurfacePrefix({
        admin: '/admin/bib',
        app: '/app/bib',
    }, 'app')
}

/**
 * Bib 排号 API — 应用层 /api/app/bib，后台层 /api/admin/bib。
 *
 * 覆盖: bib_numbering_configs / bib_assignments / 排号快照
 */
export const bibApi = {
    // ── Overview ──────────────────────────────────────────────
    getBibOverview: (raceId) =>
        request.get(`${getBasePath()}/overview/${raceId}`),

    // ── Templates CRUD ───────────────────────────────────────
    getBibTemplates: (raceId) =>
        request.get(`${getBasePath()}/templates/${raceId}`),

    saveBibTemplate: (data) =>
        request.post(`${getBasePath()}/templates`, data),

    deleteBibTemplate: (id) =>
        request.delete(`${getBasePath()}/templates/${id}`),

    // ── Dataset ──────────────────────────────────────────────
    getBibDataset: (raceId) =>
        request.get(`${getBasePath()}/dataset/${raceId}`),

    getBibExecutionDataset: (raceId) =>
        request.get(`${getBasePath()}/execution-dataset/${raceId}`),

    // ── Snapshot ─────────────────────────────────────────────
    createBibSnapshot: (raceId) =>
        request.post(`${getBasePath()}/snapshot/${raceId}`),

    hasBibSnapshot: (raceId) =>
        request.get(`${getBasePath()}/has-snapshot/${raceId}`),

    rollbackBib: (raceId) =>
        request.post(`${getBasePath()}/rollback/${raceId}`),

    // ── Bulk Assign ─────────────────────────────────────────
    bulkAssignBib: (raceId, assignments) =>
        request.post(`${getBasePath()}/bulk-assign/${raceId}`, { assignments }),

    // ── Clear ────────────────────────────────────────────────
    clearBib: (raceId) =>
        request.post(`${getBasePath()}/clear/${raceId}`),
}

export default bibApi

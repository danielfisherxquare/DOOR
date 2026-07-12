import request from '../utils/request'
import { unwrapData } from '../utils/apiResponse'
import { resolveSurfacePrefix } from '../utils/surfaceApi'

function getBasePath() {
  return resolveSurfacePrefix(
    {
        admin: '/admin/bib',
        app: '/app/bib',
    },
    'app'
  )
}

/**
 * Bib 排号 API — 应用层 /api/app/bib，后台层 /api/admin/bib。
 *
 * 覆盖: bib_numbering_configs / bib_assignments / 排号快照
 */
export const bibApi = {
    // ── Overview ──────────────────────────────────────────────
  getBibOverview: (raceId) => request.get(`${getBasePath()}/overview/${raceId}`).then(unwrapData),

    // ── Templates CRUD ───────────────────────────────────────
  getBibTemplates: (raceId) => request.get(`${getBasePath()}/templates/${raceId}`).then(unwrapData),

  saveBibTemplate: (data) => request.post(`${getBasePath()}/templates`, data).then(unwrapData),

  deleteBibTemplate: (id) => request.delete(`${getBasePath()}/templates/${id}`).then(unwrapData),

    // ── Dataset ──────────────────────────────────────────────
  getBibDataset: (raceId) => request.get(`${getBasePath()}/dataset/${raceId}`).then(unwrapData),

    getBibExecutionDataset: (raceId) =>
        request.get(`${getBasePath()}/execution-dataset/${raceId}`).then(unwrapData),

    // ── Snapshot ─────────────────────────────────────────────
    createBibSnapshot: (raceId) =>
        request.post(`${getBasePath()}/snapshot/${raceId}`).then(unwrapData),

    hasBibSnapshot: (raceId) =>
    request
      .get(`${getBasePath()}/has-snapshot/${raceId}`)
      .then(unwrapData)
      .then((d) => d.hasSnapshot),

  rollbackBib: (raceId) => request.post(`${getBasePath()}/rollback/${raceId}`).then(unwrapData),

    // ── Bulk Assign ─────────────────────────────────────────
    bulkAssignBib: (raceId, assignments) =>
        request.post(`${getBasePath()}/bulk-assign/${raceId}`, { assignments }).then(unwrapData),

    // ── Clear ────────────────────────────────────────────────
  clearBib: (raceId) => request.post(`${getBasePath()}/clear/${raceId}`).then(unwrapData),
}

export default bibApi

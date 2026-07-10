import request from '../utils/request'

const BASE_PATHS = {
  admin: '/admin/bibs',
  ops: '/ops/bibs',
}

export function createBibTrackingApi(surface) {
  const basePath = BASE_PATHS[surface]
  if (!basePath) throw new Error(`Unsupported bib tracking surface: ${surface}`)

  return {
    resolveScan: (qrToken) => request.post(`${basePath}/scan/resolve`, { qrToken }),
    pickup: (qrToken) => request.post(`${basePath}/scan/pickup`, { qrToken }),
    listItems: (raceId, params) => request.get(`${basePath}/items/${raceId}`, { params }),
    getStats: (raceId) => request.get(`${basePath}/stats/${raceId}`),
    getItemDetail: (raceId, itemId) => request.get(`${basePath}/items/${raceId}/${itemId}`),
    rollbackStatus: (raceId, itemId, payload) => request.post(`${basePath}/items/${raceId}/${itemId}/rollback`, payload),
  }
}

export const adminBibTrackingApi = createBibTrackingApi('admin')
export const opsBibTrackingApi = createBibTrackingApi('ops')

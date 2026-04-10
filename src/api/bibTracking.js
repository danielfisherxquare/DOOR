import request from '../utils/request'
import { resolveSurfacePrefix } from '../utils/surfaceApi'

function getBasePath() {
  return resolveSurfacePrefix({
    admin: '/admin/bibs',
    ops: '/ops/bibs',
  }, 'ops')
}

const bibTrackingApi = {
  resolveScan: (qrToken) => request.post(`${getBasePath()}/scan/resolve`, { qrToken }),
  pickup: (qrToken) => request.post(`${getBasePath()}/scan/pickup`, { qrToken }),
  listItems: (raceId, params) => request.get(`${getBasePath()}/items/${raceId}`, { params }),
  getStats: (raceId) => request.get(`${getBasePath()}/stats/${raceId}`),
  getItemDetail: (raceId, itemId) => request.get(`${getBasePath()}/items/${raceId}/${itemId}`),
  rollbackStatus: (raceId, itemId, payload) => request.post(`${getBasePath()}/items/${raceId}/${itemId}/rollback`, payload),
}

export default bibTrackingApi

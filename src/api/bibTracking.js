import request from '../utils/request'

const bibTrackingApi = {
  resolveScan: (qrToken) => request.post('/bib-tracking/scan/resolve', { qrToken }),
  pickup: (qrToken) => request.post('/bib-tracking/scan/pickup', { qrToken }),
  listItems: (raceId, params) => request.get(`/bib-tracking/items/${raceId}`, { params }),
  getStats: (raceId) => request.get(`/bib-tracking/stats/${raceId}`),
  getItemDetail: (raceId, itemId) => request.get(`/bib-tracking/items/${raceId}/${itemId}`),
  rollbackStatus: (raceId, itemId, payload) => request.post(`/bib-tracking/items/${raceId}/${itemId}/rollback`, payload),
}

export default bibTrackingApi

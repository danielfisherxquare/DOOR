import request from '../../utils/request'

const BASE_PATH = '/app/bibs'

const bibTrackingApi = {
  resolveScan: (qrToken) => request.post(`${BASE_PATH}/scan/resolve`, { qrToken }),
  pickup: (qrToken) => request.post(`${BASE_PATH}/scan/pickup`, { qrToken }),
  listItems: (raceId, params) => request.get(`${BASE_PATH}/items/${raceId}`, { params }),
  getStats: (raceId) => request.get(`${BASE_PATH}/stats/${raceId}`),
  getItemDetail: (raceId, itemId) => request.get(`${BASE_PATH}/items/${raceId}/${itemId}`),
  rollbackStatus: (raceId, itemId, payload) => request.post(`${BASE_PATH}/items/${raceId}/${itemId}/rollback`, payload),
}

export default bibTrackingApi

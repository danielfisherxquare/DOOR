import request from '../utils/request'

const bibTrackingApi = {
  resolveScan: (qrToken) => request.post('/bib-tracking/scan/resolve', { qrToken }),
  pickup: (qrToken) => request.post('/bib-tracking/scan/pickup', { qrToken }),
}

export default bibTrackingApi

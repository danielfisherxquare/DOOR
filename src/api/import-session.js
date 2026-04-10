import request from '../utils/request'

function unwrap(response) {
  return response?.data ?? response
}

export const importSessionApi = {
  create: (raceId) => {
    const params = raceId ? { raceId } : {}
    return request.post('/import-sessions', params).then(unwrap)
  },

  get: (sessionId) => request.get(`/import-sessions/${sessionId}`).then(unwrap),

  setSummary: (sessionId, summary) => request.put(`/import-sessions/${sessionId}/summary`, summary).then(unwrap),

  appendChunk: (sessionId, rows) => request.post(`/import-sessions/${sessionId}/chunks`, rows).then(unwrap),

  getChunk: (sessionId, offset, limit) =>
    request.get(`/import-sessions/${sessionId}/chunks`, { params: { offset, limit } }).then(unwrap),

  clear: (sessionId) => request.delete(`/import-sessions/${sessionId}`).then(unwrap),

  commit: (sessionId, raceId, category) =>
    request.post(`/import-sessions/${sessionId}/commit`, { raceId, category }).then(unwrap),

  getJobStatus: (jobId) => request.get(`/jobs/${jobId}`).then(unwrap),
}

export default importSessionApi

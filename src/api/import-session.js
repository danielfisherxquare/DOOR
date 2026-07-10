import request from '../utils/request'

const BASE_PATH = '/app/import-sessions'
const JOBS_BASE_PATH = '/app/jobs'

export const importSessionApi = {
  create: (raceId) => {
    const params = raceId ? { raceId } : {}
    return request.post(BASE_PATH, params)
  },

  get: (sessionId) => request.get(`${BASE_PATH}/${sessionId}`),

  setSummary: (sessionId, summary) => request.put(`${BASE_PATH}/${sessionId}/summary`, summary),

  appendChunk: (sessionId, rows) => request.post(`${BASE_PATH}/${sessionId}/chunks`, rows),

  getChunk: (sessionId, offset, limit) =>
    request.get(`${BASE_PATH}/${sessionId}/chunks`, { params: { offset, limit } }),

  clear: (sessionId) => request.delete(`${BASE_PATH}/${sessionId}`),

  commit: (sessionId, raceId, category) =>
    request.post(`${BASE_PATH}/${sessionId}/commit`, { raceId, category }),

  getJobStatus: (jobId) => request.get(`${JOBS_BASE_PATH}/${jobId}`),
}

export default importSessionApi

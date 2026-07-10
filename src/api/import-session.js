import request from '../utils/request'
import { resolveSurfacePrefix } from '../utils/surfaceApi'

function getBasePath() {
  return resolveSurfacePrefix({
    admin: '/admin/import-sessions',
    app: '/app/import-sessions',
  }, 'app')
}

function getJobsBasePath() {
  return resolveSurfacePrefix({
    admin: '/admin/jobs',
    app: '/app/jobs',
  }, 'app')
}

export const importSessionApi = {
  create: (raceId) => {
    const params = raceId ? { raceId } : {}
    return request.post(getBasePath(), params)
  },

  get: (sessionId) => request.get(`${getBasePath()}/${sessionId}`),

  setSummary: (sessionId, summary) => request.put(`${getBasePath()}/${sessionId}/summary`, summary),

  appendChunk: (sessionId, rows) => request.post(`${getBasePath()}/${sessionId}/chunks`, rows),

  getChunk: (sessionId, offset, limit) =>
    request.get(`${getBasePath()}/${sessionId}/chunks`, { params: { offset, limit } }),

  clear: (sessionId) => request.delete(`${getBasePath()}/${sessionId}`),

  commit: (sessionId, raceId, category) =>
    request.post(`${getBasePath()}/${sessionId}/commit`, { raceId, category }),

  getJobStatus: (jobId) => request.get(`${getJobsBasePath()}/${jobId}`),
}

export default importSessionApi

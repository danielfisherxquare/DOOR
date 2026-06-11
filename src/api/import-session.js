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

function unwrap(response) {
  return response?.data ?? response
}

export const importSessionApi = {
  create: (raceId) => {
    const params = raceId ? { raceId } : {}
    return request.post(getBasePath(), params).then(unwrap)
  },

  get: (sessionId) => request.get(`${getBasePath()}/${sessionId}`).then(unwrap),

  setSummary: (sessionId, summary) => request.put(`${getBasePath()}/${sessionId}/summary`, summary).then(unwrap),

  appendChunk: (sessionId, rows) => request.post(`${getBasePath()}/${sessionId}/chunks`, rows).then(unwrap),

  getChunk: (sessionId, offset, limit) =>
    request.get(`${getBasePath()}/${sessionId}/chunks`, { params: { offset, limit } }).then(unwrap),

  clear: (sessionId) => request.delete(`${getBasePath()}/${sessionId}`).then(unwrap),

  commit: (sessionId, raceId, category) =>
    request.post(`${getBasePath()}/${sessionId}/commit`, { raceId, category }).then(unwrap),

  getJobStatus: (jobId) => request.get(`${getJobsBasePath()}/${jobId}`).then(unwrap),
}

export default importSessionApi

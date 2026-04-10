import request from '../utils/request'

function getInterviewApiBasePath() {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/app/')) {
    return '/app/interviews'
  }
  return '/admin/interviews'
}

export const interviewApi = {
  list: (params = {}) => request.get(getInterviewApiBasePath(), { params }),
  getById: (id) => request.get(`${getInterviewApiBasePath()}/${id}`),
  create: (data) => request.post(getInterviewApiBasePath(), data),
  update: (id, data) => request.put(`${getInterviewApiBasePath()}/${id}`, data),
  delete: (id) => request.delete(`${getInterviewApiBasePath()}/${id}`),
  compare: (ids) => request.post(`${getInterviewApiBasePath()}/compare`, { ids }),
  getCriteria: () => request.get(`${getInterviewApiBasePath()}/criteria`),
}

export default interviewApi

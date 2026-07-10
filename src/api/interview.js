import request from '../utils/request'

const BASE_PATHS = {
  admin: '/admin/interviews',
  app: '/app/interviews',
}

export function createInterviewApi(surface) {
  const basePath = BASE_PATHS[surface]
  if (!basePath) throw new Error(`Unsupported interview surface: ${surface}`)

  return {
    list: (params = {}) => request.get(basePath, { params }),
    getById: (id) => request.get(`${basePath}/${id}`),
    create: (data) => request.post(basePath, data),
    update: (id, data) => request.put(`${basePath}/${id}`, data),
    delete: (id) => request.delete(`${basePath}/${id}`),
    compare: (ids) => request.post(`${basePath}/compare`, { ids }),
    getCriteria: () => request.get(`${basePath}/criteria`),
  }
}

export const adminInterviewApi = createInterviewApi('admin')
export const appInterviewApi = createInterviewApi('app')

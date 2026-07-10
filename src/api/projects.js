import request from '../utils/request'

const BASE_PATH = '/app/projects'

const projectsApi = {
  getAll: (params) => request.get(BASE_PATH, { params }),
  getById: (id) => request.get(`${BASE_PATH}/${id}`),
  create: (data) => request.post(BASE_PATH, data),
  update: (id, data) => request.put(`${BASE_PATH}/${id}`, data),
  remove: (id) => request.delete(`${BASE_PATH}/${id}`),

  getTasks: (projectId) => request.get(`${BASE_PATH}/${projectId}/tasks`),
  createTask: (projectId, data) => request.post(`${BASE_PATH}/${projectId}/tasks`, data),
  updateTask: (projectId, taskId, data) => request.put(`${BASE_PATH}/${projectId}/tasks/${taskId}`, data),
  removeTask: (projectId, taskId) => request.delete(`${BASE_PATH}/${projectId}/tasks/${taskId}`),

  getTeamCandidates: (projectId, keyword = '') => request.get(`${BASE_PATH}/${projectId}/team-candidates`, { params: { keyword } }),
  getTaskAssignees: (projectId, taskId) => request.get(`${BASE_PATH}/${projectId}/tasks/${taskId}/assignees`),
  setTaskAssignees: (projectId, taskId, assignees) => request.put(`${BASE_PATH}/${projectId}/tasks/${taskId}/assignees`, { assignees }),
}

export default projectsApi

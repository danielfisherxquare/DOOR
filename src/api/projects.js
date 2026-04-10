import request from '../utils/request'

const projectsApi = {
  getAll: (params) => request.get('/admin/projects', { params }),
  getById: (id) => request.get(`/admin/projects/${id}`),
  create: (data) => request.post('/admin/projects', data),
  update: (id, data) => request.put(`/admin/projects/${id}`, data),
  remove: (id) => request.delete(`/admin/projects/${id}`),

  getTasks: (projectId) => request.get(`/admin/projects/${projectId}/tasks`),
  createTask: (projectId, data) => request.post(`/admin/projects/${projectId}/tasks`, data),
  updateTask: (projectId, taskId, data) => request.put(`/admin/projects/${projectId}/tasks/${taskId}`, data),
  removeTask: (projectId, taskId) => request.delete(`/admin/projects/${projectId}/tasks/${taskId}`),

  getTeamCandidates: (projectId, keyword = '') => request.get(`/admin/projects/${projectId}/team-candidates`, { params: { keyword } }),
  getTaskAssignees: (projectId, taskId) => request.get(`/admin/projects/${projectId}/tasks/${taskId}/assignees`),
  setTaskAssignees: (projectId, taskId, assignees) => request.put(`/admin/projects/${projectId}/tasks/${taskId}/assignees`, { assignees }),
}

export default projectsApi

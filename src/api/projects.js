import request from '../utils/request'

export const projectsApi = {
    getAll: (params) => request.get('/projects', { params }),
    getById: (id) => request.get(`/projects/${id}`),
    create: (data) => request.post('/projects', data),
    update: (id, data) => request.put(`/projects/${id}`, data),
    remove: (id) => request.delete(`/projects/${id}`),

    getTasks: (projectId) => request.get(`/projects/${projectId}/tasks`),
    createTask: (projectId, data) => request.post(`/projects/${projectId}/tasks`, data),
    updateTask: (projectId, taskId, data) => request.put(`/projects/${projectId}/tasks/${taskId}`, data),
    removeTask: (projectId, taskId) => request.delete(`/projects/${projectId}/tasks/${taskId}`),
}

export default projectsApi

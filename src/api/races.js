import request from '../utils/request'

/**
 * Race API - maps to backend /api/admin/races
 */
const racesApi = {
    /**
     * Get races visible to current user.
     * super_admin can pass { orgId } to scope to one org.
     */
    getAll: (params) => request.get('/admin/races', { params }),

    getById: (raceId) => request.get(`/admin/races/${raceId}`),

    create: (data) => request.post('/admin/races', data),

    update: (raceId, data) => request.put(`/admin/races/${raceId}`, data),

    remove: (raceId) => request.delete(`/admin/races/${raceId}`),
}

export default racesApi

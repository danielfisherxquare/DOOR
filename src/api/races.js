import request from '../utils/request'

/**
 * Race API - maps to backend /api/races
 */
export const racesApi = {
    /**
     * Get races visible to current user.
     * super_admin can pass { orgId } to scope to one org.
     */
    getAll: (params) => request.get('/races', { params }),

    getById: (raceId) => request.get(`/races/${raceId}`),

    create: (data) => request.post('/races', data),

    update: (raceId, data) => request.put(`/races/${raceId}`, data),

    remove: (raceId) => request.delete(`/races/${raceId}`),
}

export default racesApi

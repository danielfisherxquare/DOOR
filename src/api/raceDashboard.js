import request from '../../utils/request';

/**
 * Race Dashboard API - aggregates data for race dashboard display
 */
export const raceDashboardApi = {
    /**
     * Get complete dashboard overview for a race
     * @param {string} raceId - Race ID
     * @param {boolean} masked - If true, sensitive data will be masked
     */
    getOverview: (raceId, masked = false) => request.get(`/races/dashboard/${raceId}/overview`, {
        params: masked ? { masked: true } : {},
    }),

    /**
     * Get participant statistics only
     * @param {string} raceId - Race ID
     */
    getParticipants: (raceId) => request.get(`/races/dashboard/${raceId}/participants`),

    /**
     * Get Bib tracking statistics only
     * @param {string} raceId - Race ID
     */
    getBibStatus: (raceId) => request.get(`/races/dashboard/${raceId}/bib-status`),

    /**
     * Get inventory statistics only
     * @param {string} raceId - Race ID
     */
    getInventory: (raceId) => request.get(`/races/dashboard/${raceId}/inventory`),

    /**
     * Get credential statistics only
     * @param {string} raceId - Race ID
     */
    getCredentials: (raceId) => request.get(`/races/dashboard/${raceId}/credentials`),

    /**
     * Get recent activities
     * @param {string} raceId - Race ID
     * @param {object} options - Query options
     * @param {boolean} options.masked - If true, names will be masked
     * @param {number} options.limit - Max activities to return
     */
    getActivities: (raceId, options = {}) => request.get(`/races/dashboard/${raceId}/activities`, {
        params: options,
    }),
};

export default raceDashboardApi;
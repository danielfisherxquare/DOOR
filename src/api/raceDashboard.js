import request from '../utils/request';

const RACE_DASHBOARD_BASE_PATH = '/app/races/dashboard';

/**
 * Race Dashboard API - aggregates data for race dashboard display
 */
export const raceDashboardApi = {
    /**
     * Get complete dashboard overview for a race
     * @param {string} raceId - Race ID
     * @param {boolean} masked - If true, sensitive data will be masked
     */
    getOverview: (raceId, masked = false) => request.get(`${RACE_DASHBOARD_BASE_PATH}/${raceId}/overview`, {
        params: masked ? { masked: true } : {},
    }),

    /**
     * Get participant statistics only
     * @param {string} raceId - Race ID
     */
    getParticipants: (raceId) => request.get(`${RACE_DASHBOARD_BASE_PATH}/${raceId}/participants`),

    /**
     * Get Bib tracking statistics only
     * @param {string} raceId - Race ID
     */
    getBibStatus: (raceId) => request.get(`${RACE_DASHBOARD_BASE_PATH}/${raceId}/bib-status`),

    /**
     * Get inventory statistics only
     * @param {string} raceId - Race ID
     */
    getInventory: (raceId) => request.get(`${RACE_DASHBOARD_BASE_PATH}/${raceId}/inventory`),

    /**
     * Get credential statistics only
     * @param {string} raceId - Race ID
     */
    getCredentials: (raceId) => request.get(`${RACE_DASHBOARD_BASE_PATH}/${raceId}/credentials`),

    /**
     * Get recent activities
     * @param {string} raceId - Race ID
     * @param {object} options - Query options
     * @param {boolean} options.masked - If true, names will be masked
     * @param {number} options.limit - Max activities to return
     */
    getActivities: (raceId, options = {}) => request.get(`${RACE_DASHBOARD_BASE_PATH}/${raceId}/activities`, {
        params: options,
    }),
};

export default raceDashboardApi;

import request from '../utils/request'

const BASE_PATH = '/app/races'

/**
 * @typedef {object} AppRaceDetail
 * @property {number|string} id
 * @property {string} name
 * @property {string} date
 * @property {Array<{name: string, targetCount?: number}>} events
 * @property {'lottery'|'direct'} lotteryModeDefault
 * @property {'strict'|'permissive'} conflictRule
 */

export const appRacesApi = {
  /** @returns {Promise<{success: true, data: AppRaceDetail[]}>} */
  getAll: (params) => request.get(BASE_PATH, { params }),

  /** @returns {Promise<{success: true, data: AppRaceDetail}>} */
  getById: (raceId) => request.get(`${BASE_PATH}/${raceId}`),

  /** @returns {Promise<{success: true, data: AppRaceDetail}>} */
  updateLotteryMode: (raceId, lotteryModeDefault) => request.patch(
    `${BASE_PATH}/${raceId}/lottery-mode`,
    { lotteryModeDefault },
  ),

  /** @returns {Promise<{success: true, data: AppRaceDetail}>} */
  updateConflictRule: (raceId, conflictRule) => request.patch(
    `${BASE_PATH}/${raceId}/conflict-rule`,
    { conflictRule },
  ),
}

export default appRacesApi

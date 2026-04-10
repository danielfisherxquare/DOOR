import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import racesApi from '../api/races'

/**
 * 赛事上下文 Store
 * 管理当前选中的赛事信息
 */
const useRaceContextStore = create(
  persist(
    (set, get) => ({
      currentRaceId: null,
      currentRace: null,
      races: [],
      isLoading: false,
      error: null,

      setRace: (race) => set({
        currentRaceId: race?.id || null,
        currentRace: race,
      }),

      setRaceById: (raceId) => {
        const race = get().races.find(r => r.id === raceId)
        set({
          currentRaceId: raceId,
          currentRace: race || null,
        })
      },

      clearRace: () => set({
        currentRaceId: null,
        currentRace: null,
      }),

      loadRaces: async (orgId) => {
        set({ isLoading: true, error: null })
        try {
          const params = orgId ? { orgId } : undefined
          const response = await racesApi.getAll(params)
          if (response.success) {
            const races = Array.isArray(response.data)
              ? response.data
              : response.data?.items || []
            set({ races, isLoading: false })
            return races
          }
          set({ isLoading: false, error: response.message })
          return []
        } catch (error) {
          set({ isLoading: false, error: error.message })
          return []
        }
      },

      loadRaceDetails: async (raceId) => {
        set({ isLoading: true, error: null })
        try {
          const response = await racesApi.getById(raceId)
          if (response.success) {
            set({
              currentRace: response.data,
              currentRaceId: raceId,
              isLoading: false,
            })
            return response.data
          }
          set({ isLoading: false, error: response.message })
          return null
        } catch (error) {
          set({ isLoading: false, error: error.message })
          return null
        }
      },

      getRaceById: (raceId) => {
        return get().races.find(r => r.id === raceId) || null
      },
    }),
    {
      name: 'race-context-storage',
      partialize: (state) => ({
        currentRaceId: state.currentRaceId,
      }),
    },
  ),
)

export default useRaceContextStore
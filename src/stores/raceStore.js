import { create } from 'zustand'
import racesApi from '../api/races'
import recordsApi from '../api/records'

/**
 * 赛事 Store — 管理当前组织的赛事列表和选中状态
 * 替代原先的 db.races / RaceManager 本地逻辑
 */
const useRaceStore = create((set, get) => ({
    // ── 状态 ────────────────────────────────────────
    races: [],
    currentRace: null,
    isLoading: false,
    error: null,

    // 选手记录相关
    records: [],
    recordsTotal: 0,
    recordsLoading: false,
    quickStats: null,

    // ── 赛事 CRUD ──────────────────────────────────

    /** 拉取当前组织的全部赛事 */
    fetchRaces: async () => {
        set({ isLoading: true, error: null })
        try {
            const res = await racesApi.getAll()
            if (res.success) {
                const races = res.data
                set({ races, isLoading: false })

                // 如果当前没有选中赛事，自动选中第一个
                const { currentRace } = get()
                if (!currentRace && races.length > 0) {
                    set({ currentRace: races[0] })
                }
                return races
            }
            set({ isLoading: false })
            return []
        } catch (err) {
            set({ error: err.message, isLoading: false })
            return []
        }
    },

    /** 选中一个赛事 */
    selectRace: (race) => {
        set({ currentRace: race, records: [], recordsTotal: 0, quickStats: null })
    },

    /** 创建赛事 */
    createRace: async (data) => {
        try {
            const res = await racesApi.create(data)
            if (res.success) {
                // 刷新列表
                await get().fetchRaces()
                return { success: true, data: res.data }
            }
            return { success: false, error: '创建失败' }
        } catch (err) {
            return { success: false, error: err.message }
        }
    },

    /** 更新赛事 */
    updateRace: async (raceId, data) => {
        try {
            const res = await racesApi.update(raceId, data)
            if (res.success) {
                // 更新本地缓存
                const races = get().races.map(r => r.id === raceId ? res.data : r)
                const currentRace = get().currentRace?.id === raceId ? res.data : get().currentRace
                set({ races, currentRace })
                return { success: true, data: res.data }
            }
            return { success: false, error: '更新失败' }
        } catch (err) {
            return { success: false, error: err.message }
        }
    },

    /** 删除赛事 */
    deleteRace: async (raceId) => {
        try {
            const res = await racesApi.remove(raceId)
            if (res.success) {
                const races = get().races.filter(r => r.id !== raceId)
                const currentRace = get().currentRace?.id === raceId ? (races[0] || null) : get().currentRace
                set({ races, currentRace })
                return { success: true }
            }
            return { success: false, error: '删除失败' }
        } catch (err) {
            return { success: false, error: err.message }
        }
    },

    // ── 选手记录查询 ───────────────────────────────

    /** 查询选手记录 */
    queryRecords: async ({ keyword, filters, offset = 0, limit = 50, sort } = {}) => {
        const { currentRace } = get()
        if (!currentRace) return

        set({ recordsLoading: true })
        try {
            const res = await recordsApi.query({
                raceId: currentRace.id,
                keyword,
                filters,
                offset,
                limit,
                sort,
            })
            if (res.success) {
                set({
                    records: res.data.records,
                    recordsTotal: res.data.total,
                    recordsLoading: false,
                })
                return res.data
            }
            set({ recordsLoading: false })
        } catch (err) {
            set({ recordsLoading: false })
        }
    },

    /** 获取快速统计 */
    fetchQuickStats: async (winnerStatuses = '') => {
        const { currentRace } = get()
        if (!currentRace) return

        try {
            const res = await recordsApi.quickStats(currentRace.id, winnerStatuses)
            if (res.success) {
                set({ quickStats: res.data })
                return res.data
            }
        } catch (err) {
            // 静默失败
        }
    },

    /** 获取分析数据 */
    fetchAnalysis: async ({ keyword, filters } = {}) => {
        const { currentRace } = get()
        if (!currentRace) return null

        try {
            const res = await recordsApi.analysis({
                raceId: currentRace.id,
                keyword,
                filters,
            })
            return res.success ? res.data : null
        } catch {
            return null
        }
    },

    /** 获取字段唯一值 */
    fetchUniqueValues: async (field) => {
        const { currentRace } = get()
        if (!currentRace) return []

        try {
            const res = await recordsApi.uniqueValues({
                field,
                raceId: currentRace.id,
            })
            return res.success ? res.data : []
        } catch {
            return []
        }
    },
}))

export default useRaceStore

/**
 * Color Scheme Store
 * 配色方案状态管理 - 支持按层级（admin/app/ops）区分配色
 */

import { create } from 'zustand'
import colorSchemeApi from '../api/colorSchemeApi'

// 默认配色配置（工业红 - admin 层）
const defaultConfigBySurface = {
  admin: {
    accent: '#D8262C',
    accentHover: '#b30018',
    accentActive: '#930011',
    accentSoft: 'rgba(216, 38, 44, 0.08)',
    accentLight: '#ffb3ad',
    bgPrimary: '#fcf9f8',
    bgSecondary: '#f0eded',
    bgTertiary: '#e4e2e1',
    surface: '#ffffff',
    surfaceHover: '#f6f3f2',
    panel: '#1c1917',
    panelStrong: '#0c0a09',
    textPrimary: '#1b1c1c',
    textSecondary: '#454747',
    textMuted: '#78716c',
    textOnAccent: '#ffffff',
    border: '#e7e5e4',
    borderStrong: '#d6d3d1',
  },
  app: {
    accent: '#D4A017',
    accentHover: '#B8890E',
    accentActive: '#9A7209',
    accentSoft: 'rgba(212, 160, 23, 0.08)',
    accentLight: '#FDE68A',
    bgPrimary: '#faf9f7',
    bgSecondary: '#f0eeeb',
    bgTertiary: '#e5e3e0',
    surface: '#ffffff',
    surfaceHover: '#faf9f7',
    panel: '#1c1917',
    panelStrong: '#0c0a09',
    textPrimary: '#1c1917',
    textSecondary: '#57534e',
    textMuted: '#78716c',
    textOnAccent: '#422006',
    border: '#e7e5e4',
    borderStrong: '#d6d3d1',
  },
  ops: {
    accent: '#EA580C',
    accentHover: '#C2410C',
    accentActive: '#9A3412',
    accentSoft: 'rgba(234, 88, 12, 0.08)',
    accentLight: '#FED7AA',
    bgPrimary: '#fffaf5',
    bgSecondary: '#fef6ee',
    bgTertiary: '#fdebd5',
    surface: '#ffffff',
    surfaceHover: '#fffaf5',
    panel: '#1c1917',
    panelStrong: '#0c0a09',
    textPrimary: '#1c1917',
    textSecondary: '#57534e',
    textMuted: '#78716c',
    textOnAccent: '#ffffff',
    border: '#e7e5e4',
    borderStrong: '#d6d3d1',
  },
}

const useColorSchemeStore = create((set, get) => ({
  // 状态
  presets: [],
  customSchemes: [],
  currentOrgScheme: null,
  currentConfig: { ...defaultConfigBySurface.admin },
  currentSurface: 'admin',
  isLoading: false,
  isSaving: false,
  error: null,

  // 获取默认配置
  getDefaultConfig: (surface) => defaultConfigBySurface[surface] || defaultConfigBySurface.admin,

  // 获取预设方案
  getPresets: () => get().presets,

  // 获取预设方案 by ID
  getPresetById: (id) => {
    const presets = get().presets
    return presets.find((p) => p.id === id) || null
  },

  // 设置当前层级
  setCurrentSurface: (surface) => {
    set({ currentSurface: surface })
  },

  // 加载机构配色
  loadOrgScheme: async (orgId, surface = 'admin') => {
    if (!orgId) {
      set({
        currentOrgScheme: null,
        currentConfig: { ...get().getDefaultConfig(surface) },
        currentSurface: surface,
      })
      return
    }

    set({ isLoading: true, error: null, currentSurface: surface })
    try {
      const response = await colorSchemeApi.getOrgScheme(orgId, surface)
      if (response.scheme) {
        set({
          currentOrgScheme: response.scheme,
          currentConfig: { ...get().getDefaultConfig(surface), ...response.scheme.config, ...response.customConfig },
        })
      } else {
        set({
          currentOrgScheme: null,
          currentConfig: { ...get().getDefaultConfig(surface) },
        })
      }
    } catch (err) {
      console.error('Failed to load org color scheme:', err)
      set({ error: err.message })
    } finally {
      set({ isLoading: false })
    }
  },

  // 加载所有自定义方案
  loadCustomSchemes: async (orgId, surface = 'admin') => {
    set({ isLoading: true, error: null })
    try {
      const response = await colorSchemeApi.getAllSchemes(orgId, surface)
      set({
        presets: response.presets || [],
        customSchemes: response.custom || [],
      })
    } catch (err) {
      console.error('Failed to load custom schemes:', err)
      set({ error: err.message })
    } finally {
      set({ isLoading: false })
    }
  },

  // 设置机构配色
  setOrgScheme: async (orgId, surface, schemeId, customConfig = null) => {
    set({ isSaving: true, error: null })
    try {
      await colorSchemeApi.setOrgScheme(orgId, surface, schemeId, customConfig)

      const scheme =
        get().getPresetById(schemeId) || get().customSchemes.find((s) => s.id === schemeId)

      if (scheme) {
        set({
          currentOrgScheme: scheme,
          currentConfig: { ...get().getDefaultConfig(surface), ...scheme.config, ...customConfig },
        })
      }
      return true
    } catch (err) {
      console.error('Failed to set org scheme:', err)
      set({ error: err.message })
      return false
    } finally {
      set({ isSaving: false })
    }
  },

  // 重置机构配色
  resetOrgScheme: async (orgId, surface = 'admin') => {
    set({ isSaving: true, error: null })
    try {
      await colorSchemeApi.resetOrgScheme(orgId, surface)
      set({
        currentOrgScheme: null,
        currentConfig: { ...get().getDefaultConfig(surface) },
      })
      return true
    } catch (err) {
      console.error('Failed to reset org scheme:', err)
      set({ error: err.message })
      return false
    } finally {
      set({ isSaving: false })
    }
  },

  // 创建自定义方案
  createScheme: async (data, orgId, surface = 'admin') => {
    set({ isSaving: true, error: null })
    try {
      const response = await colorSchemeApi.createScheme(data, orgId, surface)
      set((state) => ({
        customSchemes: [...state.customSchemes, response.scheme],
      }))
      return response.scheme
    } catch (err) {
      console.error('Failed to create scheme:', err)
      set({ error: err.message })
      return null
    } finally {
      set({ isSaving: false })
    }
  },

  // 更新自定义方案
  updateScheme: async (schemeId, data, orgId, surface = 'admin') => {
    set({ isSaving: true, error: null })
    try {
      const response = await colorSchemeApi.updateScheme(schemeId, data, orgId, surface)
      set((state) => ({
        customSchemes: state.customSchemes.map((s) => (s.id === schemeId ? response.scheme : s)),
      }))
      return response.scheme
    } catch (err) {
      console.error('Failed to update scheme:', err)
      set({ error: err.message })
      return null
    } finally {
      set({ isSaving: false })
    }
  },

  // 删除自定义方案
  deleteScheme: async (schemeId, orgId, surface = 'admin') => {
    set({ isSaving: true, error: null })
    try {
      await colorSchemeApi.deleteScheme(schemeId, orgId, surface)
      set((state) => ({
        customSchemes: state.customSchemes.filter((s) => s.id !== schemeId),
      }))
      return true
    } catch (err) {
      console.error('Failed to delete scheme:', err)
      set({ error: err.message })
      return false
    } finally {
      set({ isSaving: false })
    }
  },

  // 更新当前编辑配置
  updateCurrentConfig: (updates) => {
    set((state) => ({
      currentConfig: { ...state.currentConfig, ...updates },
    }))
  },

  // 重置当前配置
  resetCurrentConfig: () => {
    const surface = get().currentSurface
    set({ currentConfig: { ...get().getDefaultConfig(surface) } })
  },

  // 导出配色方案
  exportScheme: async (schemeId) => {
    try {
      const response = await colorSchemeApi.exportScheme(schemeId)
      return response
    } catch (err) {
      console.error('Failed to export scheme:', err)
      set({ error: err.message })
      return null
    }
  },

  // 导入配色方案
  importScheme: async (data, orgId, surface = 'admin') => {
    set({ isSaving: true, error: null })
    try {
      const response = await colorSchemeApi.importScheme(data, orgId, surface)
      set((state) => ({
        customSchemes: [...state.customSchemes, response.scheme],
      }))
      return response.scheme
    } catch (err) {
      console.error('Failed to import scheme:', err)
      set({ error: err.message })
      return null
    } finally {
      set({ isSaving: false })
    }
  },

  // 清除错误
  clearError: () => set({ error: null }),
}))

export { defaultConfigBySurface }
export default useColorSchemeStore

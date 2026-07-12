/**
 * Color Scheme API
 * 配色方案 API 封装 - 支持按层级（admin/app/ops）区分配色
 */

import request from '../utils/request'

const colorSchemeApi = {
  /**
   * 获取系统预设配色方案
   * @param {string} surface - 层级（admin/app/ops）
   */
  getPresets: (surface = 'admin') =>
    request.get('/admin/color-schemes/presets', { params: { surface } }),

  /**
   * 获取所有配色方案（含预设和自定义）
   * @param {string} orgId - 机构 ID
   * @param {string} surface - 层级（admin/app/ops）
   */
  getAllSchemes: (orgId, surface = 'admin') => {
    const params = { orgId, surface }
    return request.get('/admin/color-schemes', { params })
  },

  /**
   * 获取单个配色方案详情
   * @param {string} schemeId - 方案 ID
   */
  getScheme: (schemeId) => request.get(`/admin/color-schemes/${schemeId}`),

  /**
   * 创建自定义配色方案
   * @param {Object} data - 方案数据
   * @param {string} orgId - 机构 ID
   * @param {string} surface - 层级（admin/app/ops）
   */
  createScheme: (data, orgId, surface = 'admin') => {
    return request.post('/admin/color-schemes', data, { params: { orgId, surface } })
  },

  /**
   * 更新配色方案
   * @param {string} schemeId - 方案 ID
   * @param {Object} data - 更新数据
   * @param {string} orgId - 机构 ID
   * @param {string} surface - 层级（admin/app/ops）
   */
  updateScheme: (schemeId, data, orgId, surface = 'admin') => {
    return request.patch(`/admin/color-schemes/${schemeId}`, data, { params: { orgId, surface } })
  },

  /**
   * 删除自定义配色方案
   * @param {string} schemeId - 方案 ID
   * @param {string} orgId - 机构 ID
   * @param {string} surface - 层级（admin/app/ops）
   */
  deleteScheme: (schemeId, orgId, surface = 'admin') => {
    return request.delete(`/admin/color-schemes/${schemeId}`, { params: { orgId, surface } })
  },

  /**
   * 获取机构当前配色设置
   * @param {string} orgId - 机构 ID
   * @param {string} surface - 层级（admin/app/ops）
   */
  getOrgScheme: (orgId, surface = 'admin') =>
    request.get(`/admin/color-schemes/orgs/${orgId}/color-scheme`, { params: { surface } }),

  /**
   * 设置机构配色
   * @param {string} orgId - 机构 ID
   * @param {string} surface - 层级（admin/app/ops）
   * @param {string} schemeId - 方案 ID
   * @param {Object} customConfig - 自定义配置覆盖
   */
  setOrgScheme: (orgId, surface, schemeId, customConfig = null) =>
    request.put(
      `/admin/color-schemes/orgs/${orgId}/color-scheme`,
      { schemeId, customConfig },
      { params: { surface } }
    ),

  /**
   * 重置机构配色为默认
   * @param {string} orgId - 机构 ID
   * @param {string} surface - 层级（admin/app/ops）
   */
  resetOrgScheme: (orgId, surface = 'admin') =>
    request.delete(`/admin/color-schemes/orgs/${orgId}/color-scheme`, { params: { surface } }),

  /**
   * 导出配色方案
   * @param {string} schemeId - 方案 ID
   */
  exportScheme: (schemeId) => request.get(`/admin/color-schemes/${schemeId}/export`),

  /**
   * 导入配色方案
   * @param {Object} data - 方案数据
   * @param {string} orgId - 机构 ID
   * @param {string} surface - 层级（admin/app/ops）
   */
  importScheme: (data, orgId, surface = 'admin') => {
    return request.post('/admin/color-schemes/import', data, { params: { orgId, surface } })
  },
}

export default colorSchemeApi

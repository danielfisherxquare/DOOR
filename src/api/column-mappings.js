import request from '../utils/request'

const BASE_PATH = '/app/column-mappings'

/**
 * 列映射 API — 应用层 /api/app/column-mappings。
 */
export const columnMappingsApi = {
  /**
   * 获取列映射配置
   */
  getAll: (options) => {
    const params = new URLSearchParams()
    if (options?.scope) params.set('scope', options.scope)
    if (options?.orgId) params.set('orgId', options.orgId)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return request.get(`${BASE_PATH}${suffix}`)
  },

  /**
   * 批量保存映射配置
   */
  save: (mappings, options) => request.post(BASE_PATH, {
    mappings,
    scope: options?.scope,
    orgId: options?.orgId,
  }),

  /**
   * 批量删除映射
   */
  delete: (ids, options) => request.delete(BASE_PATH, {
    data: {
      ids,
      scope: options?.scope,
      orgId: options?.orgId,
    },
  }),

  /**
   * 清空所有映射
   */
  clear: (options) => {
    const params = new URLSearchParams()
    if (options?.scope) params.set('scope', options.scope)
    if (options?.orgId) params.set('orgId', options.orgId)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return request.delete(`${BASE_PATH}/all${suffix}`)
  },
}

export default columnMappingsApi

import request from '../utils/request'

function unwrap(response) {
  return response?.data ?? response
}

/**
 * 列映射 API — 对应后端 /api/column-mappings
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
    return request.get(`/column-mappings${suffix}`).then(unwrap)
  },

  /**
   * 批量保存映射配置
   */
  save: (mappings, options) => request.post('/column-mappings', {
    mappings,
    scope: options?.scope,
    orgId: options?.orgId,
  }).then(unwrap),

  /**
   * 批量删除映射
   */
  delete: (ids, options) => request.delete('/column-mappings', {
    data: {
      ids,
      scope: options?.scope,
      orgId: options?.orgId,
    },
  }).then(unwrap),

  /**
   * 清空所有映射
   */
  clear: (options) => {
    const params = new URLSearchParams()
    if (options?.scope) params.set('scope', options.scope)
    if (options?.orgId) params.set('orgId', options.orgId)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return request.delete(`/column-mappings/all${suffix}`).then(unwrap)
  },
}

export default columnMappingsApi

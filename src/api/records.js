import request from '../utils/request'

/**
 * 记录 API — 对应后端 /api/records（读路径）
 */
export const recordsApi = {
    /**
     * 综合查询选手记录
     * @param {object} params
     * @param {number} params.raceId - 赛事ID
     * @param {string} [params.keyword] - 搜索关键词
     * @param {Array} [params.filters] - 筛选条件 [{ field, operator, value }]
     * @param {number} [params.offset=0] - 偏移量
     * @param {number} [params.limit=50] - 每页数量
     * @param {object} [params.sort] - 排序 { field, direction }
     * @returns {Promise<{ success: boolean, data: { records: Array, total: number } }>}
     */
    query: (params) => request.post('/records/query', params),

    /**
     * 数据分析统计
     * @param {object} params
     * @param {number} params.raceId - 赛事ID
     * @param {string} [params.keyword] - 搜索关键词
     * @param {Array} [params.filters] - 筛选条件
     * @returns {Promise<{ success: boolean, data: object }>}
     */
    analysis: (params) => request.post('/records/analysis', params),

    /**
     * 获取字段唯一值（用于下拉筛选）
     * @param {object} params
     * @param {string} params.field - 字段名（camelCase）
     * @param {number} [params.raceId] - 赛事ID
     * @param {number} [params.limit=500] - 最大数量
     * @returns {Promise<{ success: boolean, data: Array<string> }>}
     */
    uniqueValues: (params) => request.post('/records/unique-values', params),

    /**
     * 首页快速统计
     * @param {number|string} raceId - 赛事ID
     * @param {string} [statuses] - 中签状态（逗号分隔）
     * @returns {Promise<{ success: boolean, data: object }>}
     */
    quickStats: (raceId, statuses = '') =>
        request.get(`/records/quick-stats/${raceId}`, {
            params: statuses ? { statuses } : {},
        }),

    /**
     * 更新单条记录
     */
    update: (recordId, data) => request.put(`/records/${recordId}`, data),

    /**
     * 批量更新记录
     */
    bulkUpdate: (updates) => request.post('/records/bulk-update', { updates }),

    /**
     * 清空赛事数据
     */
    clearByRace: (raceId) => request.delete(`/records/race/${raceId}`),

    /**
     * 流式导出(NDJSON)
     */
    export: (raceId) => request.get(`/records/export/${raceId}`),

    /**
     * 校验成绩导入
     */
    importVerification: (raceId, results) => request.post(`/records/import-verification/${raceId}`, results),
}

/**
 * 全量拉取某赛事的选手记录（分批 1000 条/次循环获取）。
 *
 * ⚠️ 当记录超过数万条时可能占用较多内存，
 *    后续应考虑后端聚合或流式替代。
 *
 * @param {number|string} raceId - 赛事 ID
 * @returns {Promise<Array>}
 */
export async function fetchAllRecords(raceId) {
  const { unwrapRecordsQueryResult } = await import('../utils/apiResponse')
  const all = []
  let offset = 0
  const limit = 1000

  while (true) {
    const response = await recordsApi.query({
      raceId: Number(raceId),
      offset,
      limit,
      sort: { field: 'id', direction: 'asc' },
    })
    const result = unwrapRecordsQueryResult(response)
    const batch = result.records || []
    all.push(...batch)
    if (batch.length < limit) break
    offset += limit
  }

  return all
}

export default recordsApi

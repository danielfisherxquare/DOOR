import request from '../utils/request'

/**
 * 工具相关 API
 */
export const toolsApi = {
  /**
   * 获取工具列表
   * @returns {Promise<{ tools: Array }>}
   */
  getTools: () => request.get('/tools'),

  /**
   * 获取单个工具详情
   * @param {string} id - 工具ID
   * @returns {Promise<{ tool: object }>}
   */
  getToolById: (id) => request.get(`/tools/${id}`),

  /**
   * 获取工具状态
   * @param {string} id - 工具ID
   * @returns {Promise<{ status: 'online' | 'offline' | 'maintenance' }>}
   */
  getToolStatus: (id) => request.get(`/tools/${id}/status`),

  /**
   * 调用工具
   * @param {string} id - 工具ID
   * @param {object} params - 调用参数
   * @returns {Promise<{ result: any }>}
   */
  invokeTool: (id, params) => request.post(`/tools/${id}/invoke`, params),

  /**
   * 获取工具调用历史
   * @param {string} id - 工具ID
   * @param {object} options - 分页选项
   * @returns {Promise<{ history: Array, total: number }>}
   */
  getToolHistory: (id, options = {}) => request.get(`/tools/${id}/history`, { params: options }),

  // ============================================
  // 以下为各工具特定的 API（示例）
  // ============================================

  /**
   * JSON 格式化
   * @param {object} data - 请求数据
   * @param {string} data.json - JSON字符串
   * @param {number} data.indent - 缩进空格数
   * @returns {Promise<{ formatted: string }>}
   */
  formatJson: (data) => request.post('/tools/json-formatter/invoke', data),

  /**
   * Base64 编解码
   * @param {object} data - 请求数据
   * @param {string} data.input - 输入内容
   * @param {'encode' | 'decode'} data.action - 操作类型
   * @returns {Promise<{ result: string }>}
   */
  base64: (data) => request.post('/tools/base64-encoder/invoke', data),

  /**
   * 二维码生成
   * @param {object} data - 请求数据
   * @param {string} data.content - 二维码内容
   * @param {number} data.size - 尺寸
   * @returns {Promise<{ image: string }>}
   */
  generateQrCode: (data) => request.post('/tools/qrcode-generator/invoke', data),

  /**
   * 时间戳转换
   * @param {object} data - 请求数据
   * @param {string | number} data.value - 时间戳或日期字符串
   * @param {'timestamp' | 'date'} data.type - 转换类型
   * @returns {Promise<{ result: string }>}
   */
  convertTimestamp: (data) => request.post('/tools/timestamp-converter/invoke', data),

  /**
   * 文本对比
   * @param {object} data - 请求数据
   * @param {string} data.text1 - 文本1
   * @param {string} data.text2 - 文本2
   * @returns {Promise<{ diff: object }>}
   */
  diffText: (data) => request.post('/tools/diff-checker/invoke', data),

  /**
   * 正则测试
   * @param {object} data - 请求数据
   * @param {string} data.pattern - 正则表达式
   * @param {string} data.text - 测试文本
   * @param {string} data.flags - 正则标志
   * @returns {Promise<{ matches: Array }>}
   */
  testRegex: (data) => request.post('/tools/regex-tester/invoke', data),

  /**
   * UUID 生成
   * @param {object} data - 请求数据
   * @param {number} data.count - 生成数量
   * @returns {Promise<{ uuids: Array<string> }>}
   */
  generateUuid: (data) => request.post('/tools/uuid-generator/invoke', data),

  /**
   * SQL 格式化
   * @param {object} data - 请求数据
   * @param {string} data.sql - SQL语句
   * @returns {Promise<{ formatted: string }>}
   */
  formatSql: (data) => request.post('/tools/sql-formatter/invoke', data)
}

export default toolsApi
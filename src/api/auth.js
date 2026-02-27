import request from '../utils/request'

/**
 * 认证相关 API
 */
export const authApi = {
  /**
   * 用户登录
   * @param {Object} credentials - 登录凭证
   * @param {string} credentials.username - 用户名
   * @param {string} credentials.password - 密码
   * @returns {Promise<{ user: object, token: string }>}
   */
  login: (credentials) => request.post('/auth/login', credentials),

  /**
   * 用户登出
   * @returns {Promise<void>}
   */
  logout: () => request.post('/auth/logout'),

  /**
   * 刷新 Token
   * @returns {Promise<{ token: string }>}
   */
  refreshToken: () => request.post('/auth/refresh'),

  /**
   * 获取当前用户信息
   * @returns {Promise<{ user: object }>}
   */
  getCurrentUser: () => request.get('/auth/me'),

  /**
   * 修改密码
   * @param {Object} data - 密码数据
   * @param {string} data.oldPassword - 旧密码
   * @param {string} data.newPassword - 新密码
   * @returns {Promise<void>}
   */
  changePassword: (data) => request.put('/auth/password', data)
}

export default authApi
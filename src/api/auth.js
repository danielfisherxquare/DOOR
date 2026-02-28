import request from '../utils/request'

/**
 * 认证相关 API
 */
export const authApi = {
  /**
   * 用户注册
   * @param {Object} data - 注册数据
   * @param {string} data.username - 用户名
   * @param {string} data.email - 邮箱
   * @param {string} data.password - 密码
   * @returns {Promise<{ success: boolean, data: { user: object, token: string } }>}
   */
  register: (data) => request.post('/auth/register', data),

  /**
   * 用户登录
   * @param {Object} credentials - 登录凭证
   * @param {string} credentials.username - 用户名或邮箱
   * @param {string} credentials.password - 密码
   * @param {boolean} credentials.rememberMe - 记住我
   * @returns {Promise<{ success: boolean, data: { user: object, token: string } }>}
   */
  login: (credentials) => request.post('/auth/login', credentials),

  /**
   * 用户登出
   * @returns {Promise<{ success: boolean }>}
   */
  logout: () => request.post('/auth/logout'),

  /**
   * 获取当前用户信息
   * @returns {Promise<{ success: boolean, data: object }>}
   */
  getCurrentUser: () => request.get('/auth/me'),

  /**
   * 验证邮箱
   * @param {string} token - 验证 token
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  verifyEmail: (token) => request.get(`/auth/verify-email/${token}`),

  /**
   * 重发验证邮件
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  resendVerification: () => request.post('/auth/resend-verification'),

  /**
   * 忘记密码
   * @param {string} email - 邮箱地址
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  forgotPassword: (email) => request.post('/auth/forgot-password', { email }),

  /**
   * 重置密码
   * @param {string} token - 重置 token
   * @param {string} password - 新密码
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  resetPassword: (token, password) => request.post(`/auth/reset-password/${token}`, { password }),

  /**
   * 修改密码
   * @param {Object} data - 密码数据
   * @param {string} data.oldPassword - 旧密码
   * @param {string} data.newPassword - 新密码
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  changePassword: (data) => request.put('/auth/password', data)
}

export default authApi
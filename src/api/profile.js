import request from '../utils/request'

const profileApi = {
  /**
   * 获取当前用户完整信息
   */
  getMe: () => request.get('/profile/me'),
  getContextOptions: (params) => request.get('/profile/context-options', { params }),

  /**
   * 更新个人信息
   * @param {Object} data - 更新数据
   */
  updateMe: (data) => request.patch('/profile/me', data),

  /**
   * 上传头像
   * @param {File} file - 图片文件
   */
  uploadAvatar: async (file) => {
    const formData = new FormData()
    formData.append('avatar', file)
    return request.post('/profile/avatar', formData)
  },

  /**
   * 上传证件照片
   * @param {File} file - 图片文件
   */
  uploadCredentialPhoto: async (file) => {
    const formData = new FormData()
    formData.append('photo', file)
    return request.post('/profile/credential-photo', formData)
  },

  /**
   * 查看他人信息
   * @param {string} userId - 用户ID
   */
  getUser: (userId) => request.get(`/profile/${userId}`),
}

export default profileApi

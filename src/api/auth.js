import request from '../utils/request'

const authApi = {
  register: (data) => request.post('/auth/register', data),
  login: (credentials) => request.post('/auth/login', credentials),
  logout: (data) => request.post('/auth/logout', data),
  getCurrentUser: () => request.get('/auth/me'),
  verifyEmail: (token) => request.get(`/auth/verify-email/${token}`),
  resendVerification: () => request.post('/auth/resend-verification'),
  forgotPassword: (email) => request.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => request.post(`/auth/reset-password/${token}`, { password }),
  changePassword: (data) => request.post('/auth/change-password', data),
}

export default authApi

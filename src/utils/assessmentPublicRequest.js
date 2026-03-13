import axios from 'axios'

const assessmentPublicRequest = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

assessmentPublicRequest.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const responseData = error.response?.data
    const message = responseData?.message || responseData?.error || error.message || 'Request failed'
    return Promise.reject(new Error(message))
  },
)

export default assessmentPublicRequest

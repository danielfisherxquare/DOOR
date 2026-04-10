import assessmentPublicRequest from '../utils/assessmentPublicRequest'

const assessmentPublicApi = {
  getMeta: (campaignId) => assessmentPublicRequest.get(`/public/assessment/campaigns/${campaignId}/meta`),
  login: (campaignId, data) => assessmentPublicRequest.post(`/public/assessment/campaigns/${campaignId}/login`, data),
  getProgress: (campaignId, token) => assessmentPublicRequest.get(`/public/assessment/campaigns/${campaignId}/progress`, { headers: { Authorization: `Bearer ${token}` } }),
  getMembers: (campaignId, token) => assessmentPublicRequest.get(`/public/assessment/campaigns/${campaignId}/members`, { headers: { Authorization: `Bearer ${token}` } }),
  getMemberForm: (campaignId, memberId, token) => assessmentPublicRequest.get(`/public/assessment/campaigns/${campaignId}/members/${memberId}/form`, { headers: { Authorization: `Bearer ${token}` } }),
  getDraft: (campaignId, memberId, token) => assessmentPublicRequest.get(`/public/assessment/campaigns/${campaignId}/members/${memberId}/draft`, { headers: { Authorization: `Bearer ${token}` } }),
  saveDraft: (campaignId, memberId, token, data) => assessmentPublicRequest.put(`/public/assessment/campaigns/${campaignId}/members/${memberId}/draft`, data, { headers: { Authorization: `Bearer ${token}` } }),
  submit: (campaignId, memberId, token, data) => assessmentPublicRequest.post(`/public/assessment/campaigns/${campaignId}/members/${memberId}/submission`, data, { headers: { Authorization: `Bearer ${token}` } }),
  logout: (campaignId, token) => assessmentPublicRequest.post(`/public/assessment/campaigns/${campaignId}/logout`, {}, { headers: { Authorization: `Bearer ${token}` } }),
}

export default assessmentPublicApi

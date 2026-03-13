import assessmentPublicRequest from '../utils/assessmentPublicRequest'

const assessmentPublicApi = {
  getMeta: (campaignId) => assessmentPublicRequest.get(`/assessment/public/campaigns/${campaignId}/meta`),
  login: (campaignId, data) => assessmentPublicRequest.post(`/assessment/public/campaigns/${campaignId}/login`, data),
  getProgress: (campaignId, token) => assessmentPublicRequest.get(`/assessment/public/campaigns/${campaignId}/progress`, { headers: { Authorization: `Bearer ${token}` } }),
  getMembers: (campaignId, token) => assessmentPublicRequest.get(`/assessment/public/campaigns/${campaignId}/members`, { headers: { Authorization: `Bearer ${token}` } }),
  getMemberForm: (campaignId, memberId, token) => assessmentPublicRequest.get(`/assessment/public/campaigns/${campaignId}/members/${memberId}/form`, { headers: { Authorization: `Bearer ${token}` } }),
  getDraft: (campaignId, memberId, token) => assessmentPublicRequest.get(`/assessment/public/campaigns/${campaignId}/members/${memberId}/draft`, { headers: { Authorization: `Bearer ${token}` } }),
  saveDraft: (campaignId, memberId, token, data) => assessmentPublicRequest.put(`/assessment/public/campaigns/${campaignId}/members/${memberId}/draft`, data, { headers: { Authorization: `Bearer ${token}` } }),
  submit: (campaignId, memberId, token, data) => assessmentPublicRequest.post(`/assessment/public/campaigns/${campaignId}/members/${memberId}/submission`, data, { headers: { Authorization: `Bearer ${token}` } }),
  logout: (campaignId, token) => assessmentPublicRequest.post(`/assessment/public/campaigns/${campaignId}/logout`, {}, { headers: { Authorization: `Bearer ${token}` } }),
}

export default assessmentPublicApi

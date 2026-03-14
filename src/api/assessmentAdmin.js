import request from '../utils/request'

const assessmentAdminApi = {
  listCampaigns: () => request.get('/admin/assessment/campaigns'),
  createCampaign: (data) => request.post('/admin/assessment/campaigns', data),
  getCampaignDetail: (id) => request.get(`/admin/assessment/campaigns/${id}`),
  updateCampaign: (id, data) => request.put(`/admin/assessment/campaigns/${id}`, data),
  publishCampaign: (id) => request.post(`/admin/assessment/campaigns/${id}/publish`),
  closeCampaign: (id) => request.post(`/admin/assessment/campaigns/${id}/close`),
  getRosterTemplate: (id) => request.get(`/admin/assessment/campaigns/${id}/roster-template`),
  previewRosterImport: (id, rows) => request.post(`/admin/assessment/campaigns/${id}/roster/import-preview`, { rows }),
  commitRosterImport: (id, rows) => request.post(`/admin/assessment/campaigns/${id}/roster/commit`, { rows }),
  getTeamCandidates: (id, keyword = '') => request.get(`/admin/assessment/campaigns/${id}/team-candidates`, { params: { keyword } }),
  setCampaignMembers: (id, teamMemberIds) => request.put(`/admin/assessment/campaigns/${id}/members`, { teamMemberIds }),
  generateInviteCodes: (id, count) => request.post(`/admin/assessment/campaigns/${id}/invite-codes/generate`, { count }),
  resetInviteCodeProgress: (id) => request.post(`/admin/assessment/invite-codes/${id}/reset-progress`),
  revokeInviteCode: (id) => request.post(`/admin/assessment/invite-codes/${id}/revoke`),
  getReportOverview: (id) => request.get(`/admin/assessment/campaigns/${id}/report/overview`),
  getMemberReport: (campaignId, memberId) => request.get(`/admin/assessment/campaigns/${campaignId}/report/members/${memberId}`),
  getGrowthReport: (employeeCode) => request.get(`/admin/assessment/growth/${encodeURIComponent(employeeCode)}`),
}

export default assessmentAdminApi

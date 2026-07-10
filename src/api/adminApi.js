import request, { requestRaw } from '../utils/request'

const adminApi = {
  getOrgs: (params) => request.get('/admin/orgs', { params }),
  createOrg: (data) => request.post('/admin/orgs', data),
  getOrgDetail: (orgId) => request.get(`/admin/orgs/${orgId}`),
  updateOrg: (orgId, data) => request.patch(`/admin/orgs/${orgId}`, data),
  deleteOrg: (orgId) => request.delete(`/admin/orgs/${orgId}`),
  createOrgAdmin: (orgId, data) => request.post(`/admin/orgs/${orgId}/admins`, data),

  getAllUsers: (params) => request.get('/admin/users', { params }),
  updateUser: (userId, data) => request.patch(`/admin/users/${userId}`, data),
  deleteUser: (userId) => request.delete(`/admin/users/${userId}`),
  resetUserPassword: (userId) => request.post(`/admin/users/${userId}/reset-password`),

  getDashboardStats: () => request.get('/admin/dashboard'),
  listDbBackups: () => request.get('/admin/system/backups'),
  createDbBackup: () => request.post('/admin/system/backups'),
  getDbBackupStatus: () => request.get('/admin/system/backups/status'),
  listDbRestores: () => request.get('/admin/system/restores'),
  startDbRestore: (uploadId) => request.post('/admin/system/restores', { uploadId }),
  getDbRestoreStatus: () => request.get('/admin/system/restores/status'),
  getDbRestoreDetail: (jobId) => request.get(`/admin/system/restores/${jobId}`),
  getEncryptionStatus: () => request.get('/admin/system/encryption-status'),

  getOrgUsers: (params) => request.get('/admin/org/users', { params }),
  createOrgUser: (data, orgId) => request.post(`/admin/org/users${orgId ? `?orgId=${orgId}` : ''}`, data),
  getOrgUser: (userId, params) => request.get(`/admin/org/users/${userId}`, { params }),
  updateOrgUser: (userId, data, orgId) => request.patch(`/admin/org/users/${userId}${orgId ? `?orgId=${orgId}` : ''}`, data),
  deleteOrgUser: (userId, orgId) => request.delete(`/admin/org/users/${userId}${orgId ? `?orgId=${orgId}` : ''}`),
  resetOrgUserPassword: (userId, orgId) => request.post(`/admin/org/users/${userId}/reset-password${orgId ? `?orgId=${orgId}` : ''}`),

  getTeamMembers: (params) => request.get('/admin/org/team-members', { params }),
  getTeamMember: (teamMemberId, params) => request.get(`/admin/org/team-members/${teamMemberId}`, { params }),
  getTeamMemberPhoto: async (teamMemberId, orgId) => {
    const response = await requestRaw.get(`/admin/org/team-members/${teamMemberId}/photo${orgId ? `?orgId=${orgId}` : ''}`, {
      responseType: 'blob',
    })
    return response.data
  },
  createTeamMember: (data, orgId) => request.post(`/admin/org/team-members${orgId ? `?orgId=${orgId}` : ''}`, data),
  updateTeamMember: (teamMemberId, data, orgId) => request.patch(`/admin/org/team-members/${teamMemberId}${orgId ? `?orgId=${orgId}` : ''}`, data),
  uploadTeamMemberPhoto: (teamMemberId, file, orgId) => {
    const formData = new FormData()
    formData.append('photo', file)
    return request.post(`/admin/org/team-members/${teamMemberId}/photo${orgId ? `?orgId=${orgId}` : ''}`, formData)
  },
  deleteTeamMemberPhoto: (teamMemberId, orgId) => request.delete(`/admin/org/team-members/${teamMemberId}/photo${orgId ? `?orgId=${orgId}` : ''}`),
  archiveTeamMember: (teamMemberId, orgId) => request.post(`/admin/org/team-members/${teamMemberId}/archive${orgId ? `?orgId=${orgId}` : ''}`),
  restoreTeamMember: (teamMemberId, orgId) => request.post(`/admin/org/team-members/${teamMemberId}/restore${orgId ? `?orgId=${orgId}` : ''}`),
  enableTeamMemberAccount: (teamMemberId, orgId) => request.post(`/admin/org/team-members/${teamMemberId}/enable-account${orgId ? `?orgId=${orgId}` : ''}`),
  resetTeamMemberPassword: (teamMemberId, orgId) => request.post(`/admin/org/team-members/${teamMemberId}/reset-password${orgId ? `?orgId=${orgId}` : ''}`),
  getTeamImportTemplate: (orgId) => request.get(`/admin/org/team-members/template${orgId ? `?orgId=${orgId}` : ''}`),
  previewTeamImport: (rows, orgId) => request.post(`/admin/org/team-members/import-preview${orgId ? `?orgId=${orgId}` : ''}`, { rows }),
  commitTeamImport: (rows, orgId) => request.post(`/admin/org/team-members/import-commit${orgId ? `?orgId=${orgId}` : ''}`, { rows }),
  getTeamCandidates: (params) => request.get('/admin/org/team-candidates', { params }),
}

export default adminApi

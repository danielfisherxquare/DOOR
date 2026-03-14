import request from '../utils/request'

const adminApi = {
  getOrgs: (params) => request.get('/admin/orgs', { params }),
  createOrg: (data) => request.post('/admin/orgs', data),
  getOrgDetail: (orgId) => request.get(`/admin/orgs/${orgId}`),
  updateOrg: (orgId, data) => request.patch(`/admin/orgs/${orgId}`, data),
  deleteOrg: (orgId) => request.delete(`/admin/orgs/${orgId}`),
  createOrgAdmin: (orgId, data) => request.post(`/admin/orgs/${orgId}/admins`, data),
  getOrgRacePermissions: (orgId) => request.get(`/admin/orgs/${orgId}/race-permissions`),
  setOrgRacePermissions: (orgId, data) => request.put(`/admin/orgs/${orgId}/race-permissions`, data),

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

  getOrgUsers: (params) => request.get('/org/users', { params }),
  createOrgUser: (data, orgId) => request.post(`/org/users${orgId ? `?orgId=${orgId}` : ''}`, data),
  getOrgUser: (userId, params) => request.get(`/org/users/${userId}`, { params }),
  updateOrgUser: (userId, data, orgId) => request.patch(`/org/users/${userId}${orgId ? `?orgId=${orgId}` : ''}`, data),
  deleteOrgUser: (userId, orgId) => request.delete(`/org/users/${userId}${orgId ? `?orgId=${orgId}` : ''}`),
  resetOrgUserPassword: (userId, orgId) => request.post(`/org/users/${userId}/reset-password${orgId ? `?orgId=${orgId}` : ''}`),
  getUserRacePermissions: (userId, params) => request.get(`/org/users/${userId}/race-permissions`, { params }),
  setUserRacePermissions: (userId, data, orgId) => request.put(`/org/users/${userId}/race-permissions${orgId ? `?orgId=${orgId}` : ''}`, data),

  getTeamMembers: (params) => request.get('/org/team-members', { params }),
  getTeamMember: (teamMemberId, params) => request.get(`/org/team-members/${teamMemberId}`, { params }),
  createTeamMember: (data, orgId) => request.post(`/org/team-members${orgId ? `?orgId=${orgId}` : ''}`, data),
  updateTeamMember: (teamMemberId, data, orgId) => request.patch(`/org/team-members/${teamMemberId}${orgId ? `?orgId=${orgId}` : ''}`, data),
  archiveTeamMember: (teamMemberId, orgId) => request.post(`/org/team-members/${teamMemberId}/archive${orgId ? `?orgId=${orgId}` : ''}`),
  restoreTeamMember: (teamMemberId, orgId) => request.post(`/org/team-members/${teamMemberId}/restore${orgId ? `?orgId=${orgId}` : ''}`),
  enableTeamMemberAccount: (teamMemberId, orgId) => request.post(`/org/team-members/${teamMemberId}/enable-account${orgId ? `?orgId=${orgId}` : ''}`),
  resetTeamMemberPassword: (teamMemberId, orgId) => request.post(`/org/team-members/${teamMemberId}/reset-password${orgId ? `?orgId=${orgId}` : ''}`),
  getTeamImportTemplate: (orgId) => request.get(`/org/team-members/template${orgId ? `?orgId=${orgId}` : ''}`),
  previewTeamImport: (rows, orgId) => request.post(`/org/team-members/import-preview${orgId ? `?orgId=${orgId}` : ''}`, { rows }),
  commitTeamImport: (rows, orgId) => request.post(`/org/team-members/import-commit${orgId ? `?orgId=${orgId}` : ''}`, { rows }),
  getTeamCandidates: (params) => request.get('/org/team-candidates', { params }),
}

export default adminApi

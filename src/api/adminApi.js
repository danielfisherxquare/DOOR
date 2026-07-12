import request from '../utils/request'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

/**
 * 构建 orgId 查询参数对象（orgId 为空时返回空对象）
 * @param {string} [orgId] - 机构 ID
 * @returns {Object}
 */
function orgIdParams(orgId) {
  return orgId ? { orgId } : {}
}

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
  createOrgUser: (data, orgId) =>
    request.post('/admin/org/users', data, { params: orgIdParams(orgId) }),
  getOrgUser: (userId, params) => request.get(`/admin/org/users/${userId}`, { params }),
  updateOrgUser: (userId, data, orgId) =>
    request.patch(`/admin/org/users/${userId}`, data, { params: orgIdParams(orgId) }),
  deleteOrgUser: (userId, orgId) =>
    request.delete(`/admin/org/users/${userId}`, { params: orgIdParams(orgId) }),
  resetOrgUserPassword: (userId, orgId) =>
    request.post(`/admin/org/users/${userId}/reset-password`, {}, { params: orgIdParams(orgId) }),

  getTeamMembers: (params) => request.get('/admin/org/team-members', { params }),
  getTeamMember: (teamMemberId, params) =>
    request.get(`/admin/org/team-members/${teamMemberId}`, { params }),
  getTeamMemberPhoto: async (teamMemberId, orgId, token) => {
    const params = new URLSearchParams()
    if (orgId) params.set('orgId', orgId)
    const qs = params.toString()
    const response = await fetch(
      `${API_BASE_URL}/admin/org/team-members/${teamMemberId}/photo${qs ? `?${qs}` : ''}`,
      {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      }
    )
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || '读取成员照片失败')
    }
    return response.blob()
  },
  createTeamMember: (data, orgId) =>
    request.post('/admin/org/team-members', data, { params: orgIdParams(orgId) }),
  updateTeamMember: (teamMemberId, data, orgId) =>
    request.patch(`/admin/org/team-members/${teamMemberId}`, data, { params: orgIdParams(orgId) }),
  uploadTeamMemberPhoto: (teamMemberId, file, orgId) => {
    const formData = new FormData()
    formData.append('photo', file)
    return request.post(`/admin/org/team-members/${teamMemberId}/photo`, formData, {
      params: orgIdParams(orgId),
    })
  },
  deleteTeamMemberPhoto: (teamMemberId, orgId) =>
    request.delete(`/admin/org/team-members/${teamMemberId}/photo`, { params: orgIdParams(orgId) }),
  archiveTeamMember: (teamMemberId, orgId) =>
    request.post(
      `/admin/org/team-members/${teamMemberId}/archive`,
      {},
      { params: orgIdParams(orgId) }
    ),
  restoreTeamMember: (teamMemberId, orgId) =>
    request.post(
      `/admin/org/team-members/${teamMemberId}/restore`,
      {},
      { params: orgIdParams(orgId) }
    ),
  enableTeamMemberAccount: (teamMemberId, orgId) =>
    request.post(
      `/admin/org/team-members/${teamMemberId}/enable-account`,
      {},
      { params: orgIdParams(orgId) }
    ),
  resetTeamMemberPassword: (teamMemberId, orgId) =>
    request.post(
      `/admin/org/team-members/${teamMemberId}/reset-password`,
      {},
      { params: orgIdParams(orgId) }
    ),
  getTeamImportTemplate: (orgId) =>
    request.get('/admin/org/team-members/template', { params: orgIdParams(orgId) }),
  previewTeamImport: (rows, orgId) =>
    request.post(
      '/admin/org/team-members/import-preview',
      { rows },
      { params: orgIdParams(orgId) }
    ),
  commitTeamImport: (rows, orgId) =>
    request.post('/admin/org/team-members/import-commit', { rows }, { params: orgIdParams(orgId) }),
  getTeamCandidates: (params) => request.get('/admin/org/team-candidates', { params }),
}

export default adminApi

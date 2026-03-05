/**
 * Admin API — 管理后台接口封装
 */
import request from '../utils/request'

export const adminApi = {
    // ── Super Admin: 机构管理 ──────────────────────────
    getOrgs: (params) => request.get('/admin/orgs', { params }),
    createOrg: (data) => request.post('/admin/orgs', data),
    getOrgDetail: (orgId) => request.get(`/admin/orgs/${orgId}`),
    updateOrg: (orgId, data) => request.patch(`/admin/orgs/${orgId}`, data),
    deleteOrg: (orgId) => request.delete(`/admin/orgs/${orgId}`),
    createOrgAdmin: (orgId, data) => request.post(`/admin/orgs/${orgId}/admins`, data),
    getOrgRacePermissions: (orgId) => request.get(`/admin/orgs/${orgId}/race-permissions`),
    setOrgRacePermissions: (orgId, data) => request.put(`/admin/orgs/${orgId}/race-permissions`, data),

    // ── Super Admin: 全平台用户管理 ──────────────────
    getAllUsers: (params) => request.get('/admin/users', { params }),
    updateUser: (userId, data) => request.patch(`/admin/users/${userId}`, data),
    deleteUser: (userId) => request.delete(`/admin/users/${userId}`),
    resetUserPassword: (userId) => request.post(`/admin/users/${userId}/reset-password`),

    // ── Super Admin: 仪表板 ──────────────────────────
    getDashboardStats: () => request.get('/admin/dashboard'),

    // ── Org Admin: 成员管理 ──────────────────────────
    getOrgUsers: (params) => request.get('/org/users', { params }),
    createOrgUser: (data, orgId) => request.post(`/org/users${orgId ? `?orgId=${orgId}` : ''}`, data),
    getOrgUser: (userId, params) => request.get(`/org/users/${userId}`, { params }),
    updateOrgUser: (userId, data, orgId) => request.patch(`/org/users/${userId}${orgId ? `?orgId=${orgId}` : ''}`, data),
    deleteOrgUser: (userId, orgId) => request.delete(`/org/users/${userId}${orgId ? `?orgId=${orgId}` : ''}`),
    resetOrgUserPassword: (userId, orgId) => request.post(`/org/users/${userId}/reset-password${orgId ? `?orgId=${orgId}` : ''}`),

    // ── Org Admin: 赛事权限管理 ──────────────────────
    getUserRacePermissions: (userId, params) => request.get(`/org/users/${userId}/race-permissions`, { params }),
    setUserRacePermissions: (userId, data, orgId) => request.put(`/org/users/${userId}/race-permissions${orgId ? `?orgId=${orgId}` : ''}`, data),
}

export default adminApi

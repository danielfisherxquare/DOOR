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
    createOrgAdmin: (orgId, data) => request.post(`/admin/orgs/${orgId}/admins`, data),

    // ── Super Admin: 全平台用户管理 ──────────────────
    getAllUsers: (params) => request.get('/admin/users', { params }),
    updateUser: (userId, data) => request.patch(`/admin/users/${userId}`, data),
    resetUserPassword: (userId) => request.post(`/admin/users/${userId}/reset-password`),

    // ── Super Admin: 仪表板 ──────────────────────────
    getDashboardStats: () => request.get('/admin/dashboard'),

    // ── Org Admin: 成员管理 ──────────────────────────
    getOrgUsers: (params) => request.get('/org/users', { params }),
    createOrgUser: (data) => request.post('/org/users', data),
    getOrgUser: (userId, params) => request.get(`/org/users/${userId}`, { params }),
    updateOrgUser: (userId, data) => request.patch(`/org/users/${userId}`, data),
    resetOrgUserPassword: (userId) => request.post(`/org/users/${userId}/reset-password`),

    // ── Org Admin: 赛事权限管理 ──────────────────────
    getUserRacePermissions: (userId, params) => request.get(`/org/users/${userId}/race-permissions`, { params }),
    setUserRacePermissions: (userId, data) => request.put(`/org/users/${userId}/race-permissions`, data),
}

export default adminApi

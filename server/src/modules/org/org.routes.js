/**
 * Org Routes — 机构管理员 API
 * 端点限 org_admin + super_admin 角色
 */
import { Router } from 'express';
import { requireRoles } from '../../middleware/require-roles.js';
import * as orgService from './org.service.js';

const router = Router();

// 全部端点限制 org_admin / super_admin
router.use(requireRoles('org_admin', 'super_admin'));

// ── 辅助：获取有效的 orgId ───────────────────────────
function getOrgId(req) {
    // super_admin 可用 query 参数指定 orgId，org_admin 固定为自己的机构
    if (req.authContext.role === 'super_admin' && req.query.orgId) {
        return req.query.orgId;
    }
    return req.authContext.orgId;
}

// ── 成员管理 ─────────────────────────────────────────

// GET /api/org/users
router.get('/users', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: '缺少 orgId' });
        const { page = 1, limit = 20, keyword = '' } = req.query;
        const result = await orgService.listOrgUsers(orgId, { page: Number(page), limit: Number(limit), keyword });
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// POST /api/org/users
router.post('/users', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: '缺少 orgId' });
        const { username, email, password, role } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: '缺少必填字段 (username, email, password)' });
        }
        const user = await orgService.createOrgUser(orgId, req.authContext.userId, { username, email, password, role });
        res.status(201).json({ success: true, data: user });
    } catch (err) {
        if (err.code === '23505') {
            err.status = 409; err.message = '用户名或邮箱已存在'; err.expose = true;
        }
        next(err);
    }
});

// GET /api/org/users/:userId
router.get('/users/:userId', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: '缺少 orgId' });
        const result = await orgService.getOrgUser(orgId, req.params.userId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// PATCH /api/org/users/:userId
router.patch('/users/:userId', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: '缺少 orgId' });
        const result = await orgService.updateOrgUser(orgId, req.params.userId, req.body);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// POST /api/org/users/:userId/reset-password
router.post('/users/:userId/reset-password', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: '缺少 orgId' });
        const result = await orgService.resetOrgUserPassword(orgId, req.params.userId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// ── 赛事权限管理 ─────────────────────────────────────

// GET /api/org/users/:userId/race-permissions
router.get('/users/:userId/race-permissions', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: '缺少 orgId' });
        const result = await orgService.getUserRacePermissions(orgId, req.params.userId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

// PUT /api/org/users/:userId/race-permissions
router.put('/users/:userId/race-permissions', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: '缺少 orgId' });
        const { permissions } = req.body;
        if (!Array.isArray(permissions)) {
            return res.status(400).json({ success: false, message: 'permissions 必须为数组' });
        }
        const result = await orgService.setUserRacePermissions(orgId, req.params.userId, req.authContext.userId, permissions);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

export default router;

/**
 * Auth Routes — 认证 API 端点
 */
import { Router } from 'express';
import * as authService from './auth.service.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { requireRoles } from '../../middleware/require-roles.js';
import { loginLimiter, registerLimiter } from '../../middleware/rate-limiter.js';

const router = Router();

// POST /api/auth/register
router.post('/register', registerLimiter, async (req, res, next) => {
    try {
        // 生产环境守卫
        if (process.env.DISABLE_REGISTRATION === 'true') {
            return res.status(403).json({ success: false, message: '注册功能已关闭，请联系管理员' });
        }
        const { username, email, password, orgName } = req.body;
        if (!username || !email || !password || !orgName) {
            return res.status(400).json({ success: false, message: '缺少必填字段' });
        }
        const result = await authService.register({ username, email, password, orgName });
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        if (err.code === '23505') { // PG unique violation
            err.status = 409;
            err.message = '用户名或邮箱已存在';
            err.expose = true;
        }
        next(err);
    }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res, next) => {
    try {
        const { login, password } = req.body;
        if (!login || !password) {
            return res.status(400).json({ success: false, message: '缺少登录凭据' });
        }
        const result = await authService.login({ login, password });
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ success: false, message: '缺少 refreshToken' });
        }
        const result = await authService.refresh(refreshToken);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/logout
router.post('/logout', async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        await authService.logout(refreshToken);
        res.json({ success: true, message: '已登出' });
    } catch (err) {
        next(err);
    }
});

// GET /api/auth/me — 需要认证
router.get('/me', requireAuth, async (req, res, next) => {
    try {
        const result = await authService.getMe(req.authContext.userId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/change-password — 用户自行修改密码（需要认证）
router.post('/change-password', requireAuth, async (req, res, next) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ success: false, message: '缺少密码字段' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: '新密码长度至少 6 位' });
        }
        const result = await authService.changePassword(req.authContext.userId, { oldPassword, newPassword });
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/set-password — 管理员为用户重置密码（需要 org_admin/super_admin）
router.post('/set-password', requireAuth, requireRoles('org_admin', 'super_admin'), async (req, res, next) => {
    try {
        const { targetUserId, newPassword } = req.body;
        if (!targetUserId || !newPassword) {
            return res.status(400).json({ success: false, message: '缺少必填字段' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: '新密码长度至少 6 位' });
        }
        const result = await authService.setPassword(targetUserId, newPassword, req.authContext);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/race-permissions — 获取或设置特定用户的赛事权限
router.post('/race-permissions', requireAuth, requireRoles('org_admin', 'super_admin'), async (req, res, next) => {
    try {
        const { targetUserId, raceId, role } = req.body;
        if (!targetUserId || !raceId) {
            return res.status(400).json({ success: false, message: '缺少 targetUserId 或 raceId' });
        }
        if (role && !['race_editor', 'race_viewer', 'editor', 'viewer'].includes(role)) {
            return res.status(400).json({ success: false, message: '赛事角色无效，支持 race_editor/race_viewer/editor/viewer' });
        }
        const result = await authService.assignRaceRole(req.authContext, targetUserId, raceId, role);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

export default router;

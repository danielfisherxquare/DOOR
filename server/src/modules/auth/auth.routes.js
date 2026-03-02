/**
 * Auth Routes — 认证 API 端点
 */
import { Router } from 'express';
import * as authService from './auth.service.js';
import { tenantContext } from '../../middleware/tenant-context.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
    try {
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
router.post('/login', async (req, res, next) => {
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
router.get('/me', tenantContext, async (req, res, next) => {
    try {
        const result = await authService.getMe(req.tenantContext.userId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

export default router;

/**
 * Org Routes - org admin APIs
 */
import { Router } from 'express';
import { requirePermission } from '../../middleware/require-permission.js';
import { operationLog } from '../../middleware/operation-log.js';
import * as orgService from './org.service.js';

const router = Router();

router.use(requirePermission({ roles: ['org_admin', 'super_admin'] }));

async function getOrgId(req) {
    if (req.authContext.role === 'super_admin' && req.query.orgId) {
        return req.query.orgId;
    }

    if (req.authContext.orgId) return req.authContext.orgId;

    return null;
}

router.get('/users', async (req, res, next) => {
    try {
        const orgId = await getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId for super_admin' });

        const { page = 1, limit = 20, keyword = '' } = req.query;
        const result = await orgService.listOrgUsers(orgId, {
            page: Number(page),
            limit: Number(limit),
            keyword,
        });

        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

router.post('/users', operationLog({ module: 'org', businessType: 'INSERT', titleFactory: (req) => '创建用户: ' + (req.body?.username || '') }), async (req, res, next) => {
    try {
        const orgId = await getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId for super_admin' });

        const { username, email, password, role } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Missing required fields (username, email, password)' });
        }

        const user = await orgService.createOrgUser(orgId, req.authContext.userId, { username, email, password, role });
        res.status(201).json({ success: true, data: user });
    } catch (err) {
        if (err.code === '23505') {
            err.status = 409;
            err.message = 'Username or email already exists';
            err.expose = true;
        }
        next(err);
    }
});

router.get('/users/:userId', async (req, res, next) => {
    try {
        const orgId = await getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId for super_admin' });

        const result = await orgService.getOrgUser(orgId, req.params.userId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

router.patch('/users/:userId', operationLog({ module: 'org', businessType: 'UPDATE', titleFactory: (req) => '更新用户: ' + (req.params?.userId || '') }), async (req, res, next) => {
    try {
        const orgId = await getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId for super_admin' });

        const result = await orgService.updateOrgUser(orgId, req.params.userId, req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

router.delete('/users/:userId', operationLog({ module: 'org', businessType: 'DELETE', titleFactory: (req) => '删除用户: ' + (req.params?.userId || '') }), async (req, res, next) => {
    try {
        const orgId = await getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId for super_admin' });

        const result = await orgService.deleteOrgUser(orgId, req.params.userId, req.authContext);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

router.post('/users/:userId/reset-password', operationLog({ module: 'org', businessType: 'UPDATE', titleFactory: (req) => '重置密码: ' + (req.params?.userId || '') }), async (req, res, next) => {
    try {
        const orgId = await getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId for super_admin' });

        const result = await orgService.resetOrgUserPassword(orgId, req.params.userId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

export default router;

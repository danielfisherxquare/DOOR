/**
 * Org Routes - org admin APIs
 */
import { Router } from 'express';
import { requireRoles } from '../../middleware/require-roles.js';
import * as orgService from './org.service.js';

const router = Router();

router.use(requireRoles('org_admin', 'super_admin'));

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

router.post('/users', async (req, res, next) => {
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

router.patch('/users/:userId', async (req, res, next) => {
    try {
        const orgId = await getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId for super_admin' });

        const result = await orgService.updateOrgUser(orgId, req.params.userId, req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

router.delete('/users/:userId', async (req, res, next) => {
    try {
        const orgId = await getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId for super_admin' });

        const result = await orgService.deleteOrgUser(orgId, req.params.userId, req.authContext);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

router.post('/users/:userId/reset-password', async (req, res, next) => {
    try {
        const orgId = await getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId for super_admin' });

        const result = await orgService.resetOrgUserPassword(orgId, req.params.userId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

router.get('/users/:userId/race-permissions', async (req, res, next) => {
    try {
        const orgId = await getOrgId(req);
        if (!orgId && req.authContext.role !== 'super_admin') {
            return res.status(400).json({ success: false, message: 'Missing orgId' });
        }

        const result = await orgService.getUserRacePermissions(orgId, req.params.userId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

router.put('/users/:userId/race-permissions', async (req, res, next) => {
    try {
        const orgId = await getOrgId(req);
        if (!orgId && req.authContext.role !== 'super_admin') {
            return res.status(400).json({ success: false, message: 'Missing orgId' });
        }

        const { permissions } = req.body;
        if (!Array.isArray(permissions)) {
            return res.status(400).json({ success: false, message: 'permissions must be an array' });
        }

        const result = await orgService.setUserRacePermissions(
            orgId,
            req.params.userId,
            req.authContext.userId,
            permissions,
        );

        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

export default router;

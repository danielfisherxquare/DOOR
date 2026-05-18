import { Router } from 'express';
import { requirePermission } from '../../middleware/require-permission.js';
import * as identityCenterService from './identity-center.service.js';

const router = Router();

router.use(requirePermission({ roles: ['org_admin', 'super_admin'] }));

router.get('/summary', async (req, res, next) => {
    try {
        const data = await identityCenterService.getIdentityCenterSummary(req.authContext, req.query.orgId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/accounts', async (req, res, next) => {
    try {
        const { page = 1, limit = 20, keyword = '' } = req.query;
        const data = await identityCenterService.listIdentityAccounts(req.authContext, req.query.orgId, {
            page: Number(page),
            limit: Number(limit),
            keyword,
        });
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/module-matrix', async (req, res, next) => {
    try {
        const data = await identityCenterService.getModuleMatrix(req.authContext, req.query.orgId, {
            keyword: req.query.keyword || '',
        });
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.put('/module-matrix', async (req, res, next) => {
    try {
        const data = await identityCenterService.saveModuleMatrix(req.authContext, req.query.orgId, req.body.updates);
        res.json({ success: true, data, message: '模块权限矩阵已保存' });
    } catch (err) {
        next(err);
    }
});

router.get('/org-race-matrix', async (req, res, next) => {
    try {
        const data = await identityCenterService.getOrgRaceMatrix(req.authContext, req.query.orgId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.put('/org-race-matrix', async (req, res, next) => {
    try {
        const data = await identityCenterService.saveOrgRaceMatrix(req.authContext, req.query.orgId, req.body.permissions);
        res.json({ success: true, data, message: '机构赛事范围已保存' });
    } catch (err) {
        next(err);
    }
});

router.get('/user-race-matrix', async (req, res, next) => {
    try {
        const { page = 1, limit = 20, keyword = '' } = req.query;
        const data = await identityCenterService.getUserRaceMatrix(req.authContext, req.query.orgId, {
            page: Number(page),
            limit: Number(limit),
            keyword,
        });
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.put('/user-race-matrix', async (req, res, next) => {
    try {
        const data = await identityCenterService.saveUserRaceMatrix(req.authContext, req.query.orgId, req.body.updates);
        res.json({ success: true, data, message: '用户赛事矩阵已保存' });
    } catch (err) {
        next(err);
    }
});

export default router;

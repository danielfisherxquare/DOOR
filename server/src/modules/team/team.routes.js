import { Router } from 'express';
import path from 'path';
import { requireRoles } from '../../middleware/require-roles.js';
import * as teamService from './team.service.js';
import { uploadTeamMemberPhotoMiddleware } from './team-photo.js';

const router = Router();

router.use(requireRoles('org_admin', 'super_admin'));

function getOrgId(req) {
    if (req.authContext.role === 'super_admin' && req.query.orgId) {
        return req.query.orgId;
    }
    return req.authContext.orgId || null;
}

router.get('/team-members', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId' });
        const { page = 1, limit = 20, keyword = '', department = '', memberType = '', externalEngagementType = '', status = '', hasAccount = '' } = req.query;
        const data = await teamService.listTeamMembers(orgId, {
            page: Number(page),
            limit: Number(limit),
            keyword,
            department,
            memberType,
            externalEngagementType,
            status,
            hasAccount,
        });
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.get('/team-members/template', async (_req, res, next) => {
    try {
        res.json({ success: true, data: await teamService.getImportTemplate() });
    } catch (error) {
        next(error);
    }
});

router.post('/team-members/import-preview', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId' });
        res.json({ success: true, data: await teamService.previewImport(orgId, req.body?.rows || []) });
    } catch (error) {
        next(error);
    }
});

router.post('/team-members/import-commit', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId' });
        res.json({ success: true, data: await teamService.commitImport(orgId, req.authContext.userId, req.body?.rows || []) });
    } catch (error) {
        next(error);
    }
});

router.get('/team-members/:teamMemberId', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId' });
        res.json({ success: true, data: await teamService.getTeamMember(orgId, req.params.teamMemberId) });
    } catch (error) {
        next(error);
    }
});

router.get('/team-members/:teamMemberId/photo', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId' });
        const absolutePath = await teamService.getTeamMemberPhotoFile(orgId, req.params.teamMemberId);
        res.type(path.extname(absolutePath));
        res.sendFile(absolutePath);
    } catch (error) {
        next(error);
    }
});

router.post('/team-members', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId' });
        res.status(201).json({ success: true, data: await teamService.createTeamMember(orgId, req.authContext.userId, req.body) });
    } catch (error) {
        next(error);
    }
});

router.patch('/team-members/:teamMemberId', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId' });
        res.json({ success: true, data: await teamService.updateTeamMember(orgId, req.params.teamMemberId, req.body) });
    } catch (error) {
        next(error);
    }
});

router.post('/team-members/:teamMemberId/photo', uploadTeamMemberPhotoMiddleware.single('photo'), async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId' });
        if (!req.file) return res.status(400).json({ success: false, message: 'Missing photo file' });
        res.json({ success: true, data: await teamService.uploadTeamMemberPhoto(orgId, req.params.teamMemberId, req.file) });
    } catch (error) {
        next(error);
    }
});

router.delete('/team-members/:teamMemberId/photo', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId' });
        res.json({ success: true, data: await teamService.deleteTeamMemberPhoto(orgId, req.params.teamMemberId) });
    } catch (error) {
        next(error);
    }
});

router.post('/team-members/:teamMemberId/archive', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId' });
        res.json({ success: true, data: await teamService.archiveTeamMember(orgId, req.params.teamMemberId) });
    } catch (error) {
        next(error);
    }
});

router.post('/team-members/:teamMemberId/restore', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId' });
        res.json({ success: true, data: await teamService.restoreTeamMember(orgId, req.params.teamMemberId) });
    } catch (error) {
        next(error);
    }
});

router.post('/team-members/:teamMemberId/enable-account', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId' });
        res.json({ success: true, data: await teamService.enableTeamMemberAccount(orgId, req.params.teamMemberId, req.authContext.userId) });
    } catch (error) {
        next(error);
    }
});

router.post('/team-members/:teamMemberId/reset-password', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId' });
        res.json({ success: true, data: await teamService.resetTeamMemberPassword(orgId, req.params.teamMemberId) });
    } catch (error) {
        next(error);
    }
});

router.get('/team-candidates', async (req, res, next) => {
    try {
        const orgId = getOrgId(req);
        if (!orgId) return res.status(400).json({ success: false, message: 'Missing orgId' });
        res.json({ success: true, data: await teamService.listTeamCandidates(orgId, String(req.query.keyword || '')) });
    } catch (error) {
        next(error);
    }
});

export default router;

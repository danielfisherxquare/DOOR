import { Router } from 'express';
import { requireRoles } from '../../middleware/require-roles.js';
import * as service from './assessment.service.js';

const router = Router();

router.use(requireRoles('super_admin'));

router.get('/campaigns', async (_req, res, next) => {
    try {
        res.json({ success: true, data: await service.listCampaigns() });
    } catch (error) {
        next(error);
    }
});

router.post('/campaigns', async (req, res, next) => {
    try {
        res.status(201).json({ success: true, data: await service.createCampaign(req.body || {}) });
    } catch (error) {
        next(error);
    }
});

router.get('/campaigns/:id', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.getCampaignDetail(req.params.id) });
    } catch (error) {
        next(error);
    }
});

router.put('/campaigns/:id', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.updateCampaign(req.params.id, req.body || {}) });
    } catch (error) {
        next(error);
    }
});

router.post('/campaigns/:id/publish', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.publishCampaign(req.params.id) });
    } catch (error) {
        next(error);
    }
});

router.post('/campaigns/:id/close', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.closeCampaign(req.params.id) });
    } catch (error) {
        next(error);
    }
});

router.get('/campaigns/:id/roster-template', async (_req, res, next) => {
    try {
        res.json({ success: true, data: service.getRosterTemplate() });
    } catch (error) {
        next(error);
    }
});

router.post('/campaigns/:id/roster/import-preview', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.previewRosterImport(req.params.id, req.body?.rows) });
    } catch (error) {
        next(error);
    }
});

router.post('/campaigns/:id/roster/commit', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.commitRosterImport(req.params.id, req.body?.rows) });
    } catch (error) {
        next(error);
    }
});

router.get('/campaigns/:id/team-candidates', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.listCampaignTeamCandidates(req.params.id, req.query?.keyword) });
    } catch (error) {
        next(error);
    }
});

router.put('/campaigns/:id/members', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.setCampaignMembers(req.params.id, req.body?.teamMemberIds) });
    } catch (error) {
        next(error);
    }
});

router.post('/campaigns/:id/invite-codes/generate', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.generateInviteCodes(req.params.id, req.body?.count) });
    } catch (error) {
        next(error);
    }
});

router.post('/invite-codes/:id/reset-progress', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.resetInviteCodeProgress(req.params.id) });
    } catch (error) {
        next(error);
    }
});

router.post('/invite-codes/:id/revoke', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.revokeInviteCode(req.params.id) });
    } catch (error) {
        next(error);
    }
});

router.get('/campaigns/:id/report/overview', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.getCampaignReportOverview(req.params.id) });
    } catch (error) {
        next(error);
    }
});

router.get('/campaigns/:id/report/members/:memberId', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.getMemberReport(req.params.id, req.params.memberId) });
    } catch (error) {
        next(error);
    }
});

router.get('/growth/:employeeCode', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.getGrowthReport(req.params.employeeCode) });
    } catch (error) {
        next(error);
    }
});

export default router;

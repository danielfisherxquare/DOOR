import { Router } from 'express';
import { requireAssessmentSession } from '../../middleware/require-assessment-session.js';
import {
    assessmentDraftLimiter,
    assessmentLoginLimiter,
    assessmentSubmitLimiter,
} from '../../middleware/rate-limiter.js';
import * as service from './assessment.service.js';

const router = Router();

router.get('/campaigns/:campaignId/meta', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.getPublicCampaignMeta(req.params.campaignId) });
    } catch (error) {
        next(error);
    }
});

router.post('/campaigns/:campaignId/login', assessmentLoginLimiter, async (req, res, next) => {
    try {
        const data = await service.loginWithInviteCode(req.params.campaignId, {
            inviteCode: req.body?.inviteCode,
            deviceFingerprint: req.body?.deviceFingerprint,
            ip: req.headers['x-forwarded-for'] || req.ip || '',
            userAgent: req.headers['user-agent'] || '',
        });
        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
});

router.use(requireAssessmentSession);

router.get('/campaigns/:campaignId/progress', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.getProgress(req.params.campaignId, req.assessmentContext.inviteCodeId) });
    } catch (error) {
        next(error);
    }
});

router.get('/campaigns/:campaignId/members', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.listPublicMembers(req.params.campaignId, req.assessmentContext.inviteCodeId) });
    } catch (error) {
        next(error);
    }
});

router.get('/campaigns/:campaignId/members/:memberId/form', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.getMemberForm(req.params.campaignId, req.params.memberId, req.assessmentContext.inviteCodeId) });
    } catch (error) {
        next(error);
    }
});

router.get('/campaigns/:campaignId/members/:memberId/draft', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.getDraft(req.params.campaignId, req.params.memberId, req.assessmentContext.inviteCodeId) });
    } catch (error) {
        next(error);
    }
});

router.put('/campaigns/:campaignId/members/:memberId/draft', assessmentDraftLimiter, async (req, res, next) => {
    try {
        res.json({
            success: true,
            data: await service.saveDraft(
                req.params.campaignId,
                req.params.memberId,
                req.assessmentContext.inviteCodeId,
                req.assessmentContext.sessionId,
                req.body || {},
            ),
        });
    } catch (error) {
        next(error);
    }
});

router.post('/campaigns/:campaignId/members/:memberId/submission', assessmentSubmitLimiter, async (req, res, next) => {
    try {
        res.json({
            success: true,
            data: await service.submitMemberScore(
                req.params.campaignId,
                req.params.memberId,
                req.assessmentContext.inviteCodeId,
                req.assessmentContext.sessionId,
                req.body || {},
            ),
        });
    } catch (error) {
        next(error);
    }
});

router.post('/campaigns/:campaignId/logout', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.logoutSession(req.assessmentContext.sessionId) });
    } catch (error) {
        next(error);
    }
});

export default router;

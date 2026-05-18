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
        const { campaignId } = req.params;

        // 参数验证：检查 campaignId 是否为空
        if (!campaignId || campaignId.trim() === '') {
            return res.status(400).json({ success: false, message: '考评活动 ID 不能为空' });
        }

        // 参数验证：检查 campaignId 是否为有效的 UUID 格式
        const trimmedCampaignId = campaignId.trim();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(trimmedCampaignId)) {
            return res.status(404).json({ success: false, message: '考评活动不存在' });
        }

        const result = await service.getPublicCampaignMeta(trimmedCampaignId);
        res.json({ success: true, data: result });
    } catch (error) {
        // 如果错误带有 HTTP 状态码，直接返回对应状态
        if (error.status && error.expose) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        // 否则传递给全局错误处理器
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

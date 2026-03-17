/**
 * Credential Routes
 * 证件模块 API 路由
 * 挂载于 /api/credential
 */

import { Router } from 'express';
import { requireRaceAccess } from '../../middleware/require-race-access.js';
import { requireRoles } from '../../middleware/require-roles.js';
import * as service from './credential.service.js';

const router = Router();

/**
 * 构建请求上下文
 */
const buildRequestContext = (req) => ({
    ...req.authContext,
    requestId: req.id || null,
});

// ============================================================================
// Credential Zones (分区管理)
// ============================================================================

/**
 * GET /api/credential/zones/:raceId
 * 获取指定赛事的所有分区
 */
router.get('/zones/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.getZones(buildRequestContext(req), req.params.raceId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/credential/zones/:raceId
 * 创建新分区
 */
router.post('/zones/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.createZone(buildRequestContext(req), req.params.raceId, req.body);
        res.status(201).json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * PUT /api/credential/zones/:raceId/:zoneId
 * 更新分区
 */
router.put('/zones/:raceId/:zoneId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.updateZone(
            buildRequestContext(req),
            req.params.raceId,
            req.params.zoneId,
            req.body
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/credential/zones/:raceId/:zoneId
 * 删除分区
 */
router.delete('/zones/:raceId/:zoneId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.deleteZone(
            buildRequestContext(req),
            req.params.raceId,
            req.params.zoneId
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

// ============================================================================
// Credential Role Templates (岗位模板)
// ============================================================================

/**
 * GET /api/credential/role-templates/:raceId
 * 获取指定赛事的所有岗位模板
 */
router.get('/role-templates/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.getRoleTemplates(buildRequestContext(req), req.params.raceId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/credential/role-templates/:raceId
 * 创建岗位模板
 */
router.post('/role-templates/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.createRoleTemplate(buildRequestContext(req), req.params.raceId, req.body);
        res.status(201).json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * PUT /api/credential/role-templates/:raceId/:templateId
 * 更新岗位模板
 */
router.put('/role-templates/:raceId/:templateId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.updateRoleTemplate(
            buildRequestContext(req),
            req.params.raceId,
            req.params.templateId,
            req.body
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/credential/role-templates/:raceId/:templateId
 * 删除岗位模板
 */
router.delete('/role-templates/:raceId/:templateId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.deleteRoleTemplate(
            buildRequestContext(req),
            req.params.raceId,
            req.params.templateId
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

// ============================================================================
// Credential Style Templates (证件样式模板)
// ============================================================================

/**
 * GET /api/credential/style-templates/:raceId
 * 获取指定赛事的所有样式模板
 */
router.get('/style-templates/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.getStyleTemplates(buildRequestContext(req), req.params.raceId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/credential/style-templates/:raceId/:templateId
 * 获取单个样式模板详情
 */
router.get('/style-templates/:raceId/:templateId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.getStyleTemplate(
            buildRequestContext(req),
            req.params.raceId,
            req.params.templateId
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/credential/style-templates/:raceId
 * 创建样式模板
 */
router.post('/style-templates/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.createStyleTemplate(buildRequestContext(req), req.params.raceId, req.body);
        res.status(201).json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * PUT /api/credential/style-templates/:raceId/:templateId
 * 更新样式模板
 */
router.put('/style-templates/:raceId/:templateId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.updateStyleTemplate(
            buildRequestContext(req),
            req.params.raceId,
            req.params.templateId,
            req.body
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/credential/style-templates/:raceId/:templateId
 * 删除样式模板
 */
router.delete('/style-templates/:raceId/:templateId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.deleteStyleTemplate(
            buildRequestContext(req),
            req.params.raceId,
            req.params.templateId
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

// ============================================================================
// Credential Applications (证件申请)
// ============================================================================

/**
 * GET /api/credential/applications/:raceId
 * 获取证件申请列表 (需要管理员权限)
 */
router.get('/applications/:raceId', requireRoles('org_admin', 'super_admin'), requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const { status } = req.query;
        const data = await service.getApplications(buildRequestContext(req), req.params.raceId, { status });
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/credential/applications/:raceId/:applicationId
 * 获取单个申请详情
 */
router.get('/applications/:raceId/:applicationId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.getApplication(
            buildRequestContext(req),
            req.params.raceId,
            req.params.applicationId
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/credential/applications/:raceId
 * 创建证件申请
 */
router.post('/applications/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.createApplication(buildRequestContext(req), req.params.raceId, req.body);
        res.status(201).json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/credential/applications/:raceId/:applicationId/submit
 * 提交申请
 */
router.post('/applications/:raceId/:applicationId/submit', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.submitApplication(
            buildRequestContext(req),
            req.params.raceId,
            req.params.applicationId
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

// ============================================================================
// Credential Review (证件审核)
// ============================================================================

/**
 * POST /api/credential/applications/:raceId/:applicationId/review
 * 审核申请 (需要管理员权限)
 */
router.post('/applications/:raceId/:applicationId/review', requireRoles('org_admin', 'super_admin'), requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const { approved, remark, rejectReason, zoneOverrides } = req.body;
        const data = await service.reviewApplication(
            buildRequestContext(req),
            req.params.raceId,
            req.params.applicationId,
            { approved, remark, rejectReason, zoneOverrides }
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

// ============================================================================
// Credential Credentials (证件实例)
// ============================================================================

/**
 * GET /api/credential/credentials/:raceId
 * 获取证件列表 (需要管理员权限)
 */
router.get('/credentials/:raceId', requireRoles('org_admin', 'super_admin'), requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const { status } = req.query;
        const data = await service.getCredentials(buildRequestContext(req), req.params.raceId, { status });
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/credential/credentials/:raceId/:credentialId
 * 获取单个证件详情
 */
router.get('/credentials/:raceId/:credentialId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.getCredential(
            buildRequestContext(req),
            req.params.raceId,
            req.params.credentialId
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/credential/scan/resolve
 * 扫码解析证件 (公开接口，带限流)
 */
router.post('/scan/resolve', async (req, res, next) => {
    try {
        const { qrPayload } = req.body || {};
        const data = await service.resolveCredentialByQrPayload(buildRequestContext(req), qrPayload);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/credential/credentials/:raceId/:credentialId/void
 * 作废证件 (需要管理员权限)
 */
router.post('/credentials/:raceId/:credentialId/void', requireRoles('org_admin', 'super_admin'), requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const { voidReason, remark } = req.body;
        const data = await service.voidCredential(
            buildRequestContext(req),
            req.params.raceId,
            req.params.credentialId,
            { voidReason, remark }
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/credential/credentials/:raceId/:credentialId/issue
 * 确认领取证件
 */
router.post('/credentials/:raceId/:credentialId/issue', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const { recipientName, recipientIdCard, remark } = req.body;
        const data = await service.issueCredential(
            buildRequestContext(req),
            req.params.raceId,
            req.params.credentialId,
            { recipientName, recipientIdCard, remark }
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/credential/credentials/:raceId/:credentialId/reissue
 * 补打证件 (需要管理员权限)
 */
router.post('/credentials/:raceId/:credentialId/reissue', requireRoles('org_admin', 'super_admin'), requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const { reissueReason, remark } = req.body;
        const data = await service.reissueCredential(
            buildRequestContext(req),
            req.params.raceId,
            req.params.credentialId,
            { reissueReason, remark }
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

// ============================================================================
// Credential Stats (统计)
// ============================================================================

/**
 * GET /api/credential/stats/:raceId
 * 获取证件统计 (需要管理员权限)
 */
router.get('/stats/:raceId', requireRoles('org_admin', 'super_admin'), requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.getCredentialStats(buildRequestContext(req), req.params.raceId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

export default router;

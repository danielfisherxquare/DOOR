import { Router } from 'express';
import { requireRaceAccess } from '../../middleware/require-race-access.js';
import { requireRoles } from '../../middleware/require-roles.js';
import * as service from './credential.service.js';

const router = Router();

const buildRequestContext = (req) => ({
    ...req.authContext,
    requestId: req.id || null,
});

router.get('/access-areas/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.getAccessAreas(buildRequestContext(req), req.params.raceId) });
    } catch (err) {
        next(err);
    }
});

router.post('/access-areas/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.status(201).json({ success: true, data: await service.createAccessArea(buildRequestContext(req), req.params.raceId, req.body) });
    } catch (err) {
        next(err);
    }
});

router.put('/access-areas/:raceId/:accessAreaId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.updateAccessArea(buildRequestContext(req), req.params.raceId, req.params.accessAreaId, req.body) });
    } catch (err) {
        next(err);
    }
});

router.delete('/access-areas/:raceId/:accessAreaId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.deleteAccessArea(buildRequestContext(req), req.params.raceId, req.params.accessAreaId) });
    } catch (err) {
        next(err);
    }
});

router.get('/categories/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.getCategories(buildRequestContext(req), req.params.raceId) });
    } catch (err) {
        next(err);
    }
});

router.post('/categories/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.status(201).json({ success: true, data: await service.createCategory(buildRequestContext(req), req.params.raceId, req.body) });
    } catch (err) {
        next(err);
    }
});

router.put('/categories/:raceId/:categoryId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.updateCategory(buildRequestContext(req), req.params.raceId, req.params.categoryId, req.body) });
    } catch (err) {
        next(err);
    }
});

router.delete('/categories/:raceId/:categoryId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.deleteCategory(buildRequestContext(req), req.params.raceId, req.params.categoryId) });
    } catch (err) {
        next(err);
    }
});

router.get('/style-templates/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.getStyleTemplates(buildRequestContext(req), req.params.raceId) });
    } catch (err) {
        next(err);
    }
});

router.get('/style-templates/:raceId/:templateId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.getStyleTemplate(buildRequestContext(req), req.params.raceId, req.params.templateId) });
    } catch (err) {
        next(err);
    }
});

router.post('/style-templates/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.status(201).json({ success: true, data: await service.createStyleTemplate(buildRequestContext(req), req.params.raceId, req.body) });
    } catch (err) {
        next(err);
    }
});

router.put('/style-templates/:raceId/:templateId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.updateStyleTemplate(buildRequestContext(req), req.params.raceId, req.params.templateId, req.body) });
    } catch (err) {
        next(err);
    }
});

router.delete('/style-templates/:raceId/:templateId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.deleteStyleTemplate(buildRequestContext(req), req.params.raceId, req.params.templateId) });
    } catch (err) {
        next(err);
    }
});

router.get('/requests/:raceId', requireRoles('org_admin', 'super_admin'), requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.getRequests(buildRequestContext(req), req.params.raceId, { status: req.query.status }) });
    } catch (err) {
        next(err);
    }
});

router.get('/requests/:raceId/:requestId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.getRequest(buildRequestContext(req), req.params.raceId, req.params.requestId) });
    } catch (err) {
        next(err);
    }
});

router.post('/requests/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.status(201).json({ success: true, data: await service.createRequest(buildRequestContext(req), req.params.raceId, req.body) });
    } catch (err) {
        next(err);
    }
});

router.post('/requests/:raceId/:requestId/review', requireRoles('org_admin', 'super_admin'), requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.reviewRequest(buildRequestContext(req), req.params.raceId, req.params.requestId, req.body) });
    } catch (err) {
        next(err);
    }
});

router.get('/credentials/:raceId', requireRoles('org_admin', 'super_admin'), requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.getCredentials(buildRequestContext(req), req.params.raceId, { status: req.query.status }) });
    } catch (err) {
        next(err);
    }
});

router.get('/credentials/:raceId/:credentialId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.getCredential(buildRequestContext(req), req.params.raceId, req.params.credentialId) });
    } catch (err) {
        next(err);
    }
});

router.post('/scan/resolve', async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.resolveCredentialByQrPayload(buildRequestContext(req), req.body?.qrPayload) });
    } catch (err) {
        next(err);
    }
});

router.post('/credentials/:raceId/:credentialId/void', requireRoles('org_admin', 'super_admin'), requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.voidCredential(buildRequestContext(req), req.params.raceId, req.params.credentialId, req.body) });
    } catch (err) {
        next(err);
    }
});

router.post('/credentials/:raceId/:credentialId/issue', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.issueCredential(buildRequestContext(req), req.params.raceId, req.params.credentialId, req.body) });
    } catch (err) {
        next(err);
    }
});

router.post('/credentials/:raceId/:credentialId/reissue', requireRoles('org_admin', 'super_admin'), requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.reissueCredential(buildRequestContext(req), req.params.raceId, req.params.credentialId, req.body) });
    } catch (err) {
        next(err);
    }
});

router.get('/stats/:raceId', requireRoles('org_admin', 'super_admin'), requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.json({ success: true, data: await service.getCredentialStats(buildRequestContext(req), req.params.raceId) });
    } catch (err) {
        next(err);
    }
});

export default router;

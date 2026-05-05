import { Router } from 'express';
import { requireRaceAccess } from '../../middleware/require-race-access.js';
import * as jobRepo from '../jobs/job.repository.js';
import {
    getConfig,
    saveConfig,
    getLatestPreview,
    getResults,
    rollbackLatest,
} from './lottery-v2.service.js';

const router = Router();

function raceIdFromParam(req) {
    const raceId = Number(req.params.raceId);
    if (!Number.isFinite(raceId) || raceId <= 0) {
        throw Object.assign(new Error('无效 raceId'), { status: 400, expose: true });
    }
    return raceId;
}

router.get('/config/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const raceId = raceIdFromParam(req);
        const data = await getConfig(req.raceAccess.operatorOrgId, raceId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

router.put('/config/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const raceId = raceIdFromParam(req);
        const data = await saveConfig(req.raceAccess.operatorOrgId, raceId, req.body || {});
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

router.post('/preview/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const raceId = raceIdFromParam(req);
        const orgId = req.raceAccess.operatorOrgId;
        const { userId } = req.authContext;
        const job = await jobRepo.enqueue(
            orgId,
            'lottery-v2:preview',
            { raceId },
            `lottery-v2:preview:${raceId}:${Date.now()}`,
            userId,
            raceId,
        );
        res.json({ success: true, data: { jobId: job.id } });
    } catch (err) { next(err); }
});

router.get('/preview/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const raceId = raceIdFromParam(req);
        const data = await getLatestPreview(req.raceAccess.operatorOrgId, raceId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

router.post('/finalize/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const raceId = raceIdFromParam(req);
        const orgId = req.raceAccess.operatorOrgId;
        const { userId } = req.authContext;
        const job = await jobRepo.enqueue(
            orgId,
            'lottery-v2:finalize',
            { raceId },
            `lottery-v2:finalize:${raceId}:${Date.now()}`,
            userId,
            raceId,
        );
        res.json({ success: true, data: { jobId: job.id } });
    } catch (err) { next(err); }
});

router.get('/results/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const raceId = raceIdFromParam(req);
        const data = await getResults(req.raceAccess.operatorOrgId, raceId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

router.post('/rollback/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const raceId = raceIdFromParam(req);
        const data = await rollbackLatest(req.raceAccess.operatorOrgId, raceId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

export default router;

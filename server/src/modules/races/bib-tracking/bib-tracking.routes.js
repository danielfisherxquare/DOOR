import { Router } from 'express';
import { requireRaceAccess } from '../../../middleware/require-race-access.js';
import { authorize } from '../../../middleware/authorize.js';
import { scanPickupLimiter, scanResolveLimiter } from '../../../middleware/rate-limiter.js';
import * as service from './bib-tracking.service.js';

const router = Router();
const requireBibAdmin = authorize({
    action: 'assume',
    resource: { kind: 'role', roles: ['org_admin', 'super_admin'] },
});
const buildRequestContext = (req) => ({ ...req.authContext, requestId: req.id || null });

router.post('/register/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.registerTrackingItems(buildRequestContext(req), req.params.raceId, req.body);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/scan/resolve', scanResolveLimiter, async (req, res, next) => {
    try {
        const data = await service.resolveTrackingItem(buildRequestContext(req), req.body?.qrToken);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/scan/pickup', scanPickupLimiter, async (req, res, next) => {
    try {
        const data = await service.pickupTrackingItem(buildRequestContext(req), req.body?.qrToken);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get(
    '/items/:raceId/:itemId',
    requireBibAdmin,
    requireRaceAccess('raceId'),
    async (req, res, next) => {
        try {
            const data = await service.getTrackingItemDetail(buildRequestContext(req), req.params.raceId, req.params.itemId);
            res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    },
);

router.post(
    '/items/:raceId/:itemId/rollback',
    requireBibAdmin,
    requireRaceAccess('raceId'),
    async (req, res, next) => {
        try {
            const data = await service.rollbackTrackingItem(buildRequestContext(req), req.params.raceId, req.params.itemId, req.body);
            res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    },
);

router.get('/items/:raceId', requireBibAdmin, requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.listTrackingItems(buildRequestContext(req), req.params.raceId, req.query);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/stats/:raceId', requireBibAdmin, requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.getTrackingStats(buildRequestContext(req), req.params.raceId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/sync/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.syncTrackingStatuses(buildRequestContext(req), req.params.raceId, req.body);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

export default router;

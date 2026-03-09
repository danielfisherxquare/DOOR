import { Router } from 'express';
import { requireRaceAccess } from '../../middleware/require-race-access.js';
import { requireRoles } from '../../middleware/require-roles.js';
import { scanPickupLimiter, scanResolveLimiter } from '../../middleware/rate-limiter.js';
import * as service from './bib-tracking.service.js';

const router = Router();

router.post('/register/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.registerTrackingItems(req.authContext, req.params.raceId, req.body);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/scan/resolve', scanResolveLimiter, async (req, res, next) => {
    try {
        const data = await service.resolveTrackingItem(req.authContext, req.body?.qrToken);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/scan/pickup', scanPickupLimiter, async (req, res, next) => {
    try {
        const data = await service.pickupTrackingItem(req.authContext, req.body?.qrToken);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get(
    '/items/:raceId/:itemId',
    requireRoles('org_admin', 'super_admin'),
    requireRaceAccess('raceId'),
    async (req, res, next) => {
        try {
            const data = await service.getTrackingItemDetail(req.authContext, req.params.raceId, req.params.itemId);
            res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    },
);

router.get('/items/:raceId', requireRoles('org_admin', 'super_admin'), requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.listTrackingItems(req.authContext, req.params.raceId, req.query);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/stats/:raceId', requireRoles('org_admin', 'super_admin'), requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.getTrackingStats(req.authContext, req.params.raceId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/sync/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await service.syncTrackingStatuses(req.authContext, req.params.raceId, req.body);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

export default router;

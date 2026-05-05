/**
 * Race Dashboard Routes - API endpoints for race data dashboard
 */
import { Router } from 'express';
import { requireRaceAccess } from '../../../middleware/require-race-access.js';
import * as repo from './race-dashboard.repository.js';

const router = Router();

/**
 * Build request context from auth
 */
function buildContext(req) {
    return {
        orgId: req.raceAccess?.operatorOrgId || req.authContext?.orgId || null,
        userId: req.authContext?.userId || null,
        role: req.authContext?.role || null,
        requestId: req.id || null,
    };
}

/**
 * GET /api/race-dashboard/:raceId/overview
 * Get complete dashboard overview for a race
 * Query params:
 *   - masked: boolean, if true, sensitive data will be masked
 */
router.get('/:raceId/overview', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const context = buildContext(req);
        const masked = req.query.masked === 'true';

        const data = await repo.getOverview(context.orgId, req.params.raceId, masked);

        if (!data) {
            return res.status(404).json({
                success: false,
                message: '赛事不存在或无权访问',
            });
        }

        res.json({
            success: true,
            data,
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/race-dashboard/:raceId/participants
 * Get participant statistics only
 */
router.get('/:raceId/participants', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const context = buildContext(req);
        const data = await repo.getParticipantStats(context.orgId, req.params.raceId);

        res.json({
            success: true,
            data,
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/race-dashboard/:raceId/bib-status
 * Get Bib tracking statistics only
 */
router.get('/:raceId/bib-status', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const context = buildContext(req);
        const data = await repo.getBibStats(context.orgId, req.params.raceId);

        res.json({
            success: true,
            data,
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/race-dashboard/:raceId/inventory
 * Get inventory statistics only
 */
router.get('/:raceId/inventory', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const context = buildContext(req);
        const data = await repo.getInventoryStats(context.orgId, req.params.raceId);

        res.json({
            success: true,
            data,
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/race-dashboard/:raceId/credentials
 * Get credential statistics only
 */
router.get('/:raceId/credentials', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const context = buildContext(req);
        const data = await repo.getCredentialStats(context.orgId, req.params.raceId);

        res.json({
            success: true,
            data,
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/race-dashboard/:raceId/activities
 * Get recent activities
 * Query params:
 *   - masked: boolean, if true, names will be masked
 *   - limit: number, max activities to return (default 10, max 50)
 */
router.get('/:raceId/activities', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const context = buildContext(req);
        const masked = req.query.masked === 'true';
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

        const data = await repo.getRecentActivities(context.orgId, req.params.raceId, masked);

        res.json({
            success: true,
            data: data.slice(0, limit),
        });
    } catch (err) {
        next(err);
    }
});

export default router;
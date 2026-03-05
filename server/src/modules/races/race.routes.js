/**
 * Race Routes - race CRUD API
 */
import { Router } from 'express';
import * as raceRepo from './race.repository.js';
import { requireRoles } from '../../middleware/require-roles.js';
import { requireRaceAccess } from '../../middleware/require-race-access.js';

const router = Router();

function normalizeOrgId(value) {
    if (value === undefined || value === null || value === '') return null;
    if (Array.isArray(value)) {
        throw Object.assign(new Error('orgId must be a single value'), { status: 400, expose: true });
    }
    const normalized = String(value).trim();
    if (!normalized) return null;
    return normalized;
}

function validateCreatePayload(body) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
        throw Object.assign(new Error('Race name is required'), { status: 400, expose: true });
    }

    if (body.events !== undefined && !Array.isArray(body.events)) {
        throw Object.assign(new Error('events must be an array'), { status: 400, expose: true });
    }

    if (body.conflictRule !== undefined && !['strict', 'permissive'].includes(body.conflictRule)) {
        throw Object.assign(new Error('conflictRule must be strict or permissive'), { status: 400, expose: true });
    }
}

// POST /api/races - create race (org_admin, super_admin)
router.post('/', requireRoles('org_admin', 'super_admin'), async (req, res, next) => {
    try {
        validateCreatePayload(req.body ?? {});

        let orgId = req.authContext.orgId;

        // super_admin has no fixed org_id, prefer request body orgId
        if (!orgId) {
            orgId = normalizeOrgId(req.body.orgId);

            // fallback: first org in system for backward compatibility
            if (!orgId) {
                const knex = (await import('../../db/knex.js')).default;
                const firstOrg = await knex('organizations').orderBy('created_at', 'asc').first();
                if (!firstOrg) {
                    return res.status(400).json({ success: false, message: 'No organization exists yet. Please create one first.' });
                }
                orgId = firstOrg.id;
            }
        }

        const race = await raceRepo.create(orgId, req.body);
        res.status(201).json({ success: true, data: race });
    } catch (err) {
        next(err);
    }
});

// GET /api/races - list current user's allowed races
router.get('/', async (req, res, next) => {
    try {
        const { orgId, userId, role } = req.authContext;
        const scopedOrgId = role === 'super_admin' ? normalizeOrgId(req.query.orgId) : null;
        const races = await raceRepo.findAllAllowed(orgId, userId, role, { orgId: scopedOrgId });
        res.json({ success: true, data: races });
    } catch (err) {
        next(err);
    }
});

// GET /api/races/:raceId - get one race
router.get('/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const race = await raceRepo.findById(req.authContext.orgId, req.params.raceId);
        if (!race) {
            return res.status(404).json({ success: false, message: 'Race not found' });
        }
        res.json({ success: true, data: race });
    } catch (err) {
        next(err);
    }
});

// PUT /api/races/:raceId - update race
router.put('/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const race = await raceRepo.update(req.authContext.orgId, req.params.raceId, req.body);
        if (!race) {
            return res.status(404).json({ success: false, message: 'Race not found' });
        }
        res.json({ success: true, data: race });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/races/:raceId - delete race (cascades records)
router.delete('/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const deleted = await raceRepo.remove(req.authContext.orgId, req.params.raceId);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Race not found' });
        }
        res.json({ success: true, message: 'Race deleted' });
    } catch (err) {
        next(err);
    }
});

export default router;

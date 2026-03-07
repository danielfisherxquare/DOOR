/**
 * Race Routes - race CRUD API
 */
import { Router } from 'express';
import * as raceRepo from './race.repository.js';
import { requireRoles } from '../../middleware/require-roles.js';
import { requireRaceAccess } from '../../middleware/require-race-access.js';
import knex from '../../db/knex.js';
import { normalizeEvent } from '../../utils/event-normalizer.js';

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

function normalizeEvents(events) {
    if (events === undefined) return undefined;
    if (events === null) return [];
    if (!Array.isArray(events)) {
        throw Object.assign(new Error('events must be an array'), { status: 400, expose: true });
    }

    return events.map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw Object.assign(new Error(`events[${index}] must be an object`), { status: 400, expose: true });
        }

        const name = normalizeEvent(item.name);
        if (!name) {
            throw Object.assign(new Error(`events[${index}].name is required`), { status: 400, expose: true });
        }

        const targetRaw = item.targetCount ?? 0;
        const targetCount = Number(targetRaw);
        if (!Number.isFinite(targetCount) || targetCount < 0) {
            throw Object.assign(new Error(`events[${index}].targetCount must be a non-negative number`), { status: 400, expose: true });
        }

        return {
            name,
            targetCount: Math.floor(targetCount),
        };
    });
}

function validateCreatePayload(body) {
    const payload = {};

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
        throw Object.assign(new Error('Race name is required'), { status: 400, expose: true });
    }
    payload.name = name;

    if (body.conflictRule !== undefined && !['strict', 'permissive'].includes(body.conflictRule)) {
        throw Object.assign(new Error('conflictRule must be strict or permissive'), { status: 400, expose: true });
    }

    if (body.events !== undefined) {
        payload.events = normalizeEvents(body.events);
    }

    return payload;
}

function validateUpdatePayload(body) {
    const payload = {};

    if (body.name !== undefined) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) {
            throw Object.assign(new Error('Race name is required'), { status: 400, expose: true });
        }
        payload.name = name;
    }

    if (body.conflictRule !== undefined && !['strict', 'permissive'].includes(body.conflictRule)) {
        throw Object.assign(new Error('conflictRule must be strict or permissive'), { status: 400, expose: true });
    }

    if (body.events !== undefined) {
        payload.events = normalizeEvents(body.events);
    }

    return payload;
}

// POST /api/races - create race (org_admin, super_admin)
router.post('/', requireRoles('org_admin', 'super_admin'), async (req, res, next) => {
    try {
        const normalized = validateCreatePayload(req.body ?? {});

        let orgId = req.authContext.orgId || null;
        if (req.authContext.role === 'super_admin') {
            orgId = normalizeOrgId(req.body.orgId);
            if (!orgId) {
                return res.status(400).json({ success: false, message: 'super_admin creating a race requires orgId' });
            }
        }

        if (!orgId) {
            return res.status(400).json({ success: false, message: 'Missing valid organization context, cannot create race' });
        }

        const org = await knex('organizations').where({ id: orgId }).first('id');
        if (!org) {
            return res.status(404).json({ success: false, message: 'Target organization not found' });
        }

        const payload = {
            ...req.body,
            ...normalized,
        };

        const race = await raceRepo.create(orgId, payload);
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
        const race = await raceRepo.findById(req.raceAccess.operatorOrgId, req.params.raceId);
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
        const normalized = validateUpdatePayload(req.body ?? {});
        const payload = {
            ...req.body,
            ...normalized,
        };

        const race = await raceRepo.update(req.raceAccess.operatorOrgId, req.params.raceId, payload);
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
        const deleted = await raceRepo.remove(req.raceAccess.operatorOrgId, req.params.raceId);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Race not found' });
        }
        res.json({ success: true, message: 'Race deleted' });
    } catch (err) {
        next(err);
    }
});

export default router;

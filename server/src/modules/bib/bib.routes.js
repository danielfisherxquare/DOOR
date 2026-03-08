/**
 * Bib Routes
 * 挂载于 /api/bib
 */
import { Router } from 'express';
import { requireRaceAccess } from '../../middleware/require-race-access.js';
import * as bibRepo from './bib.repository.js';
import * as rollbackRepo from '../lottery/lottery-rollback.repository.js';
import knex from '../../db/knex.js';

const router = Router();

async function resolveRaceIdByBibTemplateId(req) {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
        throw Object.assign(new Error('无效模板 ID'), { status: 400, expose: true });
    }
    const row = await knex('bib_numbering_configs').where({ id }).first('race_id');
    if (!row) {
        throw Object.assign(new Error('模板不存在'), { status: 404, expose: true });
    }
    return row.race_id;
}

// GET /api/bib/overview/:raceId
router.get('/overview/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await bibRepo.getOverview(req.raceAccess.operatorOrgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

// GET /api/bib/templates/:raceId
router.get('/templates/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await bibRepo.getTemplates(req.raceAccess.operatorOrgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

// POST /api/bib/templates
router.post('/templates', requireRaceAccess((req) => req.body.raceId), async (req, res, next) => {
    try {
        const data = await bibRepo.upsertTemplate(req.raceAccess.operatorOrgId, req.body);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/bib/templates/:id
router.delete('/templates/:id', requireRaceAccess(resolveRaceIdByBibTemplateId), async (req, res, next) => {
    try {
        const deleted = await bibRepo.deleteTemplate(req.raceAccess.operatorOrgId, Number(req.params.id));
        if (!deleted) {
            return res.status(404).json({ success: false, message: '模板不存在' });
        }
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// GET /api/bib/dataset/:raceId
router.get('/dataset/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await bibRepo.getDataset(req.raceAccess.operatorOrgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

// GET /api/bib/execution-dataset/:raceId
router.get('/execution-dataset/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await bibRepo.getExecutionDataset(req.raceAccess.operatorOrgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

// POST /api/bib/snapshot/:raceId
router.post('/snapshot/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await bibRepo.createBibSnapshot(req.raceAccess.operatorOrgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

// GET /api/bib/has-snapshot/:raceId
router.get('/has-snapshot/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const hasSnapshot = await bibRepo.hasBibSnapshot(req.raceAccess.operatorOrgId, Number(req.params.raceId));
        res.json({ success: true, data: { hasSnapshot } });
    } catch (err) {
        next(err);
    }
});

// POST /api/bib/rollback/:raceId
router.post('/rollback/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await rollbackRepo.rollbackBib(req.raceAccess.operatorOrgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

// POST /api/bib/bulk-assign/:raceId
router.post('/bulk-assign/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await bibRepo.bulkAssign(
            req.raceAccess.operatorOrgId,
            Number(req.params.raceId),
            req.body.assignments || [],
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

// POST /api/bib/clear/:raceId
router.post('/clear/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await bibRepo.clearBib(req.raceAccess.operatorOrgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

export default router;

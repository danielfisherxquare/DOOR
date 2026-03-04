/**
 * Race Routes — 赛事 CRUD API
 */
import { Router } from 'express';
import * as raceRepo from './race.repository.js';
import { requireRoles } from '../../middleware/require-roles.js';
import { requireRaceAccess } from '../../middleware/require-race-access.js';

const router = Router();

// POST /api/races — 创建赛事 (仅 org_admin, super_admin)
router.post('/', requireRoles('org_admin', 'super_admin'), async (req, res, next) => {
    try {
        const race = await raceRepo.create(req.authContext.orgId, req.body);
        res.status(201).json({ success: true, data: race });
    } catch (err) {
        console.error('API RACES CREATE ERROR:', err);
        next(err);
    }
});

// GET /api/races — 列出组织所有赛事 (所有人可见，但内容已在 service/repo 层由 role 过滤)
router.get('/', async (req, res, next) => {
    try {
        const { orgId, userId, role } = req.authContext;
        const races = await raceRepo.findAllAllowed(orgId, userId, role);
        res.json({ success: true, data: races });
    } catch (err) {
        next(err);
    }
});

// GET /api/races/:raceId — 获取单个赛事
router.get('/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const race = await raceRepo.findById(req.authContext.orgId, req.params.raceId);
        if (!race) {
            return res.status(404).json({ success: false, message: '赛事不存在' });
        }
        res.json({ success: true, data: race });
    } catch (err) {
        next(err);
    }
});

// PUT /api/races/:raceId — 更新赛事
router.put('/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const race = await raceRepo.update(req.authContext.orgId, req.params.raceId, req.body);
        if (!race) {
            return res.status(404).json({ success: false, message: '赛事不存在' });
        }
        res.json({ success: true, data: race });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/races/:raceId — 删除赛事（含级联清理）
router.delete('/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const deleted = await raceRepo.remove(req.authContext.orgId, req.params.raceId);
        if (!deleted) {
            return res.status(404).json({ success: false, message: '赛事不存在' });
        }
        res.json({ success: true, message: '赛事已删除' });
    } catch (err) {
        next(err);
    }
});

export default router;

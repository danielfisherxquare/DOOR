/**
 * Race Routes — 赛事 CRUD API
 */
import { Router } from 'express';
import { tenantContext } from '../../middleware/tenant-context.js';
import * as raceRepo from './race.repository.js';

const router = Router();

// 所有赛事路由都需要认证
router.use(tenantContext);

// POST /api/races — 创建赛事
router.post('/', async (req, res, next) => {
    try {
        const race = await raceRepo.create(req.tenantContext.orgId, req.body);
        res.status(201).json({ success: true, data: race });
    } catch (err) {
        next(err);
    }
});

// GET /api/races — 列出组织所有赛事
router.get('/', async (req, res, next) => {
    try {
        const races = await raceRepo.findAll(req.tenantContext.orgId);
        res.json({ success: true, data: races });
    } catch (err) {
        next(err);
    }
});

// GET /api/races/:raceId — 获取单个赛事
router.get('/:raceId', async (req, res, next) => {
    try {
        const race = await raceRepo.findById(req.tenantContext.orgId, req.params.raceId);
        if (!race) {
            return res.status(404).json({ success: false, message: '赛事不存在' });
        }
        res.json({ success: true, data: race });
    } catch (err) {
        next(err);
    }
});

// PUT /api/races/:raceId — 更新赛事
router.put('/:raceId', async (req, res, next) => {
    try {
        const race = await raceRepo.update(req.tenantContext.orgId, req.params.raceId, req.body);
        if (!race) {
            return res.status(404).json({ success: false, message: '赛事不存在' });
        }
        res.json({ success: true, data: race });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/races/:raceId — 删除赛事（含级联清理）
router.delete('/:raceId', async (req, res, next) => {
    try {
        const deleted = await raceRepo.remove(req.tenantContext.orgId, req.params.raceId);
        if (!deleted) {
            return res.status(404).json({ success: false, message: '赛事不存在' });
        }
        res.json({ success: true, message: '赛事已删除' });
    } catch (err) {
        next(err);
    }
});

export default router;

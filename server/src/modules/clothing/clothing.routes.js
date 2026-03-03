/**
 * Clothing Routes — 服装库存 API
 * 5 个端点，挂载于 /api/clothing
 */
import { Router } from 'express';
import { tenantContext } from '../../middleware/tenant-context.js';
import * as clothingRepo from './clothing.repository.js';

const router = Router();
router.use(tenantContext);

// GET /api/clothing/limits/:raceId — 获取库存
router.get('/limits/:raceId', async (req, res, next) => {
    try {
        const data = await clothingRepo.getLimits(
            req.tenantContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/clothing/limits — 保存单条库存（UPSERT）
router.post('/limits', async (req, res, next) => {
    try {
        const data = await clothingRepo.saveLimit(req.tenantContext.orgId, req.body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/clothing/limits/bulk — 批量保存库存（UPSERT）
router.post('/limits/bulk', async (req, res, next) => {
    try {
        const data = await clothingRepo.saveLimits(req.tenantContext.orgId, req.body.items || []);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/clothing/limits/increment — 增减已用量
router.post('/limits/increment', async (req, res, next) => {
    try {
        const { raceId, event, gender, size, delta } = req.body;
        const data = await clothingRepo.incrementUsed(
            req.tenantContext.orgId, raceId, event, gender, size, delta ?? 1);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// GET /api/clothing/statistics/:raceId — 库存统计
router.get('/statistics/:raceId', async (req, res, next) => {
    try {
        const data = await clothingRepo.getStatistics(
            req.tenantContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

export default router;

/**
 * Clothing Routes — 服装库存 API
 * 5 个端点，挂载于 /api/clothing
 */
import { Router } from 'express';
import { requireRaceAccess } from '../../middleware/require-race-access.js';
import * as clothingRepo from './clothing.repository.js';
import {
    parseClothingBulkPayload,
    parseClothingIncrementPayload,
    parseClothingLimitPayload,
    parseClothingRaceId,
} from './clothing.schema.js';

const router = Router();

function resolveSingleRaceIdFromItems(req) {
    const input = parseClothingBulkPayload(req.body);
    req.clothingBulkInput = input;
    return input.raceId;
}

// GET /api/clothing/limits/:raceId — 获取库存
router.get('/limits/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await clothingRepo.getLimits(
            req.raceAccess.operatorOrgId, parseClothingRaceId(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/clothing/limits — 保存单条库存（UPSERT）
router.post('/limits', requireRaceAccess((req) => parseClothingRaceId(req.body?.raceId)), async (req, res, next) => {
    try {
        const input = parseClothingLimitPayload(req.body);
        const data = await clothingRepo.saveLimit(req.raceAccess.operatorOrgId, input);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/clothing/limits/bulk — 批量保存库存（UPSERT）
router.post('/limits/bulk', requireRaceAccess(resolveSingleRaceIdFromItems), async (req, res, next) => {
    try {
        const input = req.clothingBulkInput || parseClothingBulkPayload(req.body);
        const data = await clothingRepo.saveLimits(req.raceAccess.operatorOrgId, input.items);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/clothing/limits/increment — 增减已用量
router.post('/limits/increment', requireRaceAccess((req) => parseClothingRaceId(req.body?.raceId)), async (req, res, next) => {
    try {
        const input = parseClothingIncrementPayload(req.body);
        const data = await clothingRepo.incrementUsed(
            req.raceAccess.operatorOrgId,
            input.raceId,
            input.event,
            input.gender,
            input.size,
            input.delta
        );
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// GET /api/clothing/statistics/:raceId — 库存统计
router.get('/statistics/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await clothingRepo.getStatistics(
            req.raceAccess.operatorOrgId, parseClothingRaceId(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

export default router;

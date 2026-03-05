/**
 * Pipeline Config Routes — 出发区 + 成绩规则 API
 * 5 个端点，挂载于 /api/pipeline
 */
import { Router } from 'express';
import * as pipelineRepo from './pipeline-config.repository.js';
import { requireRaceAccess } from '../../middleware/require-race-access.js';

const router = Router();

// GET /api/pipeline/preview/:raceId — Pipeline 预览汇总
router.get('/preview/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await pipelineRepo.getPreview(
            req.raceAccess.operatorOrgId,
            Number(req.params.raceId),
        );
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════
//  start_zones
// ═══════════════════════════════════════════════════════════════════════

// GET /api/pipeline/start-zones/:raceId — 获取出发区
router.get('/start-zones/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await pipelineRepo.getStartZones(
            req.raceAccess.operatorOrgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/pipeline/start-zones — 保存出发区（UPSERT）
router.post('/start-zones', requireRaceAccess((req) => req.body.raceId), async (req, res, next) => {
    try {
        const data = await pipelineRepo.saveStartZone(req.raceAccess.operatorOrgId, req.body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// DELETE /api/pipeline/start-zones/:id — 删除出发区
router.delete('/start-zones/:id', async (req, res, next) => {
    try {
        const deleted = await pipelineRepo.deleteStartZone(
            req.authContext.orgId, Number(req.params.id));
        if (!deleted) return res.status(404).json({ success: false, message: '出发区不存在' });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════
//  performance_rules
// ═══════════════════════════════════════════════════════════════════════

// GET /api/pipeline/performance-rules/:raceId — 获取成绩规则
router.get('/performance-rules/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await pipelineRepo.getPerformanceRules(
            req.raceAccess.operatorOrgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/pipeline/performance-rules — 保存成绩规则（UPSERT）
router.post('/performance-rules', requireRaceAccess((req) => req.body.raceId), async (req, res, next) => {
    try {
        const data = await pipelineRepo.savePerformanceRule(req.raceAccess.operatorOrgId, req.body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/pipeline/filter-performance/:raceId — 执行成绩筛选
router.post('/filter-performance/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await pipelineRepo.stepFilterPerformance(
            req.raceAccess.operatorOrgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

export default router;

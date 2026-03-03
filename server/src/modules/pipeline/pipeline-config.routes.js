/**
 * Pipeline Config Routes — 出发区 + 成绩规则 API
 * 5 个端点，挂载于 /api/pipeline
 */
import { Router } from 'express';
import { tenantContext } from '../../middleware/tenant-context.js';
import * as pipelineRepo from './pipeline-config.repository.js';

const router = Router();
router.use(tenantContext);

// GET /api/pipeline/preview/:raceId — Pipeline 预览汇总
router.get('/preview/:raceId', async (req, res, next) => {
    try {
        const data = await pipelineRepo.getPreview(
            req.tenantContext.orgId,
            Number(req.params.raceId),
        );
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════
//  start_zones
// ═══════════════════════════════════════════════════════════════════════

// GET /api/pipeline/start-zones/:raceId — 获取出发区
router.get('/start-zones/:raceId', async (req, res, next) => {
    try {
        const data = await pipelineRepo.getStartZones(
            req.tenantContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/pipeline/start-zones — 保存出发区（UPSERT）
router.post('/start-zones', async (req, res, next) => {
    try {
        const data = await pipelineRepo.saveStartZone(req.tenantContext.orgId, req.body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// DELETE /api/pipeline/start-zones/:id — 删除出发区
router.delete('/start-zones/:id', async (req, res, next) => {
    try {
        const deleted = await pipelineRepo.deleteStartZone(
            req.tenantContext.orgId, Number(req.params.id));
        if (!deleted) return res.status(404).json({ success: false, message: '出发区不存在' });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════
//  performance_rules
// ═══════════════════════════════════════════════════════════════════════

// GET /api/pipeline/performance-rules/:raceId — 获取成绩规则
router.get('/performance-rules/:raceId', async (req, res, next) => {
    try {
        const data = await pipelineRepo.getPerformanceRules(
            req.tenantContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/pipeline/performance-rules — 保存成绩规则（UPSERT）
router.post('/performance-rules', async (req, res, next) => {
    try {
        const data = await pipelineRepo.savePerformanceRule(req.tenantContext.orgId, req.body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/pipeline/filter-performance/:raceId — 执行成绩筛选
router.post('/filter-performance/:raceId', async (req, res, next) => {
    try {
        const data = await pipelineRepo.stepFilterPerformance(
            req.tenantContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

export default router;

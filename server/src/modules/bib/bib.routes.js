/**
 * Bib Routes — 排号配置、数据集、分配、清空 API
 * 10 个端点，挂载于 /api/bib
 */
import { Router } from 'express';
import { tenantContext } from '../../middleware/tenant-context.js';
import * as bibRepo from './bib.repository.js';
import * as rollbackRepo from '../lottery/lottery-rollback.repository.js';

const router = Router();
router.use(tenantContext);

// GET /api/bib/overview/:raceId — 统计概览
router.get('/overview/:raceId', async (req, res, next) => {
    try {
        const data = await bibRepo.getOverview(req.tenantContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// GET /api/bib/templates/:raceId — 获取模板列表
router.get('/templates/:raceId', async (req, res, next) => {
    try {
        const data = await bibRepo.getTemplates(req.tenantContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/bib/templates — 保存模板
router.post('/templates', async (req, res, next) => {
    try {
        const data = await bibRepo.upsertTemplate(req.tenantContext.orgId, req.body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// DELETE /api/bib/templates/:id — 删除模板
router.delete('/templates/:id', async (req, res, next) => {
    try {
        const deleted = await bibRepo.deleteTemplate(req.tenantContext.orgId, Number(req.params.id));
        if (!deleted) return res.status(404).json({ success: false, message: '模板不存在' });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// GET /api/bib/dataset/:raceId — 获取分配数据集
router.get('/dataset/:raceId', async (req, res, next) => {
    try {
        const data = await bibRepo.getDataset(req.tenantContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// GET /api/bib/execution-dataset/:raceId — 获取排号引擎专用数据集
router.get('/execution-dataset/:raceId', async (req, res, next) => {
    try {
        const data = await bibRepo.getExecutionDataset(req.tenantContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/bib/snapshot/:raceId — 创建排号快照
router.post('/snapshot/:raceId', async (req, res, next) => {
    try {
        const data = await bibRepo.createBibSnapshot(req.tenantContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/bib/rollback/:raceId — 回滚排号
router.post('/rollback/:raceId', async (req, res, next) => {
    try {
        const data = await rollbackRepo.rollbackBib(req.tenantContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/bib/bulk-assign/:raceId — 批量写入分配结果
router.post('/bulk-assign/:raceId', async (req, res, next) => {
    try {
        const data = await bibRepo.bulkAssign(
            req.tenantContext.orgId,
            Number(req.params.raceId),
            req.body.assignments || []
        );
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/bib/clear/:raceId — 一键清空
router.post('/clear/:raceId', async (req, res, next) => {
    try {
        const data = await bibRepo.clearBib(req.tenantContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

export default router;

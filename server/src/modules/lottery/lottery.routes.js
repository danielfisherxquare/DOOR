/**
 * Lottery Routes — 抽签配置、名单、规则、权重 API
 * 16 个端点，挂载于 /api/lottery
 */
import { Router } from 'express';
import { tenantContext } from '../../middleware/tenant-context.js';
import * as lotteryRepo from './lottery.repository.js';

const router = Router();
router.use(tenantContext);

// ═══════════════════════════════════════════════════════════════════════
//  race_capacity
// ═══════════════════════════════════════════════════════════════════════

// GET /api/lottery/configs/:raceId — 获取容量配置
router.get('/configs/:raceId', async (req, res, next) => {
    try {
        const data = await lotteryRepo.getRaceCapacity(req.tenantContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/configs/:raceId — 保存容量配置（UPSERT）
router.post('/configs/:raceId', async (req, res, next) => {
    try {
        const data = await lotteryRepo.saveRaceCapacity(
            req.tenantContext.orgId, Number(req.params.raceId), req.body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════
//  lottery_lists
// ═══════════════════════════════════════════════════════════════════════

// GET /api/lottery/lists/:raceId — 获取名单（query: listType）
router.get('/lists/:raceId', async (req, res, next) => {
    try {
        const data = await lotteryRepo.getLists(
            req.tenantContext.orgId, Number(req.params.raceId), req.query.listType);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/lists — 批量保存名单（UPSERT）
router.post('/lists', async (req, res, next) => {
    try {
        const data = await lotteryRepo.saveLists(req.tenantContext.orgId, req.body.entries || []);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// DELETE /api/lottery/lists/:raceId — 清空指定类型名单
router.delete('/lists/:raceId', async (req, res, next) => {
    try {
        const deleted = await lotteryRepo.deleteLists(
            req.tenantContext.orgId, Number(req.params.raceId), req.query.listType);
        res.json({ success: true, data: { deleted } });
    } catch (err) { next(err); }
});

// DELETE /api/lottery/lists/entry/:id — 删除单条名单
router.delete('/lists/entry/:id', async (req, res, next) => {
    try {
        const deleted = await lotteryRepo.deleteList(req.tenantContext.orgId, Number(req.params.id));
        if (!deleted) return res.status(404).json({ success: false, message: '名单条目不存在' });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// PUT /api/lottery/lists/entry/:id — 更新单条名单
router.put('/lists/entry/:id', async (req, res, next) => {
    try {
        const data = await lotteryRepo.updateList(req.tenantContext.orgId, Number(req.params.id), req.body);
        if (!data) return res.status(404).json({ success: false, message: '名单条目不存在' });
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/lists/bulk-add — 批量新增
router.post('/lists/bulk-add', async (req, res, next) => {
    try {
        const data = await lotteryRepo.bulkAddLists(req.tenantContext.orgId, req.body.entries || []);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/lists/bulk-put — 批量 UPSERT
router.post('/lists/bulk-put', async (req, res, next) => {
    try {
        const data = await lotteryRepo.bulkPutLists(req.tenantContext.orgId, req.body.entries || []);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/lists/bulk-delete — 批量删除
router.post('/lists/bulk-delete', async (req, res, next) => {
    try {
        const data = await lotteryRepo.bulkDeleteLists(req.tenantContext.orgId, req.body.ids || []);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// GET /api/lottery/lists/conflicts/:raceId — 冲突检测
router.get('/lists/conflicts/:raceId', async (req, res, next) => {
    try {
        const data = await lotteryRepo.getConflicts(req.tenantContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════
//  lottery_rules
// ═══════════════════════════════════════════════════════════════════════

// GET /api/lottery/rules/:raceId — 获取规则
router.get('/rules/:raceId', async (req, res, next) => {
    try {
        const data = await lotteryRepo.getRules(req.tenantContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/rules — 保存规则（UPSERT）
router.post('/rules', async (req, res, next) => {
    try {
        const data = await lotteryRepo.saveRule(req.tenantContext.orgId, req.body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════
//  lottery_weights
// ═══════════════════════════════════════════════════════════════════════

// GET /api/lottery/weights/:raceId — 获取权重
router.get('/weights/:raceId', async (req, res, next) => {
    try {
        const data = await lotteryRepo.getWeights(req.tenantContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/weights — 保存权重（UPSERT）
router.post('/weights', async (req, res, next) => {
    try {
        const data = await lotteryRepo.saveWeight(req.tenantContext.orgId, req.body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// DELETE /api/lottery/weights/:id — 删除权重
router.delete('/weights/:id', async (req, res, next) => {
    try {
        const deleted = await lotteryRepo.deleteWeight(req.tenantContext.orgId, Number(req.params.id));
        if (!deleted) return res.status(404).json({ success: false, message: '权重不存在' });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// DELETE /api/lottery/weights/all/:raceId — 清空所有权重
router.delete('/weights/all/:raceId', async (req, res, next) => {
    try {
        const deleted = await lotteryRepo.deleteAllWeights(req.tenantContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data: { deleted } });
    } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════
//  抽签执行 / 结果 / 快照 / 回滚（Phase 6）
// ═══════════════════════════════════════════════════════════════════════
import * as jobRepo from '../jobs/job.repository.js';
import * as snapshotRepo from '../pipeline/snapshot.repository.js';
import * as rollbackRepo from './lottery-rollback.repository.js';

// POST /api/lottery/finalize/:raceId — 入队 finalize Job
router.post('/finalize/:raceId', async (req, res, next) => {
    try {
        const { orgId, userId } = req.tenantContext;
        const raceId = Number(req.params.raceId);
        const idempotencyKey = `lottery:finalize:${raceId}`;
        const job = await jobRepo.enqueue(orgId, 'lottery:finalize', { raceId }, idempotencyKey, userId, raceId);
        res.json({ success: true, data: { jobId: job.id } });
    } catch (err) { next(err); }
});

// GET /api/lottery/results/:raceId — 聚合统计结果
router.get('/results/:raceId', async (req, res, next) => {
    try {
        const { orgId } = req.tenantContext;
        const raceId = Number(req.params.raceId);
        const results = await lotteryRepo.getLotteryResults(orgId, raceId);
        res.json({ success: true, data: results });
    } catch (err) { next(err); }
});

// GET /api/lottery/has-snapshot/:raceId — 查询是否有抽签快照
router.get('/has-snapshot/:raceId', async (req, res, next) => {
    try {
        const { orgId } = req.tenantContext;
        const raceId = Number(req.params.raceId);
        const has = await snapshotRepo.hasSnapshot(orgId, raceId, 'pre_lottery');
        res.json({ success: true, data: { hasSnapshot: has } });
    } catch (err) { next(err); }
});

// POST /api/lottery/rollback/:raceId — 回滚抽签
router.post('/rollback/:raceId', async (req, res, next) => {
    try {
        const { orgId } = req.tenantContext;
        const raceId = Number(req.params.raceId);
        const result = await rollbackRepo.rollbackLottery(orgId, raceId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

export default router;

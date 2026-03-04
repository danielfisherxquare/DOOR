/**
 * Lottery Routes — 抽签配置、名单、规则、权重 API
 * 16 个端点，挂载于 /api/lottery
 */
import { Router } from 'express';
import { requireRaceAccess } from '../../middleware/require-race-access.js';
import { requireOrgScope } from '../../middleware/require-org-scope.js';
import * as lotteryRepo from './lottery.repository.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════
//  race_capacity
// ═══════════════════════════════════════════════════════════════════════

// GET /api/lottery/configs/:raceId — 获取容量配置
router.get('/configs/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await lotteryRepo.getRaceCapacity(req.authContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/configs/:raceId — 保存容量配置（UPSERT）
router.post('/configs/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await lotteryRepo.saveRaceCapacity(
            req.authContext.orgId, Number(req.params.raceId), req.body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════
//  lottery_lists
// ═══════════════════════════════════════════════════════════════════════

// GET /api/lottery/lists/:raceId — 获取名单（query: listType）
router.get('/lists/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await lotteryRepo.getLists(
            req.authContext.orgId, Number(req.params.raceId), req.query.listType);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/lists — 批量保存名单（UPSERT）
router.post('/lists', requireRaceAccess((req) => req.body.entries?.[0]?.raceId), async (req, res, next) => {
    try {
        const data = await lotteryRepo.saveLists(req.authContext.orgId, req.body.entries || []);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// DELETE /api/lottery/lists/:raceId — 清空指定类型名单
router.delete('/lists/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const deleted = await lotteryRepo.deleteLists(
            req.authContext.orgId, Number(req.params.raceId), req.query.listType);
        res.json({ success: true, data: { deleted } });
    } catch (err) { next(err); }
});

// DELETE /api/lottery/lists/entry/:id — 删除单条名单
router.delete('/lists/entry/:id', requireOrgScope(), async (req, res, next) => {
    try {
        const deleted = await lotteryRepo.deleteList(req.authContext.orgId, Number(req.params.id));
        if (!deleted) return res.status(404).json({ success: false, message: '名单条目不存在' });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// PUT /api/lottery/lists/entry/:id — 更新单条名单
router.put('/lists/entry/:id', requireOrgScope(), async (req, res, next) => {
    try {
        const data = await lotteryRepo.updateList(req.authContext.orgId, Number(req.params.id), req.body);
        if (!data) return res.status(404).json({ success: false, message: '名单条目不存在' });
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/lists/bulk-add — 批量新增
router.post('/lists/bulk-add', requireRaceAccess((req) => req.body.entries?.[0]?.raceId), async (req, res, next) => {
    try {
        const data = await lotteryRepo.bulkAddLists(req.authContext.orgId, req.body.entries || []);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/lists/bulk-put — 批量 UPSERT
router.post('/lists/bulk-put', requireRaceAccess((req) => req.body.entries?.[0]?.raceId), async (req, res, next) => {
    try {
        const data = await lotteryRepo.bulkPutLists(req.authContext.orgId, req.body.entries || []);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/lists/bulk-delete — 批量删除
router.post('/lists/bulk-delete', requireOrgScope(), async (req, res, next) => {
    try {
        const data = await lotteryRepo.bulkDeleteLists(req.authContext.orgId, req.body.ids || []);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// GET /api/lottery/lists/conflicts/:raceId — 冲突检测
router.get('/lists/conflicts/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await lotteryRepo.getConflicts(req.authContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════
//  lottery_rules
// ═══════════════════════════════════════════════════════════════════════

// GET /api/lottery/rules/:raceId — 获取规则
router.get('/rules/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await lotteryRepo.getRules(req.authContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/rules — 保存规则（UPSERT）
router.post('/rules', requireRaceAccess((req) => req.body.raceId), async (req, res, next) => {
    try {
        const data = await lotteryRepo.saveRule(req.authContext.orgId, req.body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════
//  lottery_weights
// ═══════════════════════════════════════════════════════════════════════

// GET /api/lottery/weights/:raceId — 获取权重
router.get('/weights/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await lotteryRepo.getWeights(req.authContext.orgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/weights — 保存权重（UPSERT）
router.post('/weights', requireRaceAccess((req) => req.body.raceId), async (req, res, next) => {
    try {
        const data = await lotteryRepo.saveWeight(req.authContext.orgId, req.body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// DELETE /api/lottery/weights/:id — 删除权重
router.delete('/weights/:id', requireOrgScope(), async (req, res, next) => {
    try {
        const deleted = await lotteryRepo.deleteWeight(req.authContext.orgId, Number(req.params.id));
        if (!deleted) return res.status(404).json({ success: false, message: '权重不存在' });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// DELETE /api/lottery/weights/all/:raceId — 清空所有权重
router.delete('/weights/all/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const deleted = await lotteryRepo.deleteAllWeights(req.authContext.orgId, Number(req.params.raceId));
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
router.post('/finalize/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const { orgId, userId } = req.authContext;
        const raceId = Number(req.params.raceId);
        const idempotencyKey = `lottery:finalize:${raceId}`;
        const job = await jobRepo.enqueue(orgId, 'lottery:finalize', { raceId }, idempotencyKey, userId, raceId);
        res.json({ success: true, data: { jobId: job.id } });
    } catch (err) { next(err); }
});

// GET /api/lottery/results/:raceId — 聚合统计结果
router.get('/results/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const { orgId } = req.authContext;
        const raceId = Number(req.params.raceId);
        const results = await lotteryRepo.getLotteryResults(orgId, raceId);
        res.json({ success: true, data: results });
    } catch (err) { next(err); }
});

// GET /api/lottery/has-snapshot/:raceId — 查询是否有抽签快照
router.get('/has-snapshot/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const { orgId } = req.authContext;
        const raceId = Number(req.params.raceId);
        const has = await snapshotRepo.hasSnapshot(orgId, raceId, 'pre_lottery');
        res.json({ success: true, data: { hasSnapshot: has } });
    } catch (err) { next(err); }
});

// POST /api/lottery/rollback/:raceId — 回滚抽签
router.post('/rollback/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const { orgId } = req.authContext;
        const raceId = Number(req.params.raceId);
        const result = await rollbackRepo.rollbackLottery(orgId, raceId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

export default router;

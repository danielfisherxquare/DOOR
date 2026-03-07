/**
 * Lottery Routes — 抽签配置、名单、规则、权重 API
 * 16 个端点，挂载于 /api/lottery
 */
import { Router } from 'express';
import { requireRaceAccess } from '../../middleware/require-race-access.js';
import * as lotteryRepo from './lottery.repository.js';
import knex from '../../db/knex.js';

const router = Router();

function normalizePositiveInt(raw, fieldName) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        throw Object.assign(new Error(`无效 ${fieldName}`), { status: 400, expose: true });
    }
    return value;
}

function resolveSingleRaceIdFromEntries(req) {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    if (entries.length === 0) {
        throw Object.assign(new Error('entries must be a non-empty array'), { status: 400, expose: true });
    }

    const raceIds = new Set(
        entries
            .map((entry) => Number(entry?.raceId))
            .filter((raceId) => Number.isFinite(raceId) && raceId > 0),
    );
    if (raceIds.size !== 1) {
        throw Object.assign(new Error('批量请求必须且只能包含一个 raceId'), { status: 400, expose: true });
    }

    return [...raceIds][0];
}

async function resolveRaceIdByLotteryListEntryId(req) {
    const id = normalizePositiveInt(req.params.id, '名单条目 ID');
    const row = await knex('lottery_lists').where({ id }).first('race_id');
    if (!row) {
        throw Object.assign(new Error('名单条目不存在'), { status: 404, expose: true });
    }
    return row.race_id;
}

async function resolveRaceIdByBulkDeleteListIds(req) {
    const ids = [...new Set(
        (Array.isArray(req.body?.ids) ? req.body.ids : [])
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id > 0),
    )];
    if (ids.length === 0) {
        throw Object.assign(new Error('ids must be a non-empty array'), { status: 400, expose: true });
    }

    const rows = await knex('lottery_lists')
        .whereIn('id', ids)
        .select('id', 'race_id');
    if (rows.length !== ids.length) {
        throw Object.assign(new Error('部分名单条目不存在或不可访问'), { status: 404, expose: true });
    }

    const raceIds = new Set(rows.map((row) => Number(row.race_id)));
    if (raceIds.size !== 1) {
        throw Object.assign(new Error('批量删除仅支持同一赛事的数据'), { status: 400, expose: true });
    }

    return rows[0].race_id;
}

async function resolveRaceIdByLotteryWeightId(req) {
    const id = normalizePositiveInt(req.params.id, '权重 ID');
    const row = await knex('lottery_weights').where({ id }).first('race_id');
    if (!row) {
        throw Object.assign(new Error('权重不存在'), { status: 404, expose: true });
    }
    return row.race_id;
}

// ═══════════════════════════════════════════════════════════════════════
//  race_capacity
// ═══════════════════════════════════════════════════════════════════════

// GET /api/lottery/configs/:raceId — 获取容量配置
router.get('/configs/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await lotteryRepo.getRaceCapacity(req.raceAccess.operatorOrgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/configs/:raceId — 保存容量配置（UPSERT）
router.post('/configs/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await lotteryRepo.saveRaceCapacity(
            req.raceAccess.operatorOrgId, Number(req.params.raceId), req.body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// DELETE /api/lottery/configs/entry/:id — 删除单条容量配置
router.delete('/configs/entry/:id', requireRaceAccess(async (req) => {
    const id = normalizePositiveInt(req.params.id, '容量配置 ID');
    const row = await knex('race_capacity').where({ id }).first('race_id');
    if (!row) throw Object.assign(new Error('容量配置不存在'), { status: 404, expose: true });
    return row.race_id;
}), async (req, res, next) => {
    try {
        const deleted = await lotteryRepo.deleteRaceCapacity(
            req.raceAccess.operatorOrgId, Number(req.params.id));
        if (!deleted) return res.status(404).json({ success: false, message: '容量配置不存在' });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════
//  lottery_lists
// ═══════════════════════════════════════════════════════════════════════

// GET /api/lottery/lists/:raceId — 获取名单（query: listType）
router.get('/lists/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await lotteryRepo.getLists(
            req.raceAccess.operatorOrgId, Number(req.params.raceId), req.query.listType);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/lists — 批量保存名单（UPSERT）
router.post('/lists', requireRaceAccess(resolveSingleRaceIdFromEntries), async (req, res, next) => {
    try {
        const data = await lotteryRepo.saveLists(req.raceAccess.operatorOrgId, req.body.entries || []);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// DELETE /api/lottery/lists/:raceId — 清空指定类型名单
router.delete('/lists/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const deleted = await lotteryRepo.deleteLists(
            req.raceAccess.operatorOrgId, Number(req.params.raceId), req.query.listType);
        res.json({ success: true, data: { deleted } });
    } catch (err) { next(err); }
});

// DELETE /api/lottery/lists/entry/:id — 删除单条名单
router.delete('/lists/entry/:id', requireRaceAccess(resolveRaceIdByLotteryListEntryId), async (req, res, next) => {
    try {
        const deleted = await lotteryRepo.deleteList(req.raceAccess.operatorOrgId, Number(req.params.id));
        if (!deleted) return res.status(404).json({ success: false, message: '名单条目不存在' });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// PUT /api/lottery/lists/entry/:id — 更新单条名单
router.put('/lists/entry/:id', requireRaceAccess(resolveRaceIdByLotteryListEntryId), async (req, res, next) => {
    try {
        const data = await lotteryRepo.updateList(req.raceAccess.operatorOrgId, Number(req.params.id), req.body);
        if (!data) return res.status(404).json({ success: false, message: '名单条目不存在' });
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/lists/bulk-add — 批量新增
router.post('/lists/bulk-add', requireRaceAccess(resolveSingleRaceIdFromEntries), async (req, res, next) => {
    try {
        const data = await lotteryRepo.bulkAddLists(req.raceAccess.operatorOrgId, req.body.entries || []);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/lists/bulk-put — 批量 UPSERT
router.post('/lists/bulk-put', requireRaceAccess(resolveSingleRaceIdFromEntries), async (req, res, next) => {
    try {
        const data = await lotteryRepo.bulkPutLists(req.raceAccess.operatorOrgId, req.body.entries || []);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/lists/bulk-delete — 批量删除
router.post('/lists/bulk-delete', requireRaceAccess(resolveRaceIdByBulkDeleteListIds), async (req, res, next) => {
    try {
        const data = await lotteryRepo.bulkDeleteLists(req.raceAccess.operatorOrgId, req.body.ids || []);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// GET /api/lottery/lists/conflicts/:raceId — 冲突检测
router.get('/lists/conflicts/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await lotteryRepo.getConflicts(req.raceAccess.operatorOrgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════
//  lottery_rules
// ═══════════════════════════════════════════════════════════════════════

// GET /api/lottery/rules/:raceId — 获取规则
router.get('/rules/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await lotteryRepo.getRules(req.raceAccess.operatorOrgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/rules — 保存规则（UPSERT）
router.post('/rules', requireRaceAccess((req) => req.body.raceId), async (req, res, next) => {
    try {
        const data = await lotteryRepo.saveRule(req.raceAccess.operatorOrgId, req.body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════
//  lottery_weights
// ═══════════════════════════════════════════════════════════════════════

// GET /api/lottery/weights/:raceId — 获取权重
router.get('/weights/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await lotteryRepo.getWeights(req.raceAccess.operatorOrgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// POST /api/lottery/weights — 保存权重（UPSERT）
router.post('/weights', requireRaceAccess((req) => req.body.raceId), async (req, res, next) => {
    try {
        const data = await lotteryRepo.saveWeight(req.raceAccess.operatorOrgId, req.body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// DELETE /api/lottery/weights/:id — 删除权重
router.delete('/weights/:id', requireRaceAccess(resolveRaceIdByLotteryWeightId), async (req, res, next) => {
    try {
        const deleted = await lotteryRepo.deleteWeight(req.raceAccess.operatorOrgId, Number(req.params.id));
        if (!deleted) return res.status(404).json({ success: false, message: '权重不存在' });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// DELETE /api/lottery/weights/all/:raceId — 清空所有权重
router.delete('/weights/all/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const deleted = await lotteryRepo.deleteAllWeights(req.raceAccess.operatorOrgId, Number(req.params.raceId));
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
        const { userId } = req.authContext;
        const orgId = req.raceAccess.operatorOrgId;
        const raceId = Number(req.params.raceId);
        const idempotencyKey = `lottery:finalize:${raceId}:${Date.now()}`;
        const job = await jobRepo.enqueue(orgId, 'lottery:finalize', { raceId }, idempotencyKey, userId, raceId);
        res.json({ success: true, data: { jobId: job.id } });
    } catch (err) { next(err); }
});

// GET /api/lottery/results/:raceId — 聚合统计结果
router.get('/results/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const orgId = req.raceAccess.operatorOrgId;
        const raceId = Number(req.params.raceId);
        const results = await lotteryRepo.getLotteryResults(orgId, raceId);
        res.json({ success: true, data: results });
    } catch (err) { next(err); }
});

// GET /api/lottery/has-snapshot/:raceId — 查询是否有抽签快照
router.get('/has-snapshot/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const orgId = req.raceAccess.operatorOrgId;
        const raceId = Number(req.params.raceId);
        const has = await snapshotRepo.hasSnapshot(orgId, raceId, 'pre_lottery');
        res.json({ success: true, data: { hasSnapshot: has } });
    } catch (err) { next(err); }
});

// POST /api/lottery/rollback/:raceId — 回滚抽签
router.post('/rollback/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const orgId = req.raceAccess.operatorOrgId;
        const raceId = Number(req.params.raceId);
        const result = await rollbackRepo.rollbackLottery(orgId, raceId);
        res.json({ success: true, data: result });
    } catch (err) { next(err); }
});

export default router;

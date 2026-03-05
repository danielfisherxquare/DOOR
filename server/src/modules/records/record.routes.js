/**
 * Record Routes — 选手记录 API（读路径 + 写路径）
 */
import { Router } from 'express';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { recordMapper } from '../../db/mappers/records.js';
import * as recordRepo from './record.repository.js';
import { requireRaceAccess } from '../../middleware/require-race-access.js';
import { resolveRaceAccess } from '../races/race-access.service.js';

const router = Router();

async function resolveScopedOrgId(req, raceId) {
    if (raceId !== undefined && raceId !== null && raceId !== '') {
        const access = await resolveRaceAccess(req.authContext, raceId, req.method);
        req.raceAccess = access;
        return access.operatorOrgId;
    }

    if (['race_editor', 'race_viewer'].includes(req.authContext.role)) {
        throw Object.assign(new Error('当前角色必须指定 raceId'), { status: 400, expose: true });
    }

    return req.authContext.orgId;
}

// POST /api/records/query — 综合查询
router.post('/query', async (req, res, next) => {
    try {
        const { keyword, filters, offset, limit, raceId, sort } = req.body;
        const scopedOrgId = await resolveScopedOrgId(req, raceId);
        const result = await recordRepo.query(
            scopedOrgId,
            raceId,
            { keyword, filters, offset, limit, sort },
        );
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// POST /api/records/analysis — 数据库统计分析
router.post('/analysis', async (req, res, next) => {
    try {
        const { keyword, filters, raceId } = req.body;
        const scopedOrgId = await resolveScopedOrgId(req, raceId);
        const result = await recordRepo.analysis(
            scopedOrgId,
            raceId,
            { keyword, filters },
        );
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// POST /api/records/unique-values — 获取字段唯一值
router.post('/unique-values', async (req, res, next) => {
    try {
        const { field, raceId, limit } = req.body;
        if (!field) {
            return res.status(400).json({ success: false, message: '缺少 field 参数' });
        }
        const scopedOrgId = await resolveScopedOrgId(req, raceId);
        const values = await recordRepo.uniqueValues(
            scopedOrgId,
            raceId,
            field,
            limit,
        );
        res.json({ success: true, data: values });
    } catch (err) {
        next(err);
    }
});

// GET /api/records/quick-stats/:raceId — 首页快速统计
router.get('/quick-stats/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const winnerStatuses = req.query.statuses
            ? req.query.statuses.split(',')
            : [];
        const result = await recordRepo.quickStats(
            req.raceAccess.operatorOrgId,
            req.params.raceId,
            winnerStatuses,
        );
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// ── 写路径 ────────────────────────────────────────────

// PUT /api/records/:recordId — 单条记录更新
router.put('/:recordId', async (req, res, next) => {
    try {
        const updated = await recordRepo.updateById(
            req.authContext.orgId,
            req.params.recordId,
            req.body,
        );
        if (!updated) {
            return res.status(404).json({ success: false, message: '记录不存在' });
        }
        res.json({ success: true, data: updated });
    } catch (err) {
        next(err);
    }
});

// POST /api/records/bulk-update — 批量更新记录
router.post('/bulk-update', async (req, res, next) => {
    try {
        const { updates } = req.body;
        if (!Array.isArray(updates)) {
            return res.status(400).json({ success: false, message: 'updates must be an array' });
        }

        const result = await recordRepo.bulkUpdate(
            req.authContext.orgId,
            updates,
        );
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/records/race/:raceId — 清空赛事数据
router.delete('/race/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const deleted = await recordRepo.deleteByRaceId(
            req.raceAccess.operatorOrgId,
            req.params.raceId,
        );
        res.json({ success: true, deleted });
    } catch (err) {
        next(err);
    }
});

// GET /api/records/export/:raceId — 流式导出（NDJSON）
router.get('/export/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Transfer-Encoding', 'chunked');

        const dbStream = recordRepo.streamByRaceId(
            req.raceAccess.operatorOrgId,
            req.params.raceId,
        );

        const toNdjson = new Transform({
            objectMode: true,
            transform(row, _encoding, callback) {
                try {
                    const mapped = recordMapper.fromDbRow(row);
                    callback(null, JSON.stringify(mapped) + '\n');
                } catch (err) {
                    callback(err);
                }
            },
        });

        await pipeline(dbStream, toNdjson, res);
    } catch (err) {
        // 如果 headers 已发送，不能再用 next
        if (res.headersSent) {
            res.end();
            return;
        }
        next(err);
    }
});

// POST /api/records/import-verification/:raceId — 校验成绩导入
router.post('/import-verification/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const raceId = Number(req.params.raceId);
        if (!raceId || !Number.isFinite(raceId)) {
            return res.status(400).json({ success: false, message: 'Invalid raceId' });
        }

        const results = req.body;
        if (!Array.isArray(results)) {
            return res.status(400).json({ success: false, message: 'Body must be an array of verification results' });
        }

        const result = await recordRepo.importVerificationResults(
            req.raceAccess.operatorOrgId,
            raceId,
            results,
        );
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

export default router;


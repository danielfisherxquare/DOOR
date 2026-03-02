/**
 * Record Routes — 选手记录 API（读路径 + 写路径）
 */
import { Router } from 'express';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { tenantContext } from '../../middleware/tenant-context.js';
import { recordMapper } from '../../db/mappers/records.js';
import * as recordRepo from './record.repository.js';

const router = Router();

// 所有记录路由都需要认证
router.use(tenantContext);

// POST /api/records/query — 综合查询
router.post('/query', async (req, res, next) => {
    try {
        const { keyword, filters, offset, limit, raceId, sort } = req.body;
        const result = await recordRepo.query(
            req.tenantContext.orgId,
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
        const result = await recordRepo.analysis(
            req.tenantContext.orgId,
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
        const values = await recordRepo.uniqueValues(
            req.tenantContext.orgId,
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
router.get('/quick-stats/:raceId', async (req, res, next) => {
    try {
        const winnerStatuses = req.query.statuses
            ? req.query.statuses.split(',')
            : [];
        const result = await recordRepo.quickStats(
            req.tenantContext.orgId,
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
            req.tenantContext.orgId,
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

// DELETE /api/records/race/:raceId — 清空赛事数据
router.delete('/race/:raceId', async (req, res, next) => {
    try {
        const deleted = await recordRepo.deleteByRaceId(
            req.tenantContext.orgId,
            req.params.raceId,
        );
        res.json({ success: true, deleted });
    } catch (err) {
        next(err);
    }
});

// GET /api/records/export/:raceId — 流式导出（NDJSON）
router.get('/export/:raceId', async (req, res, next) => {
    try {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Transfer-Encoding', 'chunked');

        const dbStream = recordRepo.streamByRaceId(
            req.tenantContext.orgId,
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

export default router;


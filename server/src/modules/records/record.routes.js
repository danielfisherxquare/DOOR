/**
 * Record Routes — 选手记录 API（读路径）
 */
import { Router } from 'express';
import { tenantContext } from '../../middleware/tenant-context.js';
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

export default router;

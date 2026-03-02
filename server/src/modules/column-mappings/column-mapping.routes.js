/**
 * Column Mappings Routes — 列映射 CRUD API
 */
import { Router } from 'express';
import { tenantContext } from '../../middleware/tenant-context.js';
import * as repo from './column-mapping.repository.js';

const router = Router();

// 所有列映射路由都需要认证 + 租户隔离
router.use(tenantContext);

// GET /api/column-mappings — 获取全部映射
router.get('/', async (req, res, next) => {
    try {
        const mappings = await repo.findAllByOrg(req.tenantContext.orgId);
        res.json({ success: true, data: mappings });
    } catch (err) {
        next(err);
    }
});

// POST /api/column-mappings — 批量保存/更新映射
router.post('/', async (req, res, next) => {
    try {
        const { mappings } = req.body;
        if (!Array.isArray(mappings)) {
            return res.status(400).json({ success: false, message: 'mappings 必须是数组' });
        }
        const result = await repo.upsertBatch(req.tenantContext.orgId, mappings);
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/column-mappings — 批量删除指定 IDs
router.delete('/', async (req, res, next) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids)) {
            return res.status(400).json({ success: false, message: 'ids 必须是数组' });
        }
        const deleted = await repo.deleteByIds(req.tenantContext.orgId, ids);
        res.json({ success: true, deleted });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/column-mappings/all — 清空全部映射
router.delete('/all', async (req, res, next) => {
    try {
        const deleted = await repo.clearByOrg(req.tenantContext.orgId);
        res.json({ success: true, deleted });
    } catch (err) {
        next(err);
    }
});

export default router;

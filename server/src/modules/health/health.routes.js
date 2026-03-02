import { Router } from 'express';
import knex from '../../db/knex.js';

const router = Router();

/**
 * GET /api/health/live
 * 存活探针 — 进程存活即返回 ok
 */
router.get('/live', (_req, res) => {
    res.json({ status: 'ok' });
});

/**
 * GET /api/health/ready
 * 就绪探针 — 检查 PG 连接
 */
router.get('/ready', async (_req, res) => {
    try {
        await knex.raw('SELECT 1');
        res.json({ status: 'ok', database: 'connected' });
    } catch (err) {
        console.error('健康检查失败:', err.message);
        res.status(503).json({ status: 'error', database: 'disconnected' });
    }
});

export default router;

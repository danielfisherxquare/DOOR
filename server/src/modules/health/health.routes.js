import { Router } from 'express';
import knex from '../../db/knex.js';
import { checkKeyHealth } from '../../utils/key-guard.js';

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
 * 就绪探针 — 检查 PG 连接 + 加密密钥一致性
 */
router.get('/ready', async (_req, res) => {
    try {
        await knex.raw('SELECT 1');
        const keyStatus = await checkKeyHealth(knex);
        if (!keyStatus.healthy) {
            return res.status(503).json({
                status: 'error',
                database: 'connected',
                encryption: 'key_mismatch',
                message: '加密密钥与数据库不匹配，请检查 .env 文件',
            });
        }
        res.json({ status: 'ok', database: 'connected', encryption: 'ok' });
    } catch (err) {
        console.error('健康检查失败:', err.message);
        res.status(503).json({ status: 'error', database: 'disconnected' });
    }
});

export default router;


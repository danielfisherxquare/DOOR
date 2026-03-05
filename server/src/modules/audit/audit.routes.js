/**
 * Audit Routes — 审核准备统计、审核重置、5 步审核 API
 * 7 个端点，挂载于 /api/audit
 *
 * 审核步骤通过 Job 引擎执行：
 *   POST → enqueue job → 返回 jobId → 前端轮询 GET /api/jobs/:jobId
 */
import { Router } from 'express';
import { requireRaceAccess } from '../../middleware/require-race-access.js';
import * as auditRepo from './audit.repository.js';
import * as jobRepo from '../jobs/job.repository.js';

const router = Router();

// ─── 统计 ────────────────────────────────────────────────────────────

// GET /api/audit/prep-stats/:raceId — 审核准备统计
router.get('/prep-stats/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await auditRepo.getPrepStats(
            req.raceAccess.operatorOrgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// ─── 重置 ────────────────────────────────────────────────────────────

// POST /api/audit/reset/:raceId — 重置审核状态（含叠加保护）
router.post('/reset/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const data = await auditRepo.resetAudit(
            req.raceAccess.operatorOrgId, Number(req.params.raceId));
        res.json({ success: true, data });
    } catch (err) { next(err); }
});

// ─── 5 步审核（Job 入队）─────────────────────────────────────────────

/**
 * 通用审核步骤入队辅助函数
 * @param {number} stepNumber - 1-5
 * @param {string} stepName - underage/blacklist/fake_elite/direct_lock/mass_pool
 */
async function enqueueAuditStep(req, res, next, stepNumber, stepName) {
    try {
        const { userId } = req.authContext;
        const orgId = req.raceAccess.operatorOrgId;
        const raceId = Number(req.params.raceId);

        // 创建 audit_run 记录
        const run = await auditRepo.createRun(orgId, raceId, stepNumber, stepName);

        // 入队 Job（幂等：同 raceId+stepName 不会重复创建）
        const job = await jobRepo.enqueue(
            orgId,
            `audit:${stepName}`,
            {
                raceId,
                runId: run.id,
                stepNumber,
                stepName,
                ...req.body,   // 可能包含 raceDate 等额外参数
            },
            `audit:${stepName}:${raceId}`,   // idempotency key
            userId,
            raceId,
        );

        res.json({ success: true, data: { jobId: job.id, runId: run.id } });
    } catch (err) { next(err); }
}

// POST /api/audit/step/underage/:raceId — 步骤 1: 年龄检查
router.post('/step/underage/:raceId', requireRaceAccess('raceId'), (req, res, next) =>
    enqueueAuditStep(req, res, next, 1, 'underage'));

// POST /api/audit/step/blacklist/:raceId — 步骤 2: 黑名单碰撞
router.post('/step/blacklist/:raceId', requireRaceAccess('raceId'), (req, res, next) =>
    enqueueAuditStep(req, res, next, 2, 'blacklist'));

// POST /api/audit/step/fake-elite/:raceId — 步骤 3: 精英伪造
router.post('/step/fake-elite/:raceId', requireRaceAccess('raceId'), (req, res, next) =>
    enqueueAuditStep(req, res, next, 3, 'fake_elite'));

// POST /api/audit/step/direct-lock/:raceId — 步骤 4: 直通锁定
router.post('/step/direct-lock/:raceId', requireRaceAccess('raceId'), (req, res, next) =>
    enqueueAuditStep(req, res, next, 4, 'direct_lock'));

// POST /api/audit/step/mass-pool/:raceId — 步骤 5: 大众池标记
router.post('/step/mass-pool/:raceId', requireRaceAccess('raceId'), (req, res, next) =>
    enqueueAuditStep(req, res, next, 5, 'mass_pool'));

export default router;

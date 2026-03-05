import { Router } from 'express';
import { requireRaceAccess } from '../../middleware/require-race-access.js';
import { requireRoles } from '../../middleware/require-roles.js';
import { importSessionRepository } from './import-session.repository.js';
import * as jobRepository from '../jobs/job.repository.js';

const router = Router();

router.use(requireRoles('org_admin', 'super_admin', 'race_editor'));

// ==========================================
// 1. 创建会话
// ==========================================
router.post('/', async (req, res, next) => {
    try {
        const orgId = req.authContext.orgId;
        const session = await importSessionRepository.create(orgId);
        res.json({
            success: true,
            data: session
        });
    } catch (err) {
        next(err);
    }
});

// ==========================================
// 2. 获取会话信息
// ==========================================
router.get('/:sid', async (req, res, next) => {
    try {
        const { sid } = req.params;
        const orgId = req.authContext.orgId;
        const session = await importSessionRepository.findById(orgId, sid);

        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }

        res.json({
            success: true,
            data: session
        });
    } catch (err) {
        next(err);
    }
});

// ==========================================
// 3. 设置摘要
// ==========================================
router.put('/:sid/summary', async (req, res, next) => {
    try {
        const { sid } = req.params;
        const orgId = req.authContext.orgId;
        const summary = req.body;

        const session = await importSessionRepository.setSummary(orgId, sid, summary);
        res.json({
            success: true,
            data: session
        });
    } catch (err) {
        next(err);
    }
});

// ==========================================
// 4. 追加数据块 (Chunk)
// ==========================================
router.post('/:sid/chunks', async (req, res, next) => {
    try {
        const { sid } = req.params;
        const orgId = req.authContext.orgId;
        const rows = req.body;

        const totalRows = await importSessionRepository.appendChunk(orgId, sid, rows);
        res.json({
            success: true,
            data: { totalRows }
        });
    } catch (err) {
        next(err);
    }
});

// ==========================================
// 5. 分页读取 Chunk
// ==========================================
router.get('/:sid/chunks', async (req, res, next) => {
    try {
        const { sid } = req.params;
        const orgId = req.authContext.orgId;
        const offset = parseInt(req.query.offset || '0', 10);
        const limit = parseInt(req.query.limit || '100', 10);

        const rows = await importSessionRepository.getChunk(orgId, sid, offset, limit);
        res.json({
            success: true,
            data: rows
        });
    } catch (err) {
        next(err);
    }
});

// ==========================================
// 6. 取消/删除会话
// ==========================================
router.delete('/:sid', async (req, res, next) => {
    try {
        const { sid } = req.params;
        const orgId = req.authContext.orgId;

        const deleted = await importSessionRepository.cancel(orgId, sid);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Session not found or already deleted' });
        }

        res.json({
            success: true,
            data: null
        });
    } catch (err) {
        next(err);
    }
});

// ==========================================
// 7. 提交会话 (触发 Job)
// 此时涉及到提交到某一场具体比赛，因此这里需要挂载 requireRaceAccess
// ==========================================
router.post('/:sid/commit', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const { sid } = req.params;
        const orgId = req.raceAccess.operatorOrgId;
        const { raceId, category } = req.body;

        const session = await importSessionRepository.findById(orgId, sid);
        if (!session || session.status !== 'open') {
            return res.status(400).json({ success: false, message: 'Session invalid or already committed' });
        }

        if (!raceId) {
            return res.status(400).json({ success: false, message: 'raceId is required' });
        }

        // 创建异步 Job，携带必要参数
        const job = await jobRepository.enqueue(
            orgId,
            'commit-import-session',
            { sessionId: sid, raceId, category: category || 'Mass' },
            `${orgId}:import:${sid}`, // idempotency_key 保证只产生一个
            req.authContext.userId,  // createdBy
        );

        res.json({
            success: true,
            data: { jobId: job.id }
        });
    } catch (err) {
        next(err);
    }
});

export default router;

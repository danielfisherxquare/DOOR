import { Router } from 'express';
import { requireRaceAccess } from '../../middleware/require-race-access.js';
import { requireRoles } from '../../middleware/require-roles.js';
import { importSessionRepository } from './import-session.repository.js';
import * as jobRepository from '../jobs/job.repository.js';
import knex from '../../db/knex.js';

const router = Router();

router.use(requireRoles('org_admin', 'super_admin', 'race_editor'));

function badRequest(message) {
    return Object.assign(new Error(message), { status: 400, expose: true });
}

function notFound(message) {
    return Object.assign(new Error(message), { status: 404, expose: true });
}

async function resolveOrgId(req, options = {}) {
    const { sid } = options;
    const { role, orgId } = req.authContext || {};

    if (orgId) return orgId;

    if (role !== 'super_admin') {
        throw badRequest('当前账号未绑定机构，无法操作导入会话');
    }

    // super_admin 可显式传 orgId
    const explicitOrgId = req.query.orgId || req.body?.orgId;
    if (explicitOrgId) {
        const org = await knex('organizations').where({ id: explicitOrgId }).first('id');
        if (!org) throw notFound('目标机构不存在');
        return explicitOrgId;
    }

    // 对已有会话，可反查归属机构
    if (sid) {
        const session = await knex('import_sessions').where({ id: sid }).first('id', 'org_id');
        if (!session) throw notFound('Session not found');
        return session.org_id;
    }

    // 创建会话时，可通过 raceId 推导机构
    const raceIdRaw = req.query.raceId || req.body?.raceId;
    const raceId = Number(raceIdRaw);
    if (!Number.isFinite(raceId) || raceId <= 0) {
        throw badRequest('super_admin 创建导入会话时必须提供 raceId 或 orgId');
    }
    const race = await knex('races').where({ id: raceId }).first('id', 'org_id');
    if (!race) throw notFound('目标赛事不存在');

    return race.org_id;
}

// ==========================================
// 1. 创建会话
// ==========================================
router.post('/', async (req, res, next) => {
    try {
        const orgId = await resolveOrgId(req);
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
        const orgId = await resolveOrgId(req, { sid });
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
        const orgId = await resolveOrgId(req, { sid });
        const summary = req.body;

        // 验证 summary 必须是对象
        if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
            throw badRequest('summary 必须是有效的对象');
        }

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
        const orgId = await resolveOrgId(req, { sid });
        const rows = req.body;

        // 验证 rows 必须是数组
        if (!Array.isArray(rows)) {
            throw badRequest('rows 必须是数组');
        }

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
        const orgId = await resolveOrgId(req, { sid });
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
        const orgId = await resolveOrgId(req, { sid });

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

        // 验证必填字段
        if (!raceId) {
            return res.status(400).json({ success: false, message: 'raceId is required' });
        }

        const raceIdNum = Number(raceId);
        if (!Number.isFinite(raceIdNum) || raceIdNum <= 0) {
            return res.status(400).json({ success: false, message: 'raceId 必须是有效的正整数' });
        }

        const session = await importSessionRepository.findById(orgId, sid);
        if (!session || session.status !== 'open') {
            return res.status(400).json({ success: false, message: 'Session invalid or already committed' });
        }

        // 创建异步 Job，携带必要参数
        const job = await jobRepository.enqueue(
            orgId,
            'commit-import-session',
            { sessionId: sid, raceId: raceIdNum, category: category || 'Mass' },
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

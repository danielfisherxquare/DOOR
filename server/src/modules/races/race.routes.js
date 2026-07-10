/**
 * Race Routes - race CRUD API and bib tracking
 */
import { Router } from 'express';
import * as raceRepo from './race.repository.js';
import { authorize } from '../../middleware/authorize.js';
import { requireRaceAccess } from '../../middleware/require-race-access.js';
import knex from '../../db/knex.js';
import { normalizeEvent } from '../../utils/event-normalizer.js';
import bibTrackingRoutes from './bib-tracking/bib-tracking.routes.js';
import raceDashboardRoutes from './race-dashboard/race-dashboard.routes.js';
import raceStaffRoutes from './race-staff.routes.js';
import { operationLog } from '../../middleware/operation-log.js';

const router = Router();
const requireRaceAdmin = authorize({
    action: 'assume',
    resource: { kind: 'role', roles: ['org_admin', 'super_admin'] },
});

// Mount bib-tracking routes under /bibs
router.use('/bibs', bibTrackingRoutes);

// Mount race-dashboard routes under /dashboard
router.use('/dashboard', raceDashboardRoutes);

// Mount race staff assignment routes before /:raceId catch-all routes.
router.use('/:raceId/staff-assignments', requireRaceAccess('raceId'), raceStaffRoutes);

function normalizeOrgId(value) {
    if (value === undefined || value === null || value === '') return null;
    if (Array.isArray(value)) {
        throw Object.assign(new Error('orgId must be a single value'), { status: 400, expose: true });
    }
    const normalized = String(value).trim();
    if (!normalized) return null;
    return normalized;
}

function normalizeEvents(events) {
    if (events === undefined) return undefined;
    if (events === null) return [];
    if (!Array.isArray(events)) {
        throw Object.assign(new Error('events must be an array'), { status: 400, expose: true });
    }

    return events.map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw Object.assign(new Error(`events[${index}] must be an object`), { status: 400, expose: true });
        }

        const name = normalizeEvent(item.name);
        if (!name) {
            throw Object.assign(new Error(`events[${index}].name is required`), { status: 400, expose: true });
        }

        const targetRaw = item.targetCount ?? 0;
        const targetCount = Number(targetRaw);
        if (!Number.isFinite(targetCount) || targetCount < 0) {
            throw Object.assign(new Error(`events[${index}].targetCount must be a non-negative number`), { status: 400, expose: true });
        }

        return {
            name,
            targetCount: Math.floor(targetCount),
        };
    });
}

function validateCreatePayload(body) {
    const payload = {};

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
        throw Object.assign(new Error('Race name is required'), { status: 400, expose: true });
    }
    payload.name = name;

    const date = typeof body.date === 'string' ? body.date.trim() : '';
    if (!date) {
        throw Object.assign(new Error('Race date is required'), { status: 400, expose: true });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw Object.assign(new Error('Race date must be in YYYY-MM-DD format'), { status: 400, expose: true });
    }
    payload.date = date;

    if (body.conflictRule !== undefined && !['strict', 'permissive'].includes(body.conflictRule)) {
        throw Object.assign(new Error('conflictRule must be strict or permissive'), { status: 400, expose: true });
    }

    if (body.events !== undefined) {
        payload.events = normalizeEvents(body.events);
    }

    return payload;
}

function validateUpdatePayload(body) {
    const payload = {};

    if (body.name !== undefined) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) {
            throw Object.assign(new Error('Race name is required'), { status: 400, expose: true });
        }
        payload.name = name;
    }

    if (body.date !== undefined) {
        const date = typeof body.date === 'string' ? body.date.trim() : '';
        if (!date) {
            throw Object.assign(new Error('Race date cannot be empty'), { status: 400, expose: true });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            throw Object.assign(new Error('Race date must be in YYYY-MM-DD format'), { status: 400, expose: true });
        }
        payload.date = date;
    }

    if (body.conflictRule !== undefined && !['strict', 'permissive'].includes(body.conflictRule)) {
        throw Object.assign(new Error('conflictRule must be strict or permissive'), { status: 400, expose: true });
    }

    if (body.events !== undefined) {
        payload.events = normalizeEvents(body.events);
    }

    return payload;
}

/**
 * @swagger
 * /api/admin/races:
 *   post:
 *     tags: [Race]
 *     summary: 创建赛事
 *     description: 创建新的赛事，需要 org_admin 或 super_admin 角色
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - date
 *             properties:
 *               name:
 *                 type: string
 *                 description: 赛事名称
 *               date:
 *                 type: string
 *                 format: date
 *                 description: 赛事日期 (YYYY-MM-DD)
 *               conflictRule:
 *                 type: string
 *                 enum: [strict, permissive]
 *                 description: 冲突规则
 *               events:
 *                 type: array
 *                 description: 赛事项目列表
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     targetCount:
 *                       type: integer
 *               orgId:
 *                 type: string
 *                 description: 目标组织ID (仅 super_admin 需要)
 *     responses:
 *       201:
 *         description: 创建成功
 *       400:
 *         description: 参数校验失败
 *       404:
 *         description: 目标组织不存在
 */
// POST /api/races - create race (org_admin, super_admin)
router.post('/', operationLog({ module: 'races', businessType: 'INSERT', titleFactory: (req) => '创建赛事: ' + (req.body?.name || '') }), requireRaceAdmin, async (req, res, next) => {
    try {
        const normalized = validateCreatePayload(req.body ?? {});

        let orgId = req.authContext.orgId || null;
        if (req.authContext.role === 'super_admin') {
            orgId = normalizeOrgId(req.body.orgId);
            if (!orgId) {
                return res.status(400).json({ success: false, message: 'super_admin creating a race requires orgId' });
            }
        }

        if (!orgId) {
            return res.status(400).json({ success: false, message: 'Missing valid organization context, cannot create race' });
        }

        const org = await knex('organizations').where({ id: orgId }).first('id');
        if (!org) {
            return res.status(404).json({ success: false, message: 'Target organization not found' });
        }

        const payload = {
            ...req.body,
            ...normalized,
        };

        const race = await raceRepo.create(orgId, payload);
        res.status(201).json({ success: true, data: race });
    } catch (err) {
        next(err);
    }
});

/**
 * @swagger
 * /api/admin/races:
 *   get:
 *     tags: [Race]
 *     summary: 获取赛事列表
 *     description: 获取当前用户有权访问的赛事列表，super_admin 可通过 orgId 参数查看指定组织的赛事
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orgId
 *         schema:
 *           type: string
 *         description: 组织ID (仅 super_admin 可用)
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 */
// GET /api/races - list current user's allowed races
router.get('/', async (req, res, next) => {
    try {
        const { orgId, userId, role } = req.authContext;
        const scopedOrgId = role === 'super_admin' ? normalizeOrgId(req.query.orgId) : null;
        const races = await raceRepo.findAllAllowed(orgId, userId, role, { orgId: scopedOrgId });
        res.json({ success: true, data: races });
    } catch (err) {
        next(err);
    }
});

/**
 * @swagger
 * /api/admin/races/{raceId}:
 *   get:
 *     tags: [Race]
 *     summary: 获取赛事详情
 *     description: 根据赛事ID获取赛事详细信息
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *         description: 赛事ID
 *     responses:
 *       200:
 *         description: 获取成功
 *       404:
 *         description: 赛事不存在
 */
// GET /api/races/:raceId - get one race
router.get('/:raceId', requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const race = await raceRepo.findById(req.raceAccess.operatorOrgId, req.params.raceId);
        if (!race) {
            return res.status(404).json({ success: false, message: 'Race not found' });
        }
        res.json({ success: true, data: race });
    } catch (err) {
        next(err);
    }
});

/**
 * @swagger
 * /api/admin/races/{raceId}:
 *   put:
 *     tags: [Race]
 *     summary: 更新赛事
 *     description: 更新指定赛事的信息
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *         description: 赛事ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: 赛事名称
 *               date:
 *                 type: string
 *                 format: date
 *                 description: 赛事日期 (YYYY-MM-DD)
 *               conflictRule:
 *                 type: string
 *                 enum: [strict, permissive]
 *                 description: 冲突规则
 *               events:
 *                 type: array
 *                 description: 赛事项目列表
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     targetCount:
 *                       type: integer
 *     responses:
 *       200:
 *         description: 更新成功
 *       400:
 *         description: 参数校验失败
 *       404:
 *         description: 赛事不存在
 */
// PUT /api/races/:raceId - update race
router.put('/:raceId', operationLog({ module: 'races', businessType: 'UPDATE', titleFactory: (req) => '更新赛事: ' + (req.params?.raceId || '') }), requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const normalized = validateUpdatePayload(req.body ?? {});
        const payload = {
            ...req.body,
            ...normalized,
        };

        const race = await raceRepo.update(req.raceAccess.operatorOrgId, req.params.raceId, payload);
        if (!race) {
            return res.status(404).json({ success: false, message: 'Race not found' });
        }
        res.json({ success: true, data: race });
    } catch (err) {
        next(err);
    }
});

/**
 * @swagger
 * /api/admin/races/{raceId}:
 *   delete:
 *     tags: [Race]
 *     summary: 删除赛事
 *     description: 删除指定赛事（级联删除相关记录）
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: raceId
 *         required: true
 *         schema:
 *           type: string
 *         description: 赛事ID
 *     responses:
 *       200:
 *         description: 删除成功
 *       404:
 *         description: 赛事不存在
 */
// DELETE /api/races/:raceId - delete race (cascades records)
router.delete('/:raceId', operationLog({ module: 'races', businessType: 'DELETE', titleFactory: (req) => '删除赛事: ' + (req.params?.raceId || '') }), requireRaceAccess('raceId'), async (req, res, next) => {
    try {
        const deleted = await raceRepo.remove(req.raceAccess.operatorOrgId, req.params.raceId);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Race not found' });
        }
        res.json({ success: true, message: 'Race deleted' });
    } catch (err) {
        next(err);
    }
});

export default router;

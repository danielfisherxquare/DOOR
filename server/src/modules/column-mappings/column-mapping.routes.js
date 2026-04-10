import { Router } from 'express';
import knex from '../../db/knex.js';
import * as repo from './column-mapping.repository.js';
import { requireRoles } from '../../middleware/require-roles.js';

const router = Router();

const READ_SCOPES = new Set(['effective', 'user', 'org']);
const WRITE_SCOPES = new Set(['user', 'org']);

router.use(requireRoles('org_admin', 'super_admin', 'race_admin'));

function badRequest(message) {
    return Object.assign(new Error(message), { status: 400, expose: true });
}

function notFound(message) {
    return Object.assign(new Error(message), { status: 404, expose: true });
}

function parseReadScope(req) {
    const scope = String(req.query.scope || 'effective').trim();
    if (!READ_SCOPES.has(scope)) {
        throw badRequest(`Unsupported column mapping scope: ${scope}`);
    }
    return scope;
}

function parseWriteScope(req, defaultScope = 'user') {
    const scope = String(req.body?.scope || req.query.scope || defaultScope).trim();
    if (!WRITE_SCOPES.has(scope)) {
        throw badRequest(`Unsupported column mapping scope: ${scope}`);
    }
    return scope;
}

function assertOrgScopeAllowed(req, scope) {
    if (scope !== 'org') return;
    if (!['org_admin', 'super_admin'].includes(req.authContext?.role)) {
        throw Object.assign(new Error('Only org admins can manage org column mappings'), { status: 403, expose: true });
    }
}

async function resolveOrgId(req) {
    const { role, orgId } = req.authContext || {};
    if (orgId) return orgId;

    if (role !== 'super_admin') {
        const err = new Error('当前账户缺少机构上下文，请联系管理员分配机构');
        err.status = 400;
        err.expose = true;
        throw err;
    }

    const explicitOrgId = req.query.orgId || req.body?.orgId;
    if (!explicitOrgId) {
        const err = new Error('超级管理员需要指定 orgId 参数');
        err.status = 400;
        err.expose = true;
        throw err;
    }

    const org = await knex('organizations').where({ id: explicitOrgId }).first('id');
    if (!org) {
        const err = new Error('目标机构不存在');
        err.status = 404;
        err.expose = true;
        throw err;
    }
    return explicitOrgId;
}

router.get('/', async (req, res, next) => {
    try {
        const scope = parseReadScope(req);
        assertOrgScopeAllowed(req, scope);
        const orgId = await resolveOrgId(req);
        const userId = req.authContext?.userId || null;

        let mappings;
        if (scope === 'user') {
            mappings = await repo.findByUserScope(orgId, userId);
        } else if (scope === 'org') {
            mappings = await repo.findByOrgScope(orgId);
        } else {
            mappings = await repo.findEffective(orgId, userId);
        }

        res.json({ success: true, data: mappings });
    } catch (err) {
        next(err);
    }
});

router.post('/', async (req, res, next) => {
    try {
        const scope = parseWriteScope(req);
        assertOrgScopeAllowed(req, scope);
        const { mappings } = req.body || {};
        if (!Array.isArray(mappings)) {
            return res.status(400).json({ success: false, message: 'mappings must be an array' });
        }

        const orgId = await resolveOrgId(req);
        const userId = req.authContext?.userId || null;

        const result = scope === 'org'
            ? await repo.upsertOrgBatch(orgId, mappings)
            : await repo.upsertUserBatch(orgId, userId, mappings);

        res.status(201).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

router.delete('/', async (req, res, next) => {
    try {
        const scope = parseWriteScope(req);
        assertOrgScopeAllowed(req, scope);
        const { ids } = req.body || {};
        if (!Array.isArray(ids)) {
            return res.status(400).json({ success: false, message: 'ids must be an array' });
        }

        const orgId = await resolveOrgId(req);
        const userId = req.authContext?.userId || null;
        const deleted = scope === 'org'
            ? await repo.deleteOrgByIds(orgId, ids)
            : await repo.deleteUserByIds(orgId, userId, ids);

        res.json({ success: true, data: { deleted } });
    } catch (err) {
        next(err);
    }
});

router.delete('/all', async (req, res, next) => {
    try {
        const scope = parseWriteScope(req);
        assertOrgScopeAllowed(req, scope);

        const orgId = await resolveOrgId(req);
        const userId = req.authContext?.userId || null;
        const deleted = scope === 'org'
            ? await repo.clearOrgScope(orgId)
            : await repo.clearUserScope(orgId, userId);

        res.json({ success: true, data: { deleted } });
    } catch (err) {
        next(err);
    }
});

export default router;

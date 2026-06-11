import knex from '../../db/knex.js';
import { getDefaultModules, getRoleDefaultModules } from '../../utils/capability-policy.js';
import { listVisibleRacesForOrg } from '../races/race-access.service.js';
import { ALL_MODULES, listAllModuleIds } from '../module-access/module-access.registry.js';

const ACCOUNT_FIELDS = [
    'users.id',
    'users.username',
    'users.email',
    'users.role',
    'users.status',
    'users.org_id',
    'users.account_source',
    'users.must_change_password',
    'users.team_member_id',
    'organizations.name as org_name',
    'team_members.employee_name as team_member_name',
    'team_members.member_type',
];

const EDITABLE_MATRIX_ROLES = ['race_admin', 'user'];

function badRequest(message) {
    return Object.assign(new Error(message), { status: 400, expose: true });
}

function forbidden(message) {
    return Object.assign(new Error(message), { status: 403, expose: true });
}

function normalizeId(value) {
    if (value === undefined || value === null || value === '') return null;
    return String(value);
}

function applyKeyword(query, keyword) {
    if (!keyword) return;
    query.where(function keywordFilter() {
        this.where('users.username', 'ilike', `%${keyword}%`)
            .orWhere('users.email', 'ilike', `%${keyword}%`)
            .orWhere('team_members.employee_name', 'ilike', `%${keyword}%`);
    });
}

function buildAccountBaseQuery(orgId) {
    return knex('users')
        .leftJoin('organizations', 'users.org_id', 'organizations.id')
        .leftJoin('team_members', 'users.team_member_id', 'team_members.id')
        .where('users.org_id', orgId);
}

function normalizeAccessLevel(value) {
    if (value === 'editor') return 'editor';
    if (value === 'viewer') return 'viewer';
    return null;
}

function capAccessLevelByRole(role, accessLevel) {
    const normalized = normalizeAccessLevel(accessLevel);
    if (!normalized) return null;
    if (role === 'user') return 'viewer';
    return normalized;
}

function pickStricterAccessLevel(left, right) {
    if (!left) return right || null;
    if (!right) return left || null;
    if (left === 'viewer' || right === 'viewer') return 'viewer';
    return 'editor';
}

function getCellState(inheritedAccessLevel, explicitAccessLevel, effectiveAccessLevel) {
    if (!effectiveAccessLevel) return 'none';
    if (explicitAccessLevel === 'editor') return 'explicit_editor';
    if (explicitAccessLevel === 'viewer') return 'explicit_viewer';
    if (inheritedAccessLevel === 'editor') return 'inherited_editor';
    if (inheritedAccessLevel === 'viewer') return 'inherited_viewer';
    return 'none';
}

async function resolveScopedOrgId(authContext, requestedOrgId, options = {}) {
    const normalizedRequestedOrgId = normalizeId(requestedOrgId);
    if (authContext.role === 'super_admin') {
        if (!normalizedRequestedOrgId && options.allowUnscoped) {
            return null;
        }
        if (!normalizedRequestedOrgId) {
            throw badRequest('Missing orgId for super_admin');
        }
        const org = await knex('organizations').where({ id: normalizedRequestedOrgId }).first('id');
        if (!org) {
            throw Object.assign(new Error('机构不存在'), { status: 404, expose: true });
        }
        return normalizedRequestedOrgId;
    }

    const authOrgId = normalizeId(authContext.orgId);
    if (!authOrgId) {
        throw forbidden('当前账号未绑定机构');
    }
    if (normalizedRequestedOrgId && normalizedRequestedOrgId !== authOrgId) {
        throw forbidden('无权访问其他机构');
    }
    return authOrgId;
}

async function fetchOrg(orgId) {
    if (!orgId) return null;
    return knex('organizations').where({ id: orgId }).first('id', 'name', 'slug');
}

async function fetchSummaryCounts(orgId = null) {
    const userQuery = knex('users');
    const teamQuery = knex('team_members');
    const orgRaceQuery = knex('org_race_permissions');

    if (orgId) {
        userQuery.where('org_id', orgId);
        teamQuery.where('org_id', orgId);
        orgRaceQuery.where('org_id', orgId);
    }

    const [userRows, teamRows, orgRaceRow] = await Promise.all([
        userQuery
            .select(
                knex.raw('COUNT(*)::int AS total'),
                knex.raw(`SUM(CASE WHEN status <> 'active' THEN 1 ELSE 0 END)::int AS disabled_count`),
                knex.raw(`SUM(CASE WHEN must_change_password = true THEN 1 ELSE 0 END)::int AS must_change_count`),
                knex.raw(`SUM(CASE WHEN team_member_id IS NULL AND role <> 'super_admin' THEN 1 ELSE 0 END)::int AS unbound_count`),
            )
            .first(),
        teamQuery
            .select(
                knex.raw('COUNT(*)::int AS total'),
                knex.raw(`SUM(CASE WHEN member_type = 'external_support' THEN 1 ELSE 0 END)::int AS external_count`),
            )
            .first(),
        orgRaceQuery.count('* as count').first(),
    ]);

    return {
        userCount: Number(userRows?.total || 0),
        disabledCount: Number(userRows?.disabled_count || 0),
        mustChangeCount: Number(userRows?.must_change_count || 0),
        unboundCount: Number(userRows?.unbound_count || 0),
        teamMemberCount: Number(teamRows?.total || 0),
        externalCount: Number(teamRows?.external_count || 0),
        orgPermissionCount: Number(orgRaceRow?.count || 0),
    };
}

export async function getIdentityCenterSummary(authContext, requestedOrgId) {
    const scopedOrgId = await resolveScopedOrgId(authContext, requestedOrgId, { allowUnscoped: true });
    const counts = await fetchSummaryCounts(scopedOrgId);
    const org = await fetchOrg(scopedOrgId);

    const pendingItems = [];
    if (counts.mustChangeCount > 0) pendingItems.push(`待改密账号 ${counts.mustChangeCount} 个`);
    if (counts.unboundCount > 0) pendingItems.push(`未绑定成员账号 ${counts.unboundCount} 个`);
    if (counts.disabledCount > 0) pendingItems.push(`禁用账号 ${counts.disabledCount} 个`);
    if (scopedOrgId && counts.orgPermissionCount > 0) pendingItems.push(`机构已授权赛事 ${counts.orgPermissionCount} 场`);

    return {
        scoped: Boolean(scopedOrgId),
        orgId: scopedOrgId,
        org,
        metrics: {
            userCount: counts.userCount,
            teamMemberCount: counts.teamMemberCount,
            pendingCount: counts.disabledCount + counts.mustChangeCount + counts.unboundCount,
            externalCount: counts.externalCount,
            orgPermissionCount: counts.orgPermissionCount,
        },
        pendingItems,
    };
}

export async function listIdentityAccounts(authContext, requestedOrgId, { page = 1, limit = 20, keyword = '' } = {}) {
    const scopedOrgId = await resolveScopedOrgId(authContext, requestedOrgId);
    const query = buildAccountBaseQuery(scopedOrgId)
        .select(ACCOUNT_FIELDS)
        .whereNot('users.role', 'super_admin');

    applyKeyword(query, keyword);

    const totalRow = await query.clone().clearSelect().count('users.id as count').first();
    const items = await query
        .orderBy('users.created_at', 'desc')
        .offset((page - 1) * limit)
        .limit(limit);

    return {
        orgId: scopedOrgId,
        items,
        total: Number(totalRow?.count || 0),
        page,
        limit,
    };
}

export async function getModuleMatrix(authContext, requestedOrgId, { keyword = '' } = {}) {
    const scopedOrgId = await resolveScopedOrgId(authContext, requestedOrgId);
    const query = buildAccountBaseQuery(scopedOrgId)
        .select(ACCOUNT_FIELDS)
        .whereIn('users.role', EDITABLE_MATRIX_ROLES)
        .orderBy('users.username', 'asc');

    applyKeyword(query, keyword);

    const users = await query;
    const userIds = users.map((user) => user.id);
    const defaultModules = getDefaultModules();

    const accesses = userIds.length > 0
        ? await knex('user_module_access')
            .whereIn('user_id', userIds)
            .where(function validAccess() {
                this.whereNull('expires_at').orWhere('expires_at', '>', knex.fn.now());
            })
        : [];

    const matrix = {};
    for (const user of users) {
        const grantedModules = accesses.filter((item) => item.user_id === user.id).map((item) => item.module_id);
        const roleDefaultModules = getRoleDefaultModules(user.role);
        const effectiveDefaultModules = roleDefaultModules === 'all' ? defaultModules : roleDefaultModules;
        matrix[user.id] = [...new Set([...effectiveDefaultModules, ...grantedModules])];
    }

    return {
        orgId: scopedOrgId,
        users,
        modules: ALL_MODULES,
        defaultModules,
        matrix,
    };
}

export async function saveModuleMatrix(authContext, requestedOrgId, updates = []) {
    const scopedOrgId = await resolveScopedOrgId(authContext, requestedOrgId);
    if (!Array.isArray(updates) || updates.length === 0) {
        throw badRequest('updates 必须是非空数组');
    }

    const validModuleIds = new Set(listAllModuleIds());
    const defaultModules = getDefaultModules();
    const userIds = updates.map((item) => item.userId);
    const users = await buildAccountBaseQuery(scopedOrgId)
        .select(ACCOUNT_FIELDS)
        .whereIn('users.id', userIds)
        .whereIn('users.role', EDITABLE_MATRIX_ROLES);

    if (users.length !== userIds.length) {
        throw badRequest('存在不属于当前机构或不可编辑的用户');
    }

    for (const update of updates) {
        for (const moduleId of (update.modules || [])) {
            if (!validModuleIds.has(moduleId)) {
                throw badRequest(`无效的模块ID: ${moduleId}`);
            }
        }
    }

    await knex.transaction(async (trx) => {
        for (const update of updates) {
            await trx('user_module_access')
                .where('user_id', update.userId)
                .whereNotIn('module_id', defaultModules)
                .delete();

            const modulesToGrant = (update.modules || []).filter((moduleId) => !defaultModules.includes(moduleId));
            for (const moduleId of modulesToGrant) {
                await trx('user_module_access')
                    .insert({
                        user_id: update.userId,
                        org_id: scopedOrgId,
                        module_id: moduleId,
                        granted_by: authContext.userId,
                        expires_at: null,
                    })
                    .onConflict(['user_id', 'module_id'])
                    .merge();
            }
        }
    });

    return getModuleMatrix(authContext, scopedOrgId);
}

export async function getOrgRaceMatrix(authContext, requestedOrgId) {
    const scopedOrgId = await resolveScopedOrgId(authContext, requestedOrgId);
    const org = await fetchOrg(scopedOrgId);
    const grantRows = await knex('org_race_permissions')
        .where({ org_id: scopedOrgId })
        .select('race_id', 'access_level');
    const grantMap = new Map(grantRows.map((row) => [Number(row.race_id), row.access_level]));

    const races = await knex('races')
        .leftJoin('organizations', 'races.org_id', 'organizations.id')
        .select(
            'races.id',
            'races.name',
            'races.org_id',
            'races.date',
            'races.location',
            'organizations.name as org_name',
        )
        .orderBy('races.created_at', 'desc');

    return {
        org,
        canEdit: authContext.role === 'super_admin',
        races: races.map((race) => {
            const isOwned = String(race.org_id) === String(scopedOrgId);
            const explicitAccessLevel = grantMap.get(Number(race.id)) || null;
            const effectiveAccessLevel = isOwned ? 'editor' : explicitAccessLevel;
            return {
                id: race.id,
                name: race.name,
                orgId: race.org_id,
                orgName: race.org_name,
                date: race.date,
                location: race.location,
                ownership: isOwned ? 'owned' : 'external',
                explicitAccessLevel,
                effectiveAccessLevel,
                editable: !isOwned && authContext.role === 'super_admin',
                state: isOwned ? 'owned_editor' : (effectiveAccessLevel ? `granted_${effectiveAccessLevel}` : 'none'),
            };
        }),
    };
}

export async function saveOrgRaceMatrix(authContext, requestedOrgId, permissions = []) {
    if (authContext.role !== 'super_admin') {
        throw forbidden('仅超级管理员可配置机构赛事范围');
    }

    const scopedOrgId = await resolveScopedOrgId(authContext, requestedOrgId);
    if (!Array.isArray(permissions)) {
        throw badRequest('permissions 必须是数组');
    }

    const normalized = [];
    for (const item of permissions) {
        const raceId = Number(item.raceId);
        if (!Number.isFinite(raceId) || raceId <= 0) {
            throw badRequest(`无效赛事 ID: ${item.raceId}`);
        }
        const accessLevel = normalizeAccessLevel(item.accessLevel);
        if (!accessLevel) continue;
        normalized.push({ raceId, accessLevel });
    }

    const raceIds = normalized.map((item) => item.raceId);
    const races = raceIds.length > 0
        ? await knex('races').whereIn('id', raceIds).select('id', 'org_id')
        : [];
    const raceMap = new Map(races.map((row) => [Number(row.id), row]));

    for (const { raceId } of normalized) {
        const race = raceMap.get(raceId);
        if (!race) {
            throw badRequest(`赛事 ${raceId} 不存在`);
        }
        if (String(race.org_id) === String(scopedOrgId)) {
            throw badRequest(`赛事 ${raceId} 为本机构自有赛事，不能配置外部授权`);
        }
    }

    await knex.transaction(async (trx) => {
        await trx('org_race_permissions').where({ org_id: scopedOrgId }).del();
        if (normalized.length > 0) {
            await trx('org_race_permissions').insert(
                normalized.map((item) => ({
                    org_id: scopedOrgId,
                    race_id: item.raceId,
                    access_level: item.accessLevel,
                    granted_by: authContext.userId,
                    updated_at: knex.fn.now(),
                })),
            );
        }
    });

    return getOrgRaceMatrix(authContext, scopedOrgId);
}

export async function getUserRaceMatrix(authContext, requestedOrgId, { page = 1, limit = 20, keyword = '' } = {}) {
    const scopedOrgId = await resolveScopedOrgId(authContext, requestedOrgId);
    const visibleRaces = await listVisibleRacesForOrg(scopedOrgId);
    const query = buildAccountBaseQuery(scopedOrgId)
        .select(ACCOUNT_FIELDS)
        .whereIn('users.role', EDITABLE_MATRIX_ROLES);

    applyKeyword(query, keyword);

    const totalRow = await query.clone().clearSelect().count('users.id as count').first();
    const users = await query
        .orderBy('users.created_at', 'desc')
        .offset((page - 1) * limit)
        .limit(limit);

    const userIds = users.map((user) => user.id);
    const raceIds = visibleRaces.map((race) => Number(race.id));
    const explicitRows = userIds.length > 0 && raceIds.length > 0
        ? await knex('user_race_permissions')
            .where('org_id', scopedOrgId)
            .whereIn('user_id', userIds)
            .whereIn('race_id', raceIds)
            .select('user_id', 'race_id', 'access_level')
        : [];

    const explicitMap = new Map();
    for (const row of explicitRows) {
        explicitMap.set(`${row.user_id}:${row.race_id}`, normalizeAccessLevel(row.access_level));
    }

    const rows = users.map((user) => {
        const permissions = {};
        for (const race of visibleRaces) {
            const inheritedAccessLevel = capAccessLevelByRole(user.role, race.orgAccessLevel);
            const explicitAccessLevel = capAccessLevelByRole(
                user.role,
                explicitMap.get(`${user.id}:${race.id}`) || null,
            );
            const effectiveAccessLevel = explicitAccessLevel
                ? pickStricterAccessLevel(explicitAccessLevel, inheritedAccessLevel)
                : inheritedAccessLevel;

            permissions[race.id] = {
                raceId: race.id,
                inheritedAccessLevel,
                explicitAccessLevel,
                effectiveAccessLevel,
                source: explicitAccessLevel ? 'user_assignment' : race.source,
                editable: true,
                state: getCellState(inheritedAccessLevel, explicitAccessLevel, effectiveAccessLevel),
            };
        }

        return {
            ...user,
            permissions,
        };
    });

    return {
        orgId: scopedOrgId,
        races: visibleRaces,
        items: rows,
        total: Number(totalRow?.count || 0),
        page,
        limit,
    };
}

export async function saveUserRaceMatrix(authContext, requestedOrgId, updates = []) {
    const scopedOrgId = await resolveScopedOrgId(authContext, requestedOrgId);
    if (!Array.isArray(updates) || updates.length === 0) {
        throw badRequest('updates 必须是非空数组');
    }

    const visibleRaces = await listVisibleRacesForOrg(scopedOrgId);
    const visibleRaceMap = new Map(visibleRaces.map((race) => [Number(race.id), race]));
    const editableUsers = await buildAccountBaseQuery(scopedOrgId)
        .select('users.id', 'users.role')
        .whereIn('users.id', updates.map((item) => item.userId))
        .whereIn('users.role', EDITABLE_MATRIX_ROLES);

    if (editableUsers.length !== updates.length) {
        throw badRequest('存在不属于当前机构或不可编辑的用户');
    }

    const userRoleMap = new Map(editableUsers.map((user) => [user.id, user.role]));
    const visibleRaceIds = [...visibleRaceMap.keys()];

    await knex.transaction(async (trx) => {
        for (const update of updates) {
            const role = userRoleMap.get(update.userId);
            const explicitPermissions = Array.isArray(update.explicitPermissions) ? update.explicitPermissions : [];
            const desired = new Map();

            for (const item of explicitPermissions) {
                const raceId = Number(item.raceId);
                if (!Number.isFinite(raceId) || raceId <= 0 || !visibleRaceMap.has(raceId)) {
                    throw badRequest(`赛事 ${item.raceId} 不在机构可授权范围内`);
                }
                const accessLevel = normalizeAccessLevel(item.accessLevel);
                if (!accessLevel) {
                    throw badRequest(`赛事 ${item.raceId} 的 accessLevel 无效`);
                }

                const race = visibleRaceMap.get(raceId);
                if (role === 'user' && accessLevel === 'editor') {
                    throw badRequest(`用户 ${update.userId} 角色上限为 viewer，不能显式设置 editor`);
                }
                if (race.orgAccessLevel === 'viewer' && accessLevel === 'editor') {
                    throw badRequest(`赛事 ${raceId} 对当前机构仅开放只读授权，成员不可设置为 editor`);
                }
                desired.set(raceId, accessLevel);
            }

            const existing = await trx('user_race_permissions')
                .where({ user_id: update.userId, org_id: scopedOrgId })
                .whereIn('race_id', visibleRaceIds)
                .select('race_id', 'access_level');
            const existingMap = new Map(existing.map((row) => [Number(row.race_id), row.access_level]));

            const toDelete = [];
            const toUpsert = [];

            for (const raceId of existingMap.keys()) {
                if (!desired.has(raceId)) {
                    toDelete.push(raceId);
                }
            }

            for (const [raceId, accessLevel] of desired.entries()) {
                if (!existingMap.has(raceId) || existingMap.get(raceId) !== accessLevel) {
                    toUpsert.push({ raceId, accessLevel });
                }
            }

            if (toDelete.length > 0) {
                await trx('user_race_permissions')
                    .where({ user_id: update.userId, org_id: scopedOrgId })
                    .whereIn('race_id', toDelete)
                    .del();
            }

            for (const item of toUpsert) {
                await trx('user_race_permissions')
                    .insert({
                        user_id: update.userId,
                        org_id: scopedOrgId,
                        race_id: item.raceId,
                        access_level: item.accessLevel,
                        created_by: authContext.userId,
                    })
                    .onConflict(['user_id', 'race_id'])
                    .merge({
                        access_level: item.accessLevel,
                        created_by: authContext.userId,
                    });
            }
        }
    });

    return { message: `已更新 ${updates.length} 个用户的赛事显式授权` };
}

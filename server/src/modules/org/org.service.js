/**
 * Org Service — 机构管理员级别的成员与权限操作
 */
import bcrypt from 'bcryptjs';
import knex from '../../db/knex.js';
import { listVisibleRacesForOrg } from '../races/race-access.service.js';

// ── 成员管理 ─────────────────────────────────────────

export async function listOrgUsers(orgId, { page = 1, limit = 20, keyword = '' }) {
    const query = knex('users').where({ org_id: orgId });
    if (keyword) {
        query.where(function () {
            this.where('username', 'ilike', `%${keyword}%`)
                .orWhere('email', 'ilike', `%${keyword}%`);
        });
    }
    const total = await query.clone().count('* as count').first().then(r => r.count);
    const items = await query
        .select('id', 'username', 'email', 'role', 'status', 'must_change_password', 'created_at')
        .orderBy('created_at', 'desc')
        .offset((page - 1) * limit)
        .limit(limit);
    return { items, total: Number(total), page, limit };
}

export async function getOrgUser(orgId, userId) {
    const query = knex('users').where({ id: userId });
    if (orgId) query.andWhere({ org_id: orgId });
    const user = await query
        .select('id', 'username', 'email', 'role', 'status', 'must_change_password', 'created_at', 'org_id')
        .first();
    if (!user) throw Object.assign(new Error('用户不存在或不属于本机构'), { status: 404, expose: true });

    const permissions = await knex('user_race_permissions')
        .where({ user_id: userId, org_id: user.org_id })
        .leftJoin('races', 'user_race_permissions.race_id', 'races.id')
        .select('user_race_permissions.race_id', 'user_race_permissions.access_level', 'races.name as race_name');

    return { ...user, racePermissions: permissions };
}

export async function createOrgUser(orgId, operatorId, { username, email, password, role = 'race_editor' }) {
    if (!['race_editor', 'race_viewer'].includes(role)) {
        throw Object.assign(new Error('只能创建 race_editor 或 race_viewer 角色'), { status: 400, expose: true });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await knex('users')
        .insert({
            org_id: orgId,
            username,
            email,
            password_hash: passwordHash,
            role,
            status: 'active',
            must_change_password: true,
            created_by: operatorId,
        })
        .returning(['id', 'username', 'email', 'role', 'status', 'org_id', 'must_change_password']);
    return user;
}

export async function updateOrgUser(orgId, userId, fields) {
    const uQuery = knex('users').where({ id: userId });
    if (orgId) uQuery.andWhere({ org_id: orgId });
    const user = await uQuery.first();
    if (!user) throw Object.assign(new Error('用户不存在或不属于本机构'), { status: 404, expose: true });

    const allowed = ['role', 'status'];
    const data = {};
    for (const key of allowed) {
        if (fields[key] !== undefined) data[key] = fields[key];
    }

    if (data.role && !['race_editor', 'race_viewer'].includes(data.role)) {
        throw Object.assign(new Error('只能设置 race_editor 或 race_viewer 角色'), { status: 400, expose: true });
    }
    if (Object.keys(data).length === 0) {
        throw Object.assign(new Error('无有效字段'), { status: 400, expose: true });
    }

    const [row] = await knex('users')
        .where({ id: userId })
        .update({ ...data, updated_at: knex.fn.now() })
        .returning(['id', 'username', 'email', 'role', 'status']);
    return row;
}

export async function deleteOrgUser(orgId, userId, operatorContext) {
    const uQuery = knex('users').where({ id: userId });
    if (orgId) uQuery.andWhere({ org_id: orgId });
    const user = await uQuery.first('id', 'org_id', 'username', 'role');
    if (!user) throw Object.assign(new Error('用户不存在或不属于本机构'), { status: 404, expose: true });

    if (String(operatorContext?.userId) === String(userId)) {
        throw Object.assign(new Error('不允许删除当前登录账号'), { status: 400, expose: true });
    }

    if (operatorContext?.role === 'org_admin' && user.role === 'org_admin') {
        throw Object.assign(new Error('机构管理员不能删除机构管理员账号'), { status: 403, expose: true });
    }

    if (user.role === 'super_admin') {
        throw Object.assign(new Error('不能在机构成员管理中删除 super_admin'), { status: 400, expose: true });
    }

    await knex.transaction(async (trx) => {
        await trx('user_race_permissions').where({ created_by: userId }).update({ created_by: null });
        await trx('refresh_tokens').where({ user_id: userId }).del();
        await trx('user_race_permissions').where({ user_id: userId }).del();
        await trx('users').where({ id: userId }).del();
    });

    return { message: `成员 ${user.username} 已删除` };
}

// ── 赛事权限管理 ─────────────────────────────────────

export async function getUserRacePermissions(orgId, userId) {
    const uQuery = knex('users').where({ id: userId });
    if (orgId) uQuery.andWhere({ org_id: orgId });
    const user = await uQuery.first();
    if (!user) throw Object.assign(new Error('用户不存在或不属于本机构'), { status: 404, expose: true });

    const scopedOrgId = orgId || user.org_id || null;
    if (!scopedOrgId) {
        throw Object.assign(new Error('目标用户未绑定机构，无法配置赛事权限'), { status: 400, expose: true });
    }

    const allRaces = await listVisibleRacesForOrg(scopedOrgId);
    const raceIds = allRaces.map((race) => race.id);

    const permissionsQuery = knex('user_race_permissions')
        .where({ user_id: userId, org_id: scopedOrgId })
        .leftJoin('races', 'user_race_permissions.race_id', 'races.id')
        .select('user_race_permissions.race_id', 'user_race_permissions.access_level', 'races.name as race_name');
    if (raceIds.length > 0) {
        permissionsQuery.whereIn('user_race_permissions.race_id', raceIds);
    } else {
        permissionsQuery.whereRaw('1 = 0');
    }
    const permissions = await permissionsQuery;

    return { permissions, allRaces };
}

export async function setUserRacePermissions(orgId, userId, operatorId, permissionsList) {
    const uQuery = knex('users').where({ id: userId });
    if (orgId) uQuery.andWhere({ org_id: orgId });
    const user = await uQuery.first();
    if (!user) throw Object.assign(new Error('用户不存在或不属于本机构'), { status: 404, expose: true });

    const scopedOrgId = orgId || user.org_id || null;
    if (!scopedOrgId) {
        throw Object.assign(new Error('目标用户未绑定机构，无法配置赛事权限'), { status: 400, expose: true });
    }

    for (const item of permissionsList) {
        if (!['editor', 'viewer'].includes(item.accessLevel || 'editor')) {
            throw Object.assign(new Error(`赛事 ${item.raceId} 的 accessLevel 无效`), { status: 400, expose: true });
        }
    }

    const visibleRaces = await listVisibleRacesForOrg(scopedOrgId);
    const visibleRaceMap = new Map(visibleRaces.map((race) => [Number(race.id), race]));

    const desired = new Map();
    for (const item of permissionsList) {
        const raceId = Number(item.raceId);
        if (!Number.isFinite(raceId) || raceId <= 0) {
            throw Object.assign(new Error(`赛事 ${item.raceId} 无效`), { status: 400, expose: true });
        }
        if (!visibleRaceMap.has(raceId)) {
            throw Object.assign(new Error(`赛事 ${raceId} 不在机构可授权范围内`), { status: 400, expose: true });
        }
        const raceInfo = visibleRaceMap.get(raceId);
        if (raceInfo.orgAccessLevel === 'viewer' && (item.accessLevel || 'editor') !== 'viewer') {
            throw Object.assign(new Error(`赛事 ${raceId} 对当前机构仅开放只读授权，成员不可设置为 editor`), { status: 400, expose: true });
        }
        desired.set(raceId, item.accessLevel || 'editor');
    }

    const existing = await knex('user_race_permissions')
        .where({ user_id: userId, org_id: scopedOrgId })
        .select('race_id', 'access_level');
    const existingMap = new Map(existing.map((row) => [Number(row.race_id), row.access_level]));

    const toInsert = [];
    const toUpdate = [];
    const toDelete = [];

    for (const [raceId, accessLevel] of desired.entries()) {
        if (!existingMap.has(raceId)) {
            toInsert.push({ raceId, accessLevel });
            continue;
        }
        if (existingMap.get(raceId) !== accessLevel) {
            toUpdate.push({ raceId, accessLevel });
        }
    }

    for (const raceId of existingMap.keys()) {
        if (!desired.has(raceId)) {
            toDelete.push(raceId);
        }
    }

    await knex.transaction(async (trx) => {
        if (toDelete.length > 0) {
            await trx('user_race_permissions')
                .where({ user_id: userId, org_id: scopedOrgId })
                .whereIn('race_id', toDelete)
                .del();
        }

        for (const row of toUpdate) {
            await trx('user_race_permissions')
                .where({ user_id: userId, org_id: scopedOrgId, race_id: row.raceId })
                .update({
                    access_level: row.accessLevel,
                    created_by: operatorId,
                });
        }

        if (toInsert.length > 0) {
            await trx('user_race_permissions').insert(
                toInsert.map((row) => ({
                    user_id: userId,
                    org_id: scopedOrgId,
                    race_id: row.raceId,
                    access_level: row.accessLevel,
                    created_by: operatorId,
                })),
            );
        }
    });

    return { message: `已为用户 ${user.username} 设置 ${permissionsList.length} 个赛事权限` };
}

// ── 成员密码重置 ─────────────────────────────────────

export async function resetOrgUserPassword(orgId, userId) {
    const uQuery = knex('users').where({ id: userId });
    if (orgId) uQuery.andWhere({ org_id: orgId });
    const user = await uQuery.first();
    if (!user) throw Object.assign(new Error('用户不存在或不属于本机构'), { status: 404, expose: true });

    const tempPassword = 'Abc123456';
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await knex('users')
        .where({ id: userId })
        .update({
            password_hash: passwordHash,
            must_change_password: true,
            updated_at: knex.fn.now(),
        });
    return { message: `密码已重置为 ${tempPassword}，用户下次登录将被要求修改密码` };
}

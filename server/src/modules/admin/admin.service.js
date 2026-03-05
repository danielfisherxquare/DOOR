/**
 * Admin Service — Super Admin 级别的平台管理操作
 */
import bcrypt from 'bcryptjs';
import knex from '../../db/knex.js';

// ── 机构管理 ─────────────────────────────────────────

export async function listOrgs({ page = 1, limit = 20, keyword = '' }) {
    const query = knex('organizations');
    if (keyword) {
        query.where('name', 'ilike', `%${keyword}%`);
    }
    const total = await query.clone().count('* as count').first().then(r => r.count);
    const items = await query
        .orderBy('created_at', 'desc')
        .offset((page - 1) * limit)
        .limit(limit);
    for (const org of items) {
        org.userCount = 0;
        org.raceCount = 0;
    }
    const orgIds = items.map((org) => org.id);
    if (orgIds.length > 0) {
        const [userCounts, raceCounts] = await Promise.all([
            knex('users')
                .whereIn('org_id', orgIds)
                .groupBy('org_id')
                .select('org_id')
                .count('* as count'),
            knex('races')
                .whereIn('org_id', orgIds)
                .groupBy('org_id')
                .select('org_id')
                .count('* as count'),
        ]);
        const userCountMap = new Map(userCounts.map((row) => [row.org_id, Number(row.count)]));
        const raceCountMap = new Map(raceCounts.map((row) => [row.org_id, Number(row.count)]));
        for (const org of items) {
            org.userCount = userCountMap.get(org.id) || 0;
            org.raceCount = raceCountMap.get(org.id) || 0;
        }
    }

    return { items, total: Number(total), page, limit };
}

export async function createOrg({ name }) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const [org] = await knex('organizations')
        .insert({ name, slug })
        .returning('*');
    return org;
}

export async function getOrgDetail(orgId) {
    const org = await knex('organizations').where({ id: orgId }).first();
    if (!org) throw Object.assign(new Error('机构不存在'), { status: 404, expose: true });

    const users = await knex('users')
        .where({ org_id: orgId })
        .select('id', 'username', 'email', 'role', 'status', 'created_at')
        .orderBy('created_at', 'desc');
    const races = await knex('races')
        .where({ org_id: orgId })
        .select('id', 'name', 'date', 'location', 'created_at')
        .orderBy('created_at', 'desc');

    return { ...org, users, races };
}

export async function updateOrg(orgId, fields) {
    const allowed = ['name'];
    const data = {};
    for (const key of allowed) {
        if (fields[key] !== undefined) data[key] = fields[key];
    }
    if (Object.keys(data).length === 0) {
        throw Object.assign(new Error('无有效字段'), { status: 400, expose: true });
    }
    const [row] = await knex('organizations')
        .where({ id: orgId })
        .update({ ...data, updated_at: knex.fn.now() })
        .returning('*');
    if (!row) throw Object.assign(new Error('机构不存在'), { status: 404, expose: true });
    return row;
}

export async function deleteOrg(orgId) {
    const org = await knex('organizations').where({ id: orgId }).first('id', 'name');
    if (!org) throw Object.assign(new Error('机构不存在'), { status: 404, expose: true });

    const [{ count: userCountRaw }, { count: raceCountRaw }] = await Promise.all([
        knex('users').where({ org_id: orgId }).count('* as count').first(),
        knex('races').where({ org_id: orgId }).count('* as count').first(),
    ]);

    const userCount = Number(userCountRaw || 0);
    const raceCount = Number(raceCountRaw || 0);
    if (userCount > 0 || raceCount > 0) {
        throw Object.assign(
            new Error(`机构下仍有数据（用户 ${userCount}、赛事 ${raceCount}），请先清理后再删除`),
            { status: 400, expose: true },
        );
    }

    await knex.transaction(async (trx) => {
        await trx('user_race_permissions').where({ org_id: orgId }).del();
        await trx('org_race_permissions').where({ org_id: orgId }).del();
        await trx('organizations').where({ id: orgId }).del();
    });

    return { message: `机构 ${org.name} 已删除` };
}

// ── 全平台用户管理 ────────────────────────────────────

export async function listAllUsers({ page = 1, limit = 20, keyword = '', role = '' }) {
    const query = knex('users')
        .leftJoin('organizations', 'users.org_id', 'organizations.id')
        .select(
            'users.id', 'users.username', 'users.email', 'users.role',
            'users.status', 'users.org_id', 'users.created_at',
            'organizations.name as org_name',
        );
    if (keyword) {
        query.where(function () {
            this.where('users.username', 'ilike', `%${keyword}%`)
                .orWhere('users.email', 'ilike', `%${keyword}%`);
        });
    }
    if (role) {
        query.where('users.role', role);
    }
    const countQuery = query.clone();
    const total = await countQuery.clearSelect().count('users.id as count').first().then(r => r.count);
    const items = await query
        .orderBy('users.created_at', 'desc')
        .offset((page - 1) * limit)
        .limit(limit);
    return { items, total: Number(total), page, limit };
}

export async function updateUserByAdmin(userId, fields) {
    const user = await knex('users').where({ id: userId }).first();
    if (!user) throw Object.assign(new Error('用户不存在'), { status: 404, expose: true });

    const hasRole = fields.role !== undefined;
    const hasStatus = fields.status !== undefined;
    const hasOrgId = fields.orgId !== undefined;
    if (!hasRole && !hasStatus && !hasOrgId) {
        throw Object.assign(new Error('无有效字段'), { status: 400, expose: true });
    }

    const nextRole = hasRole ? fields.role : user.role;
    let nextOrgId = hasOrgId ? fields.orgId : user.org_id;

    if (nextRole === 'super_admin') {
        nextOrgId = null;
    } else if (!nextOrgId) {
        throw Object.assign(new Error('非 super_admin 用户必须绑定机构（请提供 orgId）'), { status: 400, expose: true });
    }

    if (nextOrgId) {
        const org = await knex('organizations').where({ id: nextOrgId }).first();
        if (!org) {
            throw Object.assign(new Error('机构不存在'), { status: 404, expose: true });
        }
    }

    const data = {};
    if (hasRole) data.role = fields.role;
    if (hasStatus) data.status = fields.status;
    if (hasOrgId || nextRole === 'super_admin') data.org_id = nextOrgId;

    if (hasOrgId && user.org_id !== nextOrgId) {
        await knex('user_race_permissions').where({ user_id: userId }).del();
    }

    const [row] = await knex('users')
        .where({ id: userId })
        .update({ ...data, updated_at: knex.fn.now() })
        .returning(['id', 'username', 'email', 'role', 'status', 'org_id']);
    return row;
}

export async function deleteUserByAdmin(userId, operatorUserId) {
    const user = await knex('users').where({ id: userId }).first('id', 'username', 'role');
    if (!user) throw Object.assign(new Error('用户不存在'), { status: 404, expose: true });

    if (String(operatorUserId) === String(userId)) {
        throw Object.assign(new Error('不允许删除当前登录账号'), { status: 400, expose: true });
    }

    if (user.role === 'super_admin') {
        const [{ count: superAdminCountRaw }] = await Promise.all([
            knex('users').where({ role: 'super_admin' }).count('* as count').first(),
        ]);
        const superAdminCount = Number(superAdminCountRaw || 0);
        if (superAdminCount <= 1) {
            throw Object.assign(new Error('系统至少需要保留一个 super_admin 账号'), { status: 400, expose: true });
        }
    }

    await knex.transaction(async (trx) => {
        await trx('user_race_permissions').where({ created_by: userId }).update({ created_by: null });
        await trx('refresh_tokens').where({ user_id: userId }).del();
        await trx('user_race_permissions').where({ user_id: userId }).del();
        await trx('users').where({ id: userId }).del();
    });

    return { message: `用户 ${user.username} 已删除` };
}

export async function resetUserPassword(userId) {
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

export async function createOrgAdmin(orgId, { username, email, password }) {
    const org = await knex('organizations').where({ id: orgId }).first();
    if (!org) throw Object.assign(new Error('机构不存在'), { status: 404, expose: true });

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await knex('users')
        .insert({
            org_id: orgId,
            username,
            email,
            password_hash: passwordHash,
            role: 'org_admin',
            status: 'active',
            must_change_password: true,
        })
        .returning(['id', 'username', 'email', 'role', 'status', 'org_id']);
    return user;
}

// ── Super Admin: 机构赛事授权 ─────────────────────────

export async function getOrgRacePermissions(orgId) {
    const org = await knex('organizations').where({ id: orgId }).first();
    if (!org) throw Object.assign(new Error('机构不存在'), { status: 404, expose: true });

    const [permissions, allRaces] = await Promise.all([
        knex('org_race_permissions as grp')
            .innerJoin('races', 'grp.race_id', 'races.id')
            .leftJoin('organizations as race_org', 'races.org_id', 'race_org.id')
            .where('grp.org_id', orgId)
            .select(
                'grp.race_id',
                'grp.access_level',
                'races.name as race_name',
                'races.org_id as race_org_id',
                'race_org.name as race_org_name',
            )
            .orderBy('races.created_at', 'desc'),
        knex('races')
            .leftJoin('organizations', 'races.org_id', 'organizations.id')
            .select(
                'races.id',
                'races.name',
                'races.org_id',
                'races.date',
                'races.location',
                'organizations.name as org_name',
            )
            .orderBy('races.created_at', 'desc'),
    ]);

    return { org, permissions, allRaces };
}

export async function setOrgRacePermissions(orgId, operatorId, permissionsList) {
    const org = await knex('organizations').where({ id: orgId }).first();
    if (!org) throw Object.assign(new Error('机构不存在'), { status: 404, expose: true });

    const normalized = new Map();
    for (const item of permissionsList) {
        const raceId = Number(item.raceId);
        if (!Number.isFinite(raceId) || raceId <= 0) {
            throw Object.assign(new Error(`无效赛事 ID: ${item.raceId}`), { status: 400, expose: true });
        }
        const accessLevel = item.accessLevel || 'viewer';
        if (!['editor', 'viewer'].includes(accessLevel)) {
            throw Object.assign(new Error(`赛事 ${raceId} 的 accessLevel 无效`), { status: 400, expose: true });
        }
        normalized.set(raceId, accessLevel);
    }

    const raceIds = [...normalized.keys()];
    if (raceIds.length > 0) {
        const races = await knex('races').whereIn('id', raceIds).select('id', 'org_id');
        const raceById = new Map(races.map((row) => [Number(row.id), row]));
        const validRaceIdSet = new Set(races.map((row) => Number(row.id)));
        const missing = raceIds.filter((raceId) => !validRaceIdSet.has(raceId));
        if (missing.length > 0) {
            throw Object.assign(new Error(`赛事 ${missing.join(',')} 不存在`), { status: 400, expose: true });
        }
        for (const raceId of raceIds) {
            const race = raceById.get(raceId);
            if (race && race.org_id === orgId) {
                normalized.delete(raceId);
            }
        }
    }

    await knex.transaction(async (trx) => {
        await trx('org_race_permissions').where({ org_id: orgId }).del();
        const grantedRaceIds = [...normalized.keys()];
        if (grantedRaceIds.length > 0) {
            await trx('org_race_permissions').insert(
                grantedRaceIds.map((raceId) => ({
                    org_id: orgId,
                    race_id: raceId,
                    access_level: normalized.get(raceId),
                    granted_by: operatorId || null,
                    updated_at: knex.fn.now(),
                })),
            );
        }
    });

    return { message: `已为机构 ${org.name} 配置 ${normalized.size} 个赛事授权` };
}

// ── 统计概览 ─────────────────────────────────────────

export async function getDashboardStats() {
    const [orgCount] = await knex('organizations').count('* as count');
    const [userCount] = await knex('users').count('* as count');
    const [raceCount] = await knex('races').count('* as count');
    const [activeUserCount] = await knex('users').where({ status: 'active' }).count('* as count');
    return {
        orgCount: Number(orgCount.count),
        userCount: Number(userCount.count),
        raceCount: Number(raceCount.count),
        activeUserCount: Number(activeUserCount.count),
    };
}

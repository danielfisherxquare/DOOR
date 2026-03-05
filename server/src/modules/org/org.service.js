/**
 * Org Service — 机构管理员级别的成员与权限操作
 */
import bcrypt from 'bcryptjs';
import knex from '../../db/knex.js';

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
        .where({ user_id: userId })
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

    const permissions = await knex('user_race_permissions')
        .where({ user_id: userId, org_id: scopedOrgId })
        .leftJoin('races', 'user_race_permissions.race_id', 'races.id')
        .select('user_race_permissions.race_id', 'user_race_permissions.access_level', 'races.name as race_name');

    const allRaces = await knex('races')
        .where({ org_id: scopedOrgId })
        .select('id', 'name', 'date', 'location')
        .orderBy('created_at', 'desc');

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

    const raceIds = [...new Set(permissionsList.map(p => p.raceId))];
    const raceOrgById = new Map();
    if (raceIds.length > 0) {
        const races = await knex('races')
            .whereIn('id', raceIds)
            .select('id', 'org_id');

        for (const race of races) raceOrgById.set(race.id, race.org_id);

        const missing = raceIds.filter(id => !raceOrgById.has(id));
        if (missing.length > 0) {
            throw Object.assign(new Error(`赛事 ${missing.join(',')} 不存在`), { status: 400, expose: true });
        }

        const invalid = raceIds.filter(id => raceOrgById.get(id) !== scopedOrgId);
        if (invalid.length > 0) {
            throw Object.assign(new Error(`赛事 ${invalid.join(',')} 不属于本机构`), { status: 400, expose: true });
        }
    }

    await knex.transaction(async trx => {
        await trx('user_race_permissions').where({ user_id: userId }).del();
        if (permissionsList.length > 0) {
            const rows = permissionsList.map(p => ({
                user_id: userId,
                org_id: raceOrgById.get(p.raceId) || scopedOrgId,
                race_id: p.raceId,
                access_level: p.accessLevel || 'editor',
                created_by: operatorId,
            }));
            await trx('user_race_permissions').insert(rows);
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

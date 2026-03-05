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
        const [userCount] = await knex('users').where({ org_id: org.id }).count('* as count');
        const [raceCount] = await knex('races').where({ org_id: org.id }).count('* as count');
        org.userCount = Number(userCount.count);
        org.raceCount = Number(raceCount.count);
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

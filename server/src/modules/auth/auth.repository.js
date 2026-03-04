/**
 * Auth Repository — 组织与用户的数据访问层
 */
import knex from '../../db/knex.js';

// ── Organization ─────────────────────────────────────

export async function createOrg(name, slug) {
    const [row] = await knex('organizations')
        .insert({ name, slug })
        .returning('*');
    return row;
}

export async function findOrgById(id) {
    return knex('organizations').where({ id }).first();
}

// ── User ─────────────────────────────────────────────

export async function createUser({ orgId, username, email, passwordHash, role = 'org_admin', createdBy = null }) {
    const [row] = await knex('users')
        .insert({
            org_id: orgId,
            username,
            email,
            password_hash: passwordHash,
            role,
            status: 'active',
            must_change_password: false,
            created_by: createdBy,
        })
        .returning('*');
    return row;
}

export async function findUserByLogin(login) {
    return knex('users')
        .where('username', login)
        .orWhere('email', login)
        // 多租户下 username/email 可能不全局唯一；另外 org_id=null 的平台用户也可能重复。
        // 这里通过排序保证选择结果稳定，并优先匹配 super_admin（避免命中错误记录导致“无法登录”）。
        .orderByRaw(`CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END`)
        .orderBy('updated_at', 'desc')
        .orderBy('created_at', 'desc')
        .first();
}

export async function findUserById(id) {
    return knex('users').where({ id }).first();
}

export async function updateUser(id, fields) {
    const [row] = await knex('users')
        .where({ id })
        .update({ ...fields, updated_at: knex.fn.now() })
        .returning('*');
    return row;
}

// ── 登录安全 ─────────────────────────────────────────

export async function incrementFailedAttempts(userId) {
    await knex('users')
        .where({ id: userId })
        .increment('failed_login_attempts', 1);
}

export async function lockUser(userId, minutes) {
    const lockedUntil = new Date(Date.now() + minutes * 60 * 1000);
    await knex('users')
        .where({ id: userId })
        .update({ locked_until: lockedUntil });
}

export async function resetFailedAttempts(userId) {
    await knex('users')
        .where({ id: userId })
        .update({ failed_login_attempts: 0, locked_until: null });
}

// ── Race Permissions ─────────────────────────────────

export async function findRacePermissions(userId) {
    return knex('user_race_permissions')
        .where({ user_id: userId })
        .select('race_id', 'access_level');
}

export async function setRacePermission(userId, orgId, raceId, accessLevel, grantedBy) {
    const data = {
        user_id: userId,
        org_id: orgId,
        race_id: raceId,
        access_level: accessLevel,
        created_by: grantedBy,
    };
    await knex('user_race_permissions')
        .insert(data)
        .onConflict(['user_id', 'race_id'])
        .merge({
            access_level: accessLevel,
            created_by: grantedBy,
        });
}

export async function removeRacePermission(userId, raceId) {
    await knex('user_race_permissions')
        .where({ user_id: userId, race_id: raceId })
        .del();
}

// ── Refresh Token ────────────────────────────────────

export async function createRefreshToken(userId, tokenHash, expiresAt) {
    const [row] = await knex('refresh_tokens')
        .insert({
            user_id: userId,
            token_hash: tokenHash,
            expires_at: expiresAt,
        })
        .returning('*');
    return row;
}

export async function findRefreshToken(tokenHash) {
    return knex('refresh_tokens')
        .where({ token_hash: tokenHash })
        .where('expires_at', '>', new Date())
        .first();
}

export async function deleteRefreshToken(tokenHash) {
    return knex('refresh_tokens')
        .where({ token_hash: tokenHash })
        .delete();
}

export async function cleanExpiredTokens() {
    return knex('refresh_tokens')
        .where('expires_at', '<=', new Date())
        .delete();
}


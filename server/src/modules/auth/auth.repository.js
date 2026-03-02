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

export async function createUser({ orgId, username, email, passwordHash, role = 'admin' }) {
    const [row] = await knex('users')
        .insert({
            org_id: orgId,
            username,
            email,
            password_hash: passwordHash,
            role,
        })
        .returning('*');
    return row;
}

export async function findUserByLogin(login) {
    return knex('users')
        .where('username', login)
        .orWhere('email', login)
        .first();
}

export async function findUserById(id) {
    return knex('users').where({ id }).first();
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

import bcrypt from 'bcryptjs';
import knex from '../db/knex.js';
import { env } from '../config/env.js';

export async function ensureSuperAdmin() {
    const hasUsersRow = await knex('users').count('* as count').first();
    const userCount = Number(hasUsersRow?.count || 0);

    const existingSuperAdmin = await knex('users')
        .where({ role: 'super_admin' })
        .where(function() {
            this.where('username', env.SUPER_ADMIN_USERNAME)
                .orWhere('email', env.SUPER_ADMIN_EMAIL);
        })
        .first();

    if (existingSuperAdmin) {
        return { created: false, reason: 'exists', userId: existingSuperAdmin.id };
    }

    if (userCount > 0) {
        return { created: false, reason: 'non_empty_users_table' };
    }

    const passwordHash = await bcrypt.hash(env.SUPER_ADMIN_PASSWORD, 10);
    const [createdUser] = await knex('users')
        .insert({
            org_id: null,
            username: env.SUPER_ADMIN_USERNAME,
            email: env.SUPER_ADMIN_EMAIL,
            password_hash: passwordHash,
            role: 'super_admin',
            status: 'active',
            must_change_password: false,
        })
        .returning(['id', 'username', 'email']);

    return {
        created: true,
        reason: 'seeded_empty_users_table',
        userId: createdUser.id,
        username: createdUser.username,
        email: createdUser.email,
    };
}

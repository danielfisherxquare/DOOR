#!/usr/bin/env node
/**
 * Seed Super Admin — 创建平台超级管理员
 *
 * 用法:
 *   node --env-file=.env scripts/seed-super-admin.js
 *
 * 环境变量:
 *   SUPER_ADMIN_USERNAME  (默认: superadmin)
 *   SUPER_ADMIN_EMAIL     (默认: admin@platform.local)
 *   SUPER_ADMIN_PASSWORD  (必须提供)
 */
import bcrypt from 'bcryptjs';
import knex from '../src/db/knex.js';

const username = process.env.SUPER_ADMIN_USERNAME || 'superadmin';
const email = process.env.SUPER_ADMIN_EMAIL || 'admin@platform.local';
const password = process.env.SUPER_ADMIN_PASSWORD || '123456';

async function seed() {
    // 检查是否已存在
    const existing = await knex('users')
        .where({ username, role: 'super_admin' })
        .first();

    if (existing) {
        console.log(`⚠️  超级管理员 "${username}" 已存在 (id: ${existing.id})，跳过创建`);
        process.exit(0);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [user] = await knex('users')
        .insert({
            org_id: null,
            username,
            email,
            password_hash: passwordHash,
            role: 'super_admin',
            status: 'active',
            must_change_password: false,
        })
        .returning(['id', 'username', 'email', 'role']);

    console.log(`✅ 超级管理员创建成功:`);
    console.log(`   ID:       ${user.id}`);
    console.log(`   用户名:   ${user.username}`);
    console.log(`   邮箱:     ${user.email}`);
    console.log(`   角色:     ${user.role}`);
}

try {
    await seed();
} catch (err) {
    console.error('❌ 创建失败:', err.message);
    process.exit(1);
} finally {
    await knex.destroy();
}

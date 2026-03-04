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
const password = process.env.SUPER_ADMIN_PASSWORD;

if (!password) {
    console.error('❌ 缺少环境变量 SUPER_ADMIN_PASSWORD');
    console.error('   用法: node --env-file=.env scripts/seed-super-admin.js');
    process.exit(1);
}

async function seed() {
    const passwordHash = await bcrypt.hash(password, 10);

    // 平台超管: org_id 为 null。注意 PostgreSQL unique 约束对 NULL 不生效，
    // 这里显式查找并做幂等更新，避免重复 seed 导致登录命中“错误”的那条记录。
    const candidates = await knex('users')
        .whereNull('org_id')
        .andWhere((qb) => qb.where({ username }).orWhere({ email }))
        .select(['id', 'username', 'email', 'role']);

    if (candidates.length > 1) {
        console.error(`❌ 检测到多个平台用户(org_id=null)与 "${username}" / "${email}" 冲突，无法安全 seed:`);
        for (const u of candidates) {
            console.error(`   - id=${u.id} username=${u.username} email=${u.email} role=${u.role}`);
        }
        console.error('   请先在数据库中删除/合并重复记录后重试。');
        process.exit(1);
    }

    const existing = candidates[0];

    const [user] = existing
        ? await knex('users')
            .where({ id: existing.id })
            .update({
                username,
                email,
                password_hash: passwordHash,
                role: 'super_admin',
                status: 'active',
                must_change_password: false,
                updated_at: knex.fn.now(),
            })
            .returning(['id', 'username', 'email', 'role'])
        : await knex('users')
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

    console.log(existing ? `✅ 超级管理员已更新:` : `✅ 超级管理员创建成功:`);
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

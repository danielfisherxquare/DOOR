/**
 * 创建 sys_role 角色表并迁移用户角色数据
 *
 * 变更清单:
 *   1. 创建 sys_role 表（角色定义）
 *   2. 写入 4 个系统角色
 *   3. 创建 sys_user_role 关联表
 *   4. 将 users.role 数据迁移到 sys_user_role
 *   5. users 表新增 data_scope 字段（默认 5）
 */

export async function up(knex) {
    // ── 1. 创建 sys_role 表 ──────────────────────────────────
    await knex.schema.createTable('sys_role', (t) => {
        t.bigIncrements('id').primary();
        t.string('role_key', 50).unique().notNullable();
        t.string('role_name', 100).notNullable();
        t.integer('data_scope').defaultTo(5);
        t.string('status', 1).defaultTo('0');
        t.string('remark', 500).nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });

    // ── 2. 写入 4 个系统角色 ─────────────────────────────────
    await knex('sys_role').insert([
        { role_key: 'super_admin', role_name: '超级管理员', data_scope: 1 },
        { role_key: 'org_admin', role_name: '组织管理员', data_scope: 2 },
        { role_key: 'race_admin', role_name: '赛事管理员', data_scope: 4 },
        { role_key: 'user', role_name: '普通用户', data_scope: 5 },
    ]);

    // ── 3. 创建 sys_user_role 关联表 ─────────────────────────
    await knex.schema.createTable('sys_user_role', (t) => {
        t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.bigInteger('role_id').notNullable().references('id').inTable('sys_role').onDelete('CASCADE');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.primary(['user_id', 'role_id']);
    });

    // ── 4. 迁移现有 users.role 数据到 sys_user_role ──────────
    await knex.raw(`
        INSERT INTO sys_user_role (user_id, role_id)
        SELECT u.id, r.id
        FROM users u
        JOIN sys_role r ON r.role_key = u.role
        ON CONFLICT (user_id, role_id) DO NOTHING
    `);

    // ── 5. users 表新增 data_scope 字段 ──────────────────────
    await knex.schema.alterTable('users', (t) => {
        t.integer('data_scope').defaultTo(5);
    });

    console.log('[Migration] sys_role, sys_user_role 已创建，用户角色数据已迁移');
}

export async function down(knex) {
    // ── 1. 移除 users.data_scope 字段 ────────────────────────
    await knex.schema.alterTable('users', (t) => {
        t.dropColumn('data_scope');
    });

    // ── 2. 删除 sys_user_role 表 ────────────────────────────
    await knex.schema.dropTableIfExists('sys_user_role');

    // ── 3. 删除 sys_role 表 ─────────────────────────────────
    await knex.schema.dropTableIfExists('sys_role');

    console.log('[Migration] sys_role, sys_user_role 已删除，data_scope 列已移除');
}

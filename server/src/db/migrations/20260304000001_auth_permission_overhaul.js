/**
 * Phase 1 — 认证与权限体系改造
 *
 * 变更清单:
 *   1. users 表: org_id 改为 nullable，角色枚举替换，新增安全/状态字段
 *   2. 新增 user_race_permissions 表 (赛事级授权)
 */

export async function up(knex) {
    // ── 1. 解除旧的角色约束 ───────────────────────────────
    await knex.raw(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);

    // ── 2. 角色数据迁移 ──────────────────────────────────
    await knex.raw(`UPDATE users SET role = 'org_admin' WHERE role IN ('owner', 'admin')`);
    await knex.raw(`UPDATE users SET role = 'race_editor' WHERE role = 'member'`);

    // ── 3. org_id 改为 nullable (super_admin 无 org) ────
    await knex.raw(`ALTER TABLE users ALTER COLUMN org_id DROP NOT NULL`);

    // ── 4. 新增角色约束 ─────────────────────────────────
    await knex.raw(`
        ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('super_admin', 'org_admin', 'race_editor', 'race_viewer'))
    `);

    // ── 5. org_id + role 联合约束: 非 super_admin 必须有 org_id ──
    await knex.raw(`
        ALTER TABLE users ADD CONSTRAINT users_org_id_role_check
        CHECK (role = 'super_admin' OR org_id IS NOT NULL)
    `);

    // ── 6. 新增安全与状态字段 ────────────────────────────
    await knex.schema.alterTable('users', (t) => {
        t.text('status').defaultTo('active');
        t.boolean('must_change_password').defaultTo(false);
        t.uuid('created_by').nullable();
        t.integer('failed_login_attempts').defaultTo(0);
        t.timestamp('locked_until', { useTz: true }).nullable();
    });

    // ── 7. status 字段约束 ──────────────────────────────
    await knex.raw(`
        ALTER TABLE users ADD CONSTRAINT users_status_check
        CHECK (status IN ('active', 'disabled'))
    `);

    // ── 8. 确保现有数据兼容 ─────────────────────────────
    await knex.raw(`
        UPDATE users SET status = 'active', must_change_password = false
        WHERE status IS NULL
    `);

    // ── 9. 创建 user_race_permissions 表 ────────────────
    await knex.schema.createTable('user_race_permissions', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        t.text('access_level').notNullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.uuid('created_by').nullable().references('id').inTable('users');

        t.unique(['user_id', 'race_id']);
        t.index('user_id');
        t.index('race_id');
        t.index('org_id');
    });

    await knex.raw(`
        ALTER TABLE user_race_permissions ADD CONSTRAINT urp_access_level_check
        CHECK (access_level IN ('editor', 'viewer'))
    `);
}

export async function down(knex) {
    // ── 删除 user_race_permissions ──────────────────────
    await knex.schema.dropTableIfExists('user_race_permissions');

    // ── 移除新增字段 ────────────────────────────────────
    await knex.raw(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check`);
    await knex.schema.alterTable('users', (t) => {
        t.dropColumn('status');
        t.dropColumn('must_change_password');
        t.dropColumn('created_by');
        t.dropColumn('failed_login_attempts');
        t.dropColumn('locked_until');
    });

    // ── 移除新约束 ──────────────────────────────────────
    await knex.raw(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_org_id_role_check`);
    await knex.raw(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);

    // ── org_id 恢复 NOT NULL ────────────────────────────
    // 注意: 如果已有 super_admin 用户 (org_id=null)，需先清理
    await knex.raw(`DELETE FROM users WHERE org_id IS NULL`);
    await knex.raw(`ALTER TABLE users ALTER COLUMN org_id SET NOT NULL`);

    // ── 角色数据回退 ────────────────────────────────────
    await knex.raw(`UPDATE users SET role = 'owner' WHERE role = 'org_admin'`);
    await knex.raw(`UPDATE users SET role = 'member' WHERE role IN ('race_editor', 'race_viewer')`);

    // ── 恢复旧角色约束 ─────────────────────────────────
    await knex.raw(`
        ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('owner', 'admin', 'member'))
    `);
}

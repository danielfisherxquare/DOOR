/**
 * 权限收束迁移 — 将5角色简化为4角色
 *
 * 变更清单:
 *   1. 角色迁移: org_finance → org_admin, race_editor → race_admin, race_viewer → user
 *   2. 新增 job_title 字段存储职级信息
 *   3. 新增 department 字段存储部门信息
 *   4. 更新角色枚举约束
 */

export async function up(knex) {
    // ── 1. 解除旧的角色约束 ───────────────────────────────
    await knex.raw(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);

    // ── 2. 角色数据迁移 ──────────────────────────────────
    // org_finance 合入 org_admin（财务职责通过 capability 区分）
    await knex.raw(`UPDATE users SET role = 'org_admin' WHERE role = 'org_finance'`);
    // race_editor → race_admin
    await knex.raw(`UPDATE users SET role = 'race_admin' WHERE role = 'race_editor'`);
    // race_viewer → user
    await knex.raw(`UPDATE users SET role = 'user' WHERE role = 'race_viewer'`);

    // ── 3. 新增职级和部门字段 ────────────────────────────
    await knex.schema.alterTable('users', (t) => {
        t.text('job_title').nullable();
        t.text('department').nullable();
    });

    // ── 4. job_title 枚举约束 ─────────────────────────────
    await knex.raw(`
        ALTER TABLE users ADD CONSTRAINT users_job_title_check
        CHECK (job_title IS NULL OR job_title IN (
            '老板', '副总', '财务', '部门经理',
            '高级员工', '普通员工', '长期外援', '外援'
        ))
    `);

    // ── 5. 新增角色约束 ─────────────────────────────────
    await knex.raw(`
        ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('super_admin', 'org_admin', 'race_admin', 'user'))
    `);

    // ── 6. 根据旧角色推断职级（可选，仅用于数据迁移提示）──
    // super_admin 可能是老板/副总
    // org_admin 可能是老板/副总/财务
    // race_admin 可能是部门经理/高级员工
    // user 可能是普通员工/外援
    // 实际职级需要管理员手动设置
}

export async function down(knex) {
    // ── 移除新约束 ──────────────────────────────────────
    await knex.raw(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_job_title_check`);
    await knex.raw(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);

    // ── 移除新增字段 ────────────────────────────────────
    await knex.schema.alterTable('users', (t) => {
        t.dropColumn('job_title');
        t.dropColumn('department');
    });

    // ── 角色数据回退 ────────────────────────────────────
    // 需要根据业务逻辑手动回退，这里只恢复原有角色枚举
    await knex.raw(`
        ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('super_admin', 'org_admin', 'org_finance', 'race_editor', 'race_viewer'))
    `);
}
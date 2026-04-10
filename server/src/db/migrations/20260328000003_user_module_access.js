/**
 * 模块访问表迁移 — 用户模块访问权限配置
 *
 * 变更清单:
 *   1. 创建 user_module_access 表
 *   2. 存储用户-模块访问关系
 *   3. 支持临时授权（expires_at）
 */

export async function up(knex) {
    await knex.schema.createTable('user_module_access', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.text('module_id').notNullable();  // 格式: surface:module，如 app:map, ops:bib-pickup
        t.timestamp('granted_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.uuid('granted_by').nullable().references('id').inTable('users');
        t.timestamp('expires_at', { useTz: true }).nullable();  // 临时授权的过期时间

        t.unique(['user_id', 'module_id']);
        t.index('user_id');
        t.index('org_id');
        t.index('module_id');
        t.index('expires_at');
    });

    // 添加 module_id 格式约束
    await knex.raw(`
        ALTER TABLE user_module_access ADD CONSTRAINT module_id_format_check
        CHECK (module_id LIKE '%:%')
    `);

    // ── 为现有用户设置默认模块访问权限 ─────────────────────
    // race_admin 用户默认授予 ops 入口的所有模块
    const raceAdmins = await knex('users').where('role', 'race_admin');
    for (const user of raceAdmins) {
        const opsModules = [
            'ops:home',
            'ops:bib-pickup',
            'ops:scan'
        ];
        for (const moduleId of opsModules) {
            await knex('user_module_access').insert({
                user_id: user.id,
                org_id: user.org_id,
                module_id: moduleId,
                granted_by: null
            }).onConflict(['user_id', 'module_id']).ignore();
        }
    }
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('user_module_access');
}
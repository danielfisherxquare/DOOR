/**
 * Add surface scope to color schemes
 * 为配色方案添加层级作用域支持（admin/app/ops）
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    // 1. 为 color_schemes 表添加 surface 字段
    const hasSurfaceColumn = await knex.schema.hasColumn('color_schemes', 'surface');
    if (!hasSurfaceColumn) {
        await knex.schema.alterTable('color_schemes', (table) => {
            table.text('surface').notNullable().defaultTo('admin');
            table.index(['org_id', 'surface']);
        });
    }

    // 2. 为 org_color_settings 表添加 surface 字段，修改主键为复合主键
    const hasSurfaceInSettings = await knex.schema.hasColumn('org_color_settings', 'surface');
    if (!hasSurfaceInSettings) {
        // 创建新表结构
        await knex.schema.createTable('org_color_settings_new', (table) => {
            table.uuid('org_id').references('id').inTable('organizations').onDelete('CASCADE').notNullable();
            table.text('surface').notNullable().defaultTo('admin');
            table.text('scheme_id').notNullable();
            table.jsonb('custom_config');
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.primary(['org_id', 'surface']);
            table.index(['org_id', 'surface']);
        });

        // 迁移旧数据
        await knex.raw(`
            INSERT INTO org_color_settings_new (org_id, surface, scheme_id, custom_config, updated_at)
            SELECT org_id, 'admin' as surface, scheme_id, custom_config, updated_at
            FROM org_color_settings
        `);

        // 删除旧表，重命名新表
        await knex.schema.dropTableIfExists('org_color_settings');
        await knex.schema.renameTable('org_color_settings_new', 'org_color_settings');
    }

    // 3. 更新现有数据的 surface 为 'admin'
    await knex('color_schemes')
        .whereNull('surface')
        .orWhere('surface', '')
        .update({ surface: 'admin' });
}

export async function down(knex) {
    // 回滚：删除 surface 字段
    await knex.schema.alterTable('color_schemes', (table) => {
        table.dropColumn('surface');
    });

    // 恢复 org_color_settings 为旧结构
    await knex.schema.createTable('org_color_settings_old', (table) => {
        table.uuid('org_id').references('id').inTable('organizations').onDelete('CASCADE').primary();
        table.text('scheme_id').notNullable();
        table.jsonb('custom_config');
        table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });

    await knex.raw(`
        INSERT INTO org_color_settings_old (org_id, scheme_id, custom_config, updated_at)
        SELECT DISTINCT ON (org_id) org_id, scheme_id, custom_config, updated_at
        FROM org_color_settings
        WHERE surface = 'admin'
    `);

    await knex.schema.dropTableIfExists('org_color_settings');
    await knex.schema.renameTable('org_color_settings_old', 'org_color_settings');
}

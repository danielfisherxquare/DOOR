/**
 * Color Scheme Tables
 * 配色方案管理相关数据表
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    // 配色方案表
    const schemesExists = await knex.schema.hasTable('color_schemes');
    if (!schemesExists) {
        await knex.schema.createTable('color_schemes', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('org_id').references('id').inTable('organizations').onDelete('CASCADE').notNullable();
            table.text('name').notNullable();
            table.text('description');
            table.jsonb('config').notNullable();
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['org_id']);
        });
    }

    // 机构配色设置表
    const orgSettingsExists = await knex.schema.hasTable('org_color_settings');
    if (!orgSettingsExists) {
        await knex.schema.createTable('org_color_settings', (table) => {
            table.uuid('org_id').references('id').inTable('organizations').onDelete('CASCADE').primary();
            table.text('scheme_id').notNullable();
            table.jsonb('custom_config');
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
    }
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('org_color_settings');
    await knex.schema.dropTableIfExists('color_schemes');
}
/**
 * Phase 3 — 列映射表
 * 保存用户上传文件的列名 → 标准字段映射记忆
 * 以 (org_id, source_column) 为唯一约束，支持 UPSERT
 */

export async function up(knex) {
    await knex.schema.createTable('column_mappings', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.string('source_column', 255).notNullable();
        t.string('target_field_id', 255).notNullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'source_column']);
        t.index('org_id');
    });
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('column_mappings');
}

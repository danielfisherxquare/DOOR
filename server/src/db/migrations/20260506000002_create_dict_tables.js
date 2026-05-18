/**
 * 创建数据字典表
 *
 * 变更清单:
 *   1. 创建 sys_dict_type 表（字典类型定义）
 *   2. 创建 sys_dict_data 表（字典数据项，引用 sys_dict_type）
 *   3. 创建相关索引
 */

export async function up(knex) {
    // ── 1. 创建 sys_dict_type 表 ──────────────────────────────
    await knex.schema.createTable('sys_dict_type', (t) => {
        t.bigIncrements('id').primary();
        t.string('dict_type', 100).unique().notNullable();
        t.string('dict_name', 200).notNullable();
        t.string('status', 1).defaultTo('0');
        t.string('remark', 500).nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });

    // ── 2. 创建 sys_dict_data 表 ──────────────────────────────
    await knex.schema.createTable('sys_dict_data', (t) => {
        t.bigIncrements('id').primary();
        t.string('dict_type', 100).notNullable()
            .references('dict_type').inTable('sys_dict_type').onDelete('CASCADE');
        t.string('dict_label', 200).notNullable();
        t.string('dict_value', 200).notNullable();
        t.integer('sort_order').defaultTo(0);
        t.string('css_class', 100).nullable();
        t.string('list_class', 100).nullable();
        t.string('is_default', 1).defaultTo('N');
        t.string('status', 1).defaultTo('0');
        t.string('remark', 500).nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });

    // ── 3. 创建索引 ───────────────────────────────────────────
    await knex.schema.alterTable('sys_dict_data', (t) => {
        t.unique(['dict_type', 'dict_value'], { indexName: 'idx_dict_data_type_value' });
        t.index('dict_type', 'idx_dict_data_type');
    });

    console.log('[Migration] sys_dict_type, sys_dict_data 已创建');
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('sys_dict_data');
    await knex.schema.dropTableIfExists('sys_dict_type');

    console.log('[Migration] sys_dict_type, sys_dict_data 已删除');
}

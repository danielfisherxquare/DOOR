/**
 * Credential Module — Step 2: 证件样式模板表
 * 
 * 用途：
 * - 管理证件正反面布局模板
 * - 模板保存为 JSON 格式，包含所有元素的位置、样式、动态字段绑定
 * - 支持版本管理，便于后续迭代
 */

export async function up(knex) {
    await knex.schema.createTable('credential_style_templates', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        
        t.text('template_name').notNullable();
        t.text('template_code').notNullable();
        
        // 正面布局 JSON
        t.jsonb('front_layout_json').notNullable();
        // 背面布局 JSON
        t.jsonb('back_layout_json').nullable();
        
        // 页面尺寸 (pt, 1pt = 1/72 inch)
        t.decimal('page_width', 10, 2).notNullable().defaultTo(567); // 默认 A4 宽度
        t.decimal('page_height', 10, 2).notNullable().defaultTo(567);
        
        // 版本管理
        t.integer('version').notNullable().defaultTo(1);
        
        // 状态
        t.text('status').notNullable().defaultTo('draft'); // draft, active, archived
        
        // 元数据
        t.text('description').nullable();
        t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        // 唯一性：同一赛事内 template_code 唯一
        t.unique(['org_id', 'race_id', 'template_code']);
        t.index(['org_id', 'race_id']);
        t.index(['race_id', 'status']);
    });

    // 添加注释
    await knex.raw(`COMMENT ON TABLE credential_style_templates IS '证件样式模板表'`);
    await knex.raw(`COMMENT ON COLUMN credential_style_templates.front_layout_json IS '正面布局 JSON'`);
    await knex.raw(`COMMENT ON COLUMN credential_style_templates.back_layout_json IS '背面布局 JSON'`);
    await knex.raw(`COMMENT ON COLUMN credential_style_templates.status IS '模板状态：draft, active, archived'`);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('credential_style_templates');
}

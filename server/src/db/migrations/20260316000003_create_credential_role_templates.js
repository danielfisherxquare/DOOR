/**
 * Credential Module — Step 2: 岗位模板表
 * 
 * 用途：
 * - 定义赛事中不同岗位的名称、默认颜色、是否需要审核
 * - 岗位模板与分区关联 (credential_role_template_zones)
 * - 申请时选择岗位模板，自动带出默认区域
 */

export async function up(knex) {
    await knex.schema.createTable('credential_role_templates', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        
        t.text('role_name').notNullable();
        t.text('role_code').notNullable();
        t.text('default_color').notNullable().defaultTo('#6B7280');
        
        // 审核配置
        t.boolean('requires_review').notNullable().defaultTo(true);
        t.boolean('is_active').notNullable().defaultTo(true);
        
        // 默认样式模板引用 (可选)
        t.bigInteger('default_style_template_id').nullable()
            .references('id').inTable('credential_style_templates').onDelete('SET NULL');
        
        // 元数据
        t.text('description').nullable();
        t.integer('sort_order').notNullable().defaultTo(0);
        
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        // 唯一性：同一赛事内 role_code 唯一
        t.unique(['org_id', 'race_id', 'role_code']);
        t.index(['org_id', 'race_id']);
        t.index(['race_id', 'is_active']);
    });

    // 添加注释
    await knex.raw(`COMMENT ON TABLE credential_role_templates IS '岗位模板表'`);
    await knex.raw(`COMMENT ON COLUMN credential_role_templates.role_code IS '岗位编码 (同一赛事内唯一)'`);
    await knex.raw(`COMMENT ON COLUMN credential_role_templates.role_name IS '岗位名称'`);
    await knex.raw(`COMMENT ON COLUMN credential_role_templates.requires_review IS '是否需要审核'`);
    await knex.raw(`COMMENT ON COLUMN credential_role_templates.default_style_template_id IS '默认样式模板 ID'`);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('credential_role_templates');
}

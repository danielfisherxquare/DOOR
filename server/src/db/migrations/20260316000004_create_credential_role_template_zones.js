/**
 * Credential Module — Step 2: 岗位模板 - 分区关联表
 * 
 * 用途：
 * - 定义岗位模板默认关联的可通行区域
 * - 一个岗位模板可关联多个分区
 * - 申请时自动带出这些默认区域
 */

export async function up(knex) {
    await knex.schema.createTable('credential_role_template_zones', (t) => {
        t.bigIncrements('id').primary();
        t.bigInteger('role_template_id').notNullable()
            .references('id').inTable('credential_role_templates').onDelete('CASCADE');
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        
        t.text('zone_code').notNullable();
        
        // 元数据
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        // 唯一性：同一岗位模板下 zone_code 唯一
        t.unique(['role_template_id', 'zone_code']);
        t.index(['role_template_id']);
        t.index(['org_id', 'race_id', 'zone_code']);
        
        // 外键：zone_code 必须存在于 credential_zones
        t.foreign(['org_id', 'race_id', 'zone_code'])
            .references(['org_id', 'race_id', 'zone_code'])
            .inTable('credential_zones')
            .onDelete('CASCADE');
    });

    // 添加注释
    await knex.raw(`COMMENT ON TABLE credential_role_template_zones IS '岗位模板 - 分区关联表'`);
    await knex.raw(`COMMENT ON COLUMN credential_role_template_zones.zone_code IS '分区编码'`);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('credential_role_template_zones');
}

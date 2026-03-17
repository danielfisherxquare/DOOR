/**
 * Credential Module — Step 2: 证件区域快照表
 * 
 * 用途：
 * - 保存证件生成时的最终可通行区域列表
 * - 包含区域的完整快照数据 (名称、颜色、几何对象)
 * - 确保后续区域定义变更不影响历史证件
 */

export async function up(knex) {
    await knex.schema.createTable('credential_credential_zones', (t) => {
        t.bigIncrements('id').primary();
        t.bigInteger('credential_id').notNullable()
            .references('id').inTable('credential_credentials').onDelete('CASCADE');
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        
        t.text('zone_code').notNullable();
        t.text('zone_name').notNullable(); // 快照
        t.text('zone_color').notNullable(); // 快照
        
        // GeoJSON 几何对象快照
        t.jsonb('geometry').nullable();
        
        // 区域说明 (用于证件背面展示)
        t.text('zone_description').nullable();
        
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['credential_id']);
        t.index(['org_id', 'race_id']);
        
        // 唯一性：同一证件下 zone_code 唯一
        t.unique(['credential_id', 'zone_code']);
    });

    // 添加注释
    await knex.raw(`COMMENT ON TABLE credential_credential_zones IS '证件区域快照表'`);
    await knex.raw(`COMMENT ON COLUMN credential_credential_zones.zone_code IS '分区编码'`);
    await knex.raw(`COMMENT ON COLUMN credential_credential_zones.geometry IS 'GeoJSON 几何对象快照'`);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('credential_credential_zones');
}

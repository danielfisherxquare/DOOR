/**
 * Credential Module — Step 2: 分区定义表
 * 
 * 用途：
 * - 管理赛事证件的可通行区域
 * - 每个区域有唯一编码、名称、颜色和 GeoJSON 几何对象
 * - 供岗位模板和证件实例引用
 */

export async function up(knex) {
    await knex.schema.createTable('credential_zones', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        
        t.text('zone_code').notNullable();
        t.text('zone_name').notNullable();
        t.text('zone_color').notNullable().defaultTo('#3B82F6');
        t.integer('sort_order').notNullable().defaultTo(0);
        
        // GeoJSON 几何对象 (Polygon / MultiPolygon)
        t.jsonb('geometry').notNullable();
        
        // 元数据
        t.text('description').nullable();
        t.boolean('is_active').notNullable().defaultTo(true);
        
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        // 唯一性：同一赛事内 zone_code 唯一
        t.unique(['org_id', 'race_id', 'zone_code']);
        t.index(['org_id', 'race_id']);
        t.index(['race_id', 'is_active']);
    });

    // 添加注释
    await knex.raw(`COMMENT ON TABLE credential_zones IS '证件分区定义表'`);
    await knex.raw(`COMMENT ON COLUMN credential_zones.zone_code IS '分区编码 (同一赛事内唯一)'`);
    await knex.raw(`COMMENT ON COLUMN credential_zones.zone_name IS '分区名称'`);
    await knex.raw(`COMMENT ON COLUMN credential_zones.zone_color IS '分区颜色 (十六进制)'`);
    await knex.raw(`COMMENT ON COLUMN credential_zones.geometry IS 'GeoJSON 几何对象 (Polygon/MultiPolygon)'`);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('credential_zones');
}

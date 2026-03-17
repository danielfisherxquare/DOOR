/**
 * Credential Module — Step 2: 申请区域调整表
 * 
 * 用途：
 * - 审核时允许对申请人的默认区域进行增减调整
 * - 记录每次调整的类型 (add/remove) 和调整的区域
 * - 最终生成证件时使用调整后的区域集合
 */

export async function up(knex) {
    await knex.schema.createTable('credential_application_zone_overrides', (t) => {
        t.bigIncrements('id').primary();
        t.bigInteger('application_id').notNullable()
            .references('id').inTable('credential_applications').onDelete('CASCADE');
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        
        t.text('zone_code').notNullable();
        t.text('override_type').notNullable(); // 'add' 或 'remove'
        
        // 审核时备注
        t.text('remark').nullable();
        
        t.uuid('operator_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['application_id']);
        t.index(['org_id', 'race_id']);
        
        // 外键：zone_code 必须存在于 credential_zones
        t.foreign(['org_id', 'race_id', 'zone_code'])
            .references(['org_id', 'race_id', 'zone_code'])
            .inTable('credential_zones')
            .onDelete('CASCADE');
    });

    // 添加注释
    await knex.raw(`COMMENT ON TABLE credential_application_zone_overrides IS '申请区域调整表'`);
    await knex.raw(`COMMENT ON COLUMN credential_application_zone_overrides.override_type IS '调整类型：add(增加) 或 remove(移除)'`);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('credential_application_zone_overrides');
}

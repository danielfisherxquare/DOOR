/**
 * Credential Module — Step 2: 领取日志表
 * 
 * 用途：
 * - 记录证件领取/发放操作
 * - 支持手动领取和扫码领取
 * - 记录领取人和领取时间
 */

export async function up(knex) {
    await knex.schema.createTable('credential_issue_logs', (t) => {
        t.bigIncrements('id').primary();
        t.bigInteger('credential_id').notNullable()
            .references('id').inTable('credential_credentials').onDelete('CASCADE');
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        
        // 领取人
        t.uuid('issued_to_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.text('issued_to_person_name').notNullable(); // 领取人姓名快照
        t.text('issued_to_org_name').nullable(); // 领取人单位快照
        
        // 发放操作人
        t.uuid('issued_by_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
        
        // 领取来源
        t.text('issue_source').notNullable(); // 'manual' (手动), 'scan' (扫码)
        
        // 领取时间
        t.timestamp('issued_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        
        // 备注
        t.text('remark').nullable();
        
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['credential_id']);
        t.index(['org_id', 'race_id']);
        t.index(['issued_to_user_id']);
        t.index(['issued_at']);
    });

    // 添加注释
    await knex.raw(`COMMENT ON TABLE credential_issue_logs IS '证件领取日志表'`);
    await knex.raw(`COMMENT ON COLUMN credential_issue_logs.issue_source IS '领取来源：manual(手动), scan(扫码)'`);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('credential_issue_logs');
}

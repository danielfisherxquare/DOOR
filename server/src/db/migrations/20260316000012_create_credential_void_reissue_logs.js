/**
 * Credential Module — Step 2: 作废日志表 & 补打日志表
 * 
 * 用途：
 * - 作废日志：记录证件作废操作和原因
 * - 补打日志：记录证件补打操作和原因
 */

export async function up(knex) {
    // ── 作废日志 ─────────────────────────────────────────────
    await knex.schema.createTable('credential_void_logs', (t) => {
        t.bigIncrements('id').primary();
        t.bigInteger('credential_id').notNullable()
            .references('id').inTable('credential_credentials').onDelete('CASCADE');
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        
        // 作废原因
        t.text('void_reason').notNullable();
        t.text('remark').nullable();
        
        // 操作人
        t.uuid('voided_by_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        
        t.timestamp('voided_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['credential_id']);
        t.index(['org_id', 'race_id']);
        t.index(['voided_at']);
    });

    // ── 补打日志 ─────────────────────────────────────────────
    await knex.schema.createTable('credential_reissue_logs', (t) => {
        t.bigIncrements('id').primary();
        t.bigInteger('credential_id').notNullable()
            .references('id').inTable('credential_credentials').onDelete('CASCADE');
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        
        // 补打原因
        t.text('reissue_reason').notNullable();
        t.text('remark').nullable();
        
        // 操作人
        t.uuid('reissued_by_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        
        // 关联新证件 ID (如果补打生成了新证件)
        t.bigInteger('new_credential_id').nullable()
            .references('id').inTable('credential_credentials').onDelete('SET NULL');
        
        t.timestamp('reissued_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['credential_id']);
        t.index(['org_id', 'race_id']);
        t.index(['new_credential_id']);
        t.index(['reissued_at']);
    });

    // 添加注释
    await knex.raw(`COMMENT ON TABLE credential_void_logs IS '证件作废日志表'`);
    await knex.raw(`COMMENT ON TABLE credential_reissue_logs IS '证件补打日志表'`);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('credential_reissue_logs');
    await knex.schema.dropTableIfExists('credential_void_logs');
}

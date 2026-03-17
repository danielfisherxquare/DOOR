/**
 * Credential Module — Step 2: 扫码日志表
 * 
 * 用途：
 * - 记录所有证件扫码核验操作
 * - 记录扫码结果 (有效/无效/已作废等)
 * - 记录扫码人、扫码时间、扫码位置
 */

export async function up(knex) {
    await knex.schema.createTable('credential_scan_logs', (t) => {
        t.bigIncrements('id').primary();
        t.bigInteger('credential_id').nullable()
            .references('id').inTable('credential_credentials').onDelete('SET NULL');
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        
        // 扫码 payload (用于无 credential_id 时的查询)
        t.text('qr_payload').notNullable();
        
        // 扫码结果
        t.text('scan_result').notNullable();
        // valid (有效), invalid (无效), voided (已作废), not_found (未找到), expired (已过期)
        
        // 扫码人
        t.uuid('scanned_by_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
        
        // 扫码设备/位置
        t.text('scan_device').nullable(); // 设备标识
        t.text('scan_location').nullable(); // 位置描述
        
        // 扫码时间
        t.timestamp('scanned_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        
        // 额外 payload (用于记录详细信息)
        t.jsonb('payload').nullable();
        
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['credential_id']);
        t.index(['org_id', 'race_id']);
        t.index(['qr_payload']);
        t.index(['scanned_at']);
        t.index(['scan_result']);
    });

    // 添加注释
    await knex.raw(`COMMENT ON TABLE credential_scan_logs IS '证件扫码日志表'`);
    await knex.raw(`COMMENT ON COLUMN credential_scan_logs.scan_result IS '扫码结果：valid, invalid, voided, not_found, expired'`);
    await knex.raw(`COMMENT ON COLUMN credential_scan_logs.qr_payload IS '二维码 payload (用于无 credential_id 时的查询)'`);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('credential_scan_logs');
}

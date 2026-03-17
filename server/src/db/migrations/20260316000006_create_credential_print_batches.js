/**
 * Credential Module — Step 2: 打印批次表
 * 
 * 用途：
 * - 记录每次批量打印的批次信息
 * - 关联该批次生成的所有证件
 * - 便于追溯打印历史和补打操作
 */

export async function up(knex) {
    await knex.schema.createTable('credential_print_batches', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        
        // 批次号 (自动生成)
        t.text('batch_no').notNullable();
        
        // 批次状态
        t.text('status').notNullable().defaultTo('pending');
        // pending, processing, completed, failed
        
        // 打印信息
        t.text('pdf_file_path').nullable(); // PDF 文件路径
        t.integer('total_count').notNullable().defaultTo(0); // 本批次证件数量
        t.integer('success_count').notNullable().defaultTo(0); // 成功生成数量
        t.integer('failed_count').notNullable().defaultTo(0); // 失败数量
        
        // 错误信息 (如果失败)
        t.text('error_message').nullable();
        
        // 元数据
        t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('completed_at', { useTz: true }).nullable();

        t.index(['org_id', 'race_id']);
        t.index(['race_id', 'status']);
        t.unique(['org_id', 'race_id', 'batch_no']);
    });

    // 添加注释
    await knex.raw(`COMMENT ON TABLE credential_print_batches IS '证件打印批次表'`);
    await knex.raw(`COMMENT ON COLUMN credential_print_batches.batch_no IS '批次号'`);
    await knex.raw(`COMMENT ON COLUMN credential_print_batches.status IS '批次状态：pending, processing, completed, failed'`);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('credential_print_batches');
}

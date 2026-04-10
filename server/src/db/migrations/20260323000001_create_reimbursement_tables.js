/**
 * Reimbursement Tool Tables
 * 发票报销工具相关数据表
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    // 报销项目表
    const projectsExists = await knex.schema.hasTable('reimbursement_projects');
    if (!projectsExists) {
        await knex.schema.createTable('reimbursement_projects', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('org_id').references('id').inTable('organizations').onDelete('CASCADE');
            table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
            table.text('name').notNullable();
            table.text('description');
            table.text('status').defaultTo('active'); // active, archived
            table.integer('record_count').defaultTo(0);
            table.decimal('total_income', 12, 2).defaultTo(0);
            table.decimal('total_expense', 12, 2).defaultTo(0);
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['org_id']);
            table.index(['user_id']);
            table.index(['status']);
        });
    }

    // 报销记录表
    const recordsExists = await knex.schema.hasTable('reimbursement_records');
    if (!recordsExists) {
        await knex.schema.createTable('reimbursement_records', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('project_id').references('id').inTable('reimbursement_projects').onDelete('CASCADE').notNullable();
            table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
            table.integer('index').notNullable(); // 行号
            table.date('payment_date');
            table.text('category'); // 大类：交通费、差旅费等
            table.text('sub_category'); // 子类：高铁费、住宿费等
            table.text('description');
            table.decimal('income', 12, 2);
            table.decimal('expense', 12, 2);
            table.text('reporter'); // 报销人
            table.boolean('has_invoice').defaultTo(false);
            table.text('company'); // 开票公司
            table.text('remarks');
            table.decimal('unit_price', 12, 2);
            table.text('unit');
            table.integer('quantity');
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['project_id']);
            table.index(['user_id']);
            table.index(['payment_date']);
        });
    }

    // 附件元数据表
    const attachmentsExists = await knex.schema.hasTable('reimbursement_attachments');
    if (!attachmentsExists) {
        await knex.schema.createTable('reimbursement_attachments', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('record_id').references('id').inTable('reimbursement_records').onDelete('CASCADE').notNullable();
            table.text('file_name').notNullable();
            table.text('original_name');
            table.text('file_type').notNullable(); // 'invoice' | 'payment'
            table.bigInteger('file_size');
            table.text('mime_type');
            table.text('local_path'); // 用户本地路径索引
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['record_id']);
            table.index(['file_type']);
        });
    }

    // 待匹配项表
    const pendingMatchesExists = await knex.schema.hasTable('reimbursement_pending_matches');
    if (!pendingMatchesExists) {
        await knex.schema.createTable('reimbursement_pending_matches', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('project_id').references('id').inTable('reimbursement_projects').onDelete('CASCADE').notNullable();
            table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
            table.jsonb('payment_data'); // 付款凭证识别数据
            table.specificType('candidate_ids', 'UUID[]'); // 候选记录ID
            table.text('status').defaultTo('pending'); // pending, resolved, rejected
            table.uuid('resolved_record_id').references('id').inTable('reimbursement_records').onDelete('SET NULL');
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('resolved_at', { useTz: true });

            table.index(['project_id']);
            table.index(['user_id']);
            table.index(['status']);
        });
    }

    // 用户设置表
    const userSettingsExists = await knex.schema.hasTable('reimbursement_user_settings');
    if (!userSettingsExists) {
        await knex.schema.createTable('reimbursement_user_settings', (table) => {
            table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').primary();
            table.text('default_reporter');
            table.text('watch_directory_path');
            table.jsonb('llm_config'); // { provider, baseUrl, apiKey, modelName }
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
    }

    // 已处理文件记录表（用于去重）
    const processedFilesExists = await knex.schema.hasTable('reimbursement_processed_files');
    if (!processedFilesExists) {
        await knex.schema.createTable('reimbursement_processed_files', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('project_id').references('id').inTable('reimbursement_projects').onDelete('CASCADE').notNullable();
            table.text('file_name').notNullable();
            table.text('file_type').notNullable(); // 'invoice' | 'payment'
            table.text('source_path');
            table.text('status').defaultTo('completed'); // processing, completed, error, skipped
            table.text('file_hash'); // 用于去重
            table.timestamp('processed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['project_id']);
            table.index(['file_hash']);
            table.unique(['project_id', 'file_name']);
        });
    }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    // 按依赖顺序删除表
    await knex.schema.dropTableIfExists('reimbursement_processed_files');
    await knex.schema.dropTableIfExists('reimbursement_user_settings');
    await knex.schema.dropTableIfExists('reimbursement_pending_matches');
    await knex.schema.dropTableIfExists('reimbursement_attachments');
    await knex.schema.dropTableIfExists('reimbursement_records');
    await knex.schema.dropTableIfExists('reimbursement_projects');
}
/**
 * Create Preview Files Table
 * 创建预览文件表，支持预览工作区功能
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    // 1. 创建预览文件表
    const previewExists = await knex.schema.hasTable('reimbursement_preview_files');
    if (!previewExists) {
        await knex.schema.createTable('reimbursement_preview_files', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('project_id').references('id').inTable('reimbursement_projects').onDelete('CASCADE').notNullable();
            table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable();

            // 文件信息
            table.text('file_name').notNullable();
            table.text('original_name');
            table.text('file_hash').notNullable(); // SHA256用于真正去重
            table.text('mime_type');
            table.bigInteger('file_size');
            table.text('source_path'); // 用户本地路径

            // 图片预览（混合存储：缩略图入库，原图存文件系统）
            table.binary('thumbnail_data'); // 缩略图二进制（用于快速预览）
            table.text('original_path'); // 原图/原PDF文件系统路径
            table.integer('page_count').defaultTo(1); // PDF页数
            table.specificType('page_thumbnail_paths', 'TEXT[]'); // 多页缩略图路径数组

            // 重复检测
            table.boolean('is_duplicate').defaultTo(false);
            table.integer('duplicate_count').defaultTo(0); // 重复上传次数
            table.uuid('original_file_id'); // 指向首次上传的文件

            // 状态
            table.text('status').defaultTo('preview'); // preview, recognized, imported, discarded
            table.timestamp('recognized_at', { useTz: true });

            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['project_id']);
            table.index(['file_hash']);
            table.index(['status']);
            table.index(['project_id', 'file_hash']); // 用于快速查重
        });
    }

    // 2. 修改 reimbursement_records 添加重复标记字段
    const recordsHasDuplicate = await knex.schema.hasColumn('reimbursement_records', 'is_duplicate');
    if (!recordsHasDuplicate) {
        await knex.schema.alterTable('reimbursement_records', (table) => {
            table.boolean('is_duplicate').defaultTo(false);
            table.integer('duplicate_count').defaultTo(0);
            table.uuid('preview_file_id');
        });
    }

    // 3. 修改 reimbursement_attachments 添加缩略图字段
    const attachmentsHasThumbnail = await knex.schema.hasColumn('reimbursement_attachments', 'thumbnail_data');
    if (!attachmentsHasThumbnail) {
        await knex.schema.alterTable('reimbursement_attachments', (table) => {
            table.binary('thumbnail_data'); // 缩略图入库
            table.text('original_path'); // 原图文件系统路径
        });
    }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    const attachmentHasOriginalPath = await knex.schema.hasColumn('reimbursement_attachments', 'original_path');
    if (attachmentHasOriginalPath) {
        await knex.schema.alterTable('reimbursement_attachments', (table) => {
            table.dropColumn('original_path');
        });
    }

    const attachmentHasThumbnail = await knex.schema.hasColumn('reimbursement_attachments', 'thumbnail_data');
    if (attachmentHasThumbnail) {
        await knex.schema.alterTable('reimbursement_attachments', (table) => {
            table.dropColumn('thumbnail_data');
        });
    }

    const recordsHasPreviewFileId = await knex.schema.hasColumn('reimbursement_records', 'preview_file_id');
    if (recordsHasPreviewFileId) {
        await knex.schema.alterTable('reimbursement_records', (table) => {
            table.dropColumn('preview_file_id');
        });
    }

    const recordsHasDuplicateCount = await knex.schema.hasColumn('reimbursement_records', 'duplicate_count');
    if (recordsHasDuplicateCount) {
        await knex.schema.alterTable('reimbursement_records', (table) => {
            table.dropColumn('duplicate_count');
        });
    }

    const recordsHasIsDuplicate = await knex.schema.hasColumn('reimbursement_records', 'is_duplicate');
    if (recordsHasIsDuplicate) {
        await knex.schema.alterTable('reimbursement_records', (table) => {
            table.dropColumn('is_duplicate');
        });
    }

    // 删除预览文件表
    await knex.schema.dropTableIfExists('reimbursement_preview_files');
}

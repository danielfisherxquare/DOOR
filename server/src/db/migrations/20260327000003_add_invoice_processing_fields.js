/**
 * Add Invoice Processing Fields
 * 为发票处理添加可视化相关字段
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    const hasFields = await knex.schema.hasColumn('reimbursement_processed_files', 'thumbnail_path');

    if (!hasFields) {
        await knex.schema.alterTable('reimbursement_processed_files', (table) => {
            table.text('thumbnail_path');           // 缩略图路径
            table.text('original_path');            // 原图/PDF 保存路径
            table.jsonb('ocr_result');              // OCR 识别结果
            table.text('error_message');            // 错误详情
            table.jsonb('processing_log');          // 处理日志 [{step, message, timestamp}]
            table.timestamp('started_at', { useTz: true });  // 开始处理时间
        });
    }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    await knex.schema.alterTable('reimbursement_processed_files', (table) => {
        table.dropColumn('thumbnail_path');
        table.dropColumn('original_path');
        table.dropColumn('ocr_result');
        table.dropColumn('error_message');
        table.dropColumn('processing_log');
        table.dropColumn('started_at');
    });
}

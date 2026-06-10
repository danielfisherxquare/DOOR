/**
 * Add OCR observability metadata to reimbursement workflows.
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    const processedExists = await knex.schema.hasTable('reimbursement_processed_files');
    if (processedExists) {
        const hasUpdatedAt = await knex.schema.hasColumn('reimbursement_processed_files', 'updated_at');
        const hasOcrMeta = await knex.schema.hasColumn('reimbursement_processed_files', 'ocr_meta');
        if (!hasUpdatedAt || !hasOcrMeta) {
            await knex.schema.alterTable('reimbursement_processed_files', (table) => {
                if (!hasUpdatedAt) {
                    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
                }
                if (!hasOcrMeta) {
                    table.jsonb('ocr_meta');
                }
            });
        }
    }

    const recordsExists = await knex.schema.hasTable('reimbursement_records');
    if (recordsExists) {
        const hasOcrMeta = await knex.schema.hasColumn('reimbursement_records', 'ocr_meta');
        if (!hasOcrMeta) {
            await knex.schema.alterTable('reimbursement_records', (table) => {
                table.jsonb('ocr_meta');
            });
        }
    }

    const previewExists = await knex.schema.hasTable('reimbursement_preview_files');
    if (previewExists) {
        const hasOcrMeta = await knex.schema.hasColumn('reimbursement_preview_files', 'ocr_meta');
        if (!hasOcrMeta) {
            await knex.schema.alterTable('reimbursement_preview_files', (table) => {
                table.jsonb('ocr_meta');
            });
        }
    }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    if (await knex.schema.hasColumn('reimbursement_preview_files', 'ocr_meta')) {
        await knex.schema.alterTable('reimbursement_preview_files', (table) => {
            table.dropColumn('ocr_meta');
        });
    }

    if (await knex.schema.hasColumn('reimbursement_records', 'ocr_meta')) {
        await knex.schema.alterTable('reimbursement_records', (table) => {
            table.dropColumn('ocr_meta');
        });
    }

    const processedExists = await knex.schema.hasTable('reimbursement_processed_files');
    if (processedExists) {
        const hasOcrMeta = await knex.schema.hasColumn('reimbursement_processed_files', 'ocr_meta');
        const hasUpdatedAt = await knex.schema.hasColumn('reimbursement_processed_files', 'updated_at');
        if (hasOcrMeta || hasUpdatedAt) {
            await knex.schema.alterTable('reimbursement_processed_files', (table) => {
                if (hasOcrMeta) {
                    table.dropColumn('ocr_meta');
                }
                if (hasUpdatedAt) {
                    table.dropColumn('updated_at');
                }
            });
        }
    }
}

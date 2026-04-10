/**
 * Add document type to preview files
 * 区分预览区中的发票与付款凭证
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    const hasColumn = await knex.schema.hasColumn('reimbursement_preview_files', 'document_type');

    if (!hasColumn) {
        await knex.schema.alterTable('reimbursement_preview_files', (table) => {
            table.text('document_type').notNullable().defaultTo('invoice');
            table.index(['document_type']);
        });
    }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    const hasColumn = await knex.schema.hasColumn('reimbursement_preview_files', 'document_type');

    if (hasColumn) {
        await knex.schema.alterTable('reimbursement_preview_files', (table) => {
            table.dropIndex(['document_type']);
            table.dropColumn('document_type');
        });
    }
}

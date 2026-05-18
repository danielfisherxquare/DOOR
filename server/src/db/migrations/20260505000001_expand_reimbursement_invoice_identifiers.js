/**
 * Expand invoice identifier fields.
 *
 * Some real electronic invoices include long machine-readable invoice IDs or
 * OCR text with separators. A 25-character cap rejects otherwise valid records.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    if (await knex.schema.hasColumn('reimbursement_records', 'invoice_code')) {
        await knex.schema.alterTable('reimbursement_records', (table) => {
            table.string('invoice_code', 128).alter();
        });
    }

    if (await knex.schema.hasColumn('reimbursement_records', 'invoice_number')) {
        await knex.schema.alterTable('reimbursement_records', (table) => {
            table.string('invoice_number', 128).alter();
        });
    }

    if (await knex.schema.hasColumn('reimbursement_attachments', 'invoice_number')) {
        await knex.schema.alterTable('reimbursement_attachments', (table) => {
            table.string('invoice_number', 128).alter();
        });
    }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    if (await knex.schema.hasColumn('reimbursement_records', 'invoice_code')) {
        await knex.schema.alterTable('reimbursement_records', (table) => {
            table.string('invoice_code', 20).alter();
        });
    }

    if (await knex.schema.hasColumn('reimbursement_records', 'invoice_number')) {
        await knex.schema.alterTable('reimbursement_records', (table) => {
            table.string('invoice_number', 25).alter();
        });
    }

    if (await knex.schema.hasColumn('reimbursement_attachments', 'invoice_number')) {
        await knex.schema.alterTable('reimbursement_attachments', (table) => {
            table.string('invoice_number', 25).alter();
        });
    }
}

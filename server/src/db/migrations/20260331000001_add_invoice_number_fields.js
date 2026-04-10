/**
 * Add Invoice Number Fields
 * 添加发票代码、发票号码和项目简称字段
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    // 为报销记录表添加发票代码和发票号码字段
    const recordsHasInvoiceCode = await knex.schema.hasColumn('reimbursement_records', 'invoice_code');
    if (!recordsHasInvoiceCode) {
        await knex.schema.table('reimbursement_records', (table) => {
            table.string('invoice_code', 20).comment('发票代码，10-12位，数电发票可能为空');
        });
    }

    const recordsHasInvoiceNumber = await knex.schema.hasColumn('reimbursement_records', 'invoice_number');
    if (!recordsHasInvoiceNumber) {
        await knex.schema.table('reimbursement_records', (table) => {
            table.string('invoice_number', 25).comment('发票号码，纸质发票8位，数电发票20位');
            table.index(['invoice_number']);
        });
    }

    // 为附件表添加发票号码字段
    const attachmentsHasInvoiceNumber = await knex.schema.hasColumn('reimbursement_attachments', 'invoice_number');
    if (!attachmentsHasInvoiceNumber) {
        await knex.schema.table('reimbursement_attachments', (table) => {
            table.string('invoice_number', 25).comment('关联的发票号码');
        });
    }

    // 为项目表添加简称字段
    const projectsHasShortName = await knex.schema.hasColumn('reimbursement_projects', 'short_name');
    if (!projectsHasShortName) {
        await knex.schema.table('reimbursement_projects', (table) => {
            table.string('short_name', 50).comment('项目简称，用于导出文件命名');
        });
    }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    // 移除报销记录表的字段
    if (await knex.schema.hasColumn('reimbursement_records', 'invoice_number')) {
        await knex.schema.table('reimbursement_records', (table) => {
            table.dropIndex(['invoice_number']);
            table.dropColumn('invoice_number');
        });
    }

    if (await knex.schema.hasColumn('reimbursement_records', 'invoice_code')) {
        await knex.schema.table('reimbursement_records', (table) => {
            table.dropColumn('invoice_code');
        });
    }

    // 移除附件表的字段
    if (await knex.schema.hasColumn('reimbursement_attachments', 'invoice_number')) {
        await knex.schema.table('reimbursement_attachments', (table) => {
            table.dropColumn('invoice_number');
        });
    }

    // 移除项目表的字段
    if (await knex.schema.hasColumn('reimbursement_projects', 'short_name')) {
        await knex.schema.table('reimbursement_projects', (table) => {
            table.dropColumn('short_name');
        });
    }
}
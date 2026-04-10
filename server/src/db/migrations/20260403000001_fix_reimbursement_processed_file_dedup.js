/**
 * Fix reimbursement processed file dedup strategy
 * 取消按文件名唯一，避免同名不同文件被误判重复
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    await knex.raw('ALTER TABLE reimbursement_processed_files DROP CONSTRAINT IF EXISTS reimbursement_processed_files_project_id_file_name_unique');

    const hasIndex = await knex.schema.hasTable('reimbursement_processed_files');
    if (hasIndex) {
        await knex.schema.alterTable('reimbursement_processed_files', (table) => {
            table.index(['project_id', 'file_name'], 'reimbursement_processed_files_project_file_name_idx');
            table.index(['project_id', 'file_hash', 'file_type'], 'reimbursement_processed_files_project_hash_type_idx');
        });
    }
}

export async function down(knex) {
    const hasTable = await knex.schema.hasTable('reimbursement_processed_files');
    if (!hasTable) return;

    await knex.schema.alterTable('reimbursement_processed_files', (table) => {
        table.dropIndex(['project_id', 'file_name'], 'reimbursement_processed_files_project_file_name_idx');
        table.dropIndex(['project_id', 'file_hash', 'file_type'], 'reimbursement_processed_files_project_hash_type_idx');
    });

    await knex.schema.alterTable('reimbursement_processed_files', (table) => {
        table.unique(['project_id', 'file_name']);
    });
}

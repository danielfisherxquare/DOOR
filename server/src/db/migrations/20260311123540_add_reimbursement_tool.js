/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    const exists = await knex('tools').where({ name: '自动报销提取' }).first();
    if (!exists) {
        await knex('tools').insert({
            name: '自动报销提取',
            description: '大模型(AI)加持：上传发票和流水截图自动解析为带金额对齐的明细表',
            icon_type: 'lucide',
            icon_name: 'FileSpreadsheet',
            status: 'online',
            is_external: false,
            external_url: '/reimbursement'
        });
    }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    await knex('tools').where({ name: '自动报销提取' }).del();
}

/**
 * 补全 lottery_lists 的唯一约束
 * ================================
 *
 * 前序迁移 20260318000001 删除了基于明文 id_number 的旧唯一约束，
 * 但未创建基于 id_number_hash 的新唯一约束。
 * 这导致 bulkPutLists 的 onConflict 无法工作（报 500 错误）。
 *
 * 本迁移创建基于 (org_id, race_id, list_type, id_number_hash) 的唯一索引。
 */
export async function up(knex) {
    // 创建唯一索引（仅对非空 hash 值生效，null hash 可重复）
    await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS lottery_lists_org_race_type_hash_unique
        ON lottery_lists (org_id, race_id, list_type, id_number_hash)
        WHERE id_number_hash IS NOT NULL;
    `);

    console.log('[Migration] lottery_lists 唯一约束 (org_id, race_id, list_type, id_number_hash) 已创建');
}

export async function down(knex) {
    await knex.raw(`
        DROP INDEX IF EXISTS lottery_lists_org_race_type_hash_unique;
    `);
}

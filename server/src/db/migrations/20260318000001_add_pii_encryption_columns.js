/**
 * PII 加密列迁移
 * =================
 *
 * 为 records 和 lottery_lists 表添加盲索引列
 * 支持加密后的精确匹配查询
 *
 * 变更：
 * - records: 新增 phone_hash, id_number_hash 列
 * - lottery_lists: 新增 id_number_hash 列，修改唯一约束
 * - 删除引用明文字段的全文索引
 */
export async function up(knex) {
    // ── records 表 ─────────────────────────────────────────────────────
    // 新增盲索引列
    await knex.schema.alterTable('records', (table) => {
        table.string('phone_hash', 64).nullable().comment('手机号盲索引 (HMAC-SHA256)');
        table.string('id_number_hash', 64).nullable().comment('身份证号盲索引 (HMAC-SHA256)');
    });

    // 添加部分索引（仅非空值）
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS records_phone_hash_idx ON records (phone_hash) WHERE phone_hash IS NOT NULL;
        CREATE INDEX IF NOT EXISTS records_id_number_hash_idx ON records (id_number_hash) WHERE id_number_hash IS NOT NULL;
    `);

    // 删除旧的全文索引（引用明文字段）
    await knex.raw(`
        DROP INDEX IF EXISTS records_search_idx;
    `);

    // 重建仅面向 name 的搜索索引
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS records_name_search_idx ON records
        USING GIN (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(name_pinyin, '')));
    `);

    // 删除旧的 id_number B-Tree 索引（如果存在）
    await knex.raw(`
        DROP INDEX IF EXISTS records_id_number_idx;
    `);

    // ── lottery_lists 表 ────────────────────────────────────────────────
    // 新增盲索引列
    await knex.schema.alterTable('lottery_lists', (table) => {
        table.string('id_number_hash', 64).nullable().comment('身份证号盲索引 (HMAC-SHA256)');
    });

    // 添加部分索引（仅非空值）
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS lottery_lists_id_number_hash_idx ON lottery_lists (id_number_hash) WHERE id_number_hash IS NOT NULL;
    `);

    // 删除旧的基于明文 id_number 的唯一约束
    // 注意：这个约束名称需要根据实际情况调整
    await knex.raw(`
        ALTER TABLE lottery_lists DROP CONSTRAINT IF EXISTS lottery_lists_org_id_race_id_list_type_id_number_key;
    `);

    // 删除旧的 id_number B-Tree 索引（如果存在）
    await knex.raw(`
        DROP INDEX IF EXISTS lottery_lists_id_number_idx;
    `);

    // 注意：新的唯一约束将在数据迁移完成后创建
    // 因为现在 hash 列还是空的，不能立即创建 NOT NULL 约束

    console.log('[Migration] PII 加密列已添加，请在数据迁移后运行收尾迁移');
}

export async function down(knex) {
    // ── lottery_lists 回滚 ──────────────────────────────────────────────
    await knex.raw(`DROP INDEX IF EXISTS lottery_lists_id_number_hash_idx;`);
    await knex.schema.alterTable('lottery_lists', (table) => {
        table.dropColumn('id_number_hash');
    });

    // ── records 回滚 ────────────────────────────────────────────────────
    await knex.raw(`DROP INDEX IF EXISTS records_name_search_idx;`);
    await knex.raw(`DROP INDEX IF EXISTS records_id_number_hash_idx;`);
    await knex.raw(`DROP INDEX IF EXISTS records_phone_hash_idx;`);
    await knex.schema.alterTable('records', (table) => {
        table.dropColumn('id_number_hash');
        table.dropColumn('phone_hash');
    });

    // 重建旧的全文索引
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS records_search_idx ON records
        USING GIN (
            to_tsvector('simple',
                coalesce(name, '') || ' ' ||
                coalesce(name_pinyin, '') || ' ' ||
                coalesce(phone, '') || ' ' ||
                coalesce(id_number, '')
            )
        );
    `);

    console.log('[Migration] PII 加密列已回滚');
}
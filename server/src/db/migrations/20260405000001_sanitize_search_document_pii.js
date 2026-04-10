/**
 * 清理 search_document 生成列中的 PII
 * =================
 *
 * search_document 生成列原本引用了 id_number 和 phone 明文字段。
 * 在 20260318000001 迁移将它们加密后，这些值不再有意义。
 *
 * 变更：
 * 1. 删除旧的 search_document 生成列（包含 id_number + phone 明文）
 * 2. 删除旧的 records_search_document_idx GIN 索引
 * 3. 创建新的 search_document 生成列（仅包含 name + name_pinyin）
 * 4. 重建 GIN 索引
 * 5. 更新 bib-tracking 搜索逻辑以使用安全字段
 */
export async function up(knex) {
    // ── 1. 删除旧的 GIN 索引 ──────────────────────────────────────
    await knex.raw('DROP INDEX IF EXISTS records_search_document_idx');

    // ── 2. 删除旧的生成列（含 PII）──────────────────────────────
    const hasSearchDocument = await knex.schema.hasColumn('records', 'search_document');
    if (hasSearchDocument) {
        await knex.raw('ALTER TABLE records DROP COLUMN IF EXISTS search_document');
    }

    // ── 3. 重建安全的生成列（仅 name + name_pinyin）─────────────
    await knex.raw(`
        ALTER TABLE records
        ADD COLUMN search_document tsvector
        GENERATED ALWAYS AS (
            to_tsvector(
                'simple',
                coalesce(name, '') || ' ' || coalesce(name_pinyin, '')
            )
        ) STORED
    `);

    // ── 4. 重建 GIN 索引 ─────────────────────────────────────────
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS records_search_document_idx
        ON records
        USING gin (search_document)
    `);

    console.log('[Migration] search_document 已清除 PII（id_number, phone），仅保留 name + name_pinyin');
}

export async function down(knex) {
    // 回滚：恢复旧的包含 PII 的生成列（仅用于回滚，不推荐）
    await knex.raw('DROP INDEX IF EXISTS records_search_document_idx');

    const hasSearchDocument = await knex.schema.hasColumn('records', 'search_document');
    if (hasSearchDocument) {
        await knex.raw('ALTER TABLE records DROP COLUMN IF EXISTS search_document');
    }

    await knex.raw(`
        ALTER TABLE records
        ADD COLUMN search_document tsvector
        GENERATED ALWAYS AS (
            to_tsvector(
                'simple',
                coalesce(name, '') || ' ' || coalesce(id_number, '') || ' ' || coalesce(phone, '')
            )
        ) STORED
    `);

    await knex.raw(`
        CREATE INDEX IF NOT EXISTS records_search_document_idx
        ON records
        USING gin (search_document)
    `);

    console.log('[Migration] search_document 已回滚为包含 PII 的版本');
}

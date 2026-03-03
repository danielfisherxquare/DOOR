/**
 * Phase 4 — 导入会话表
 * import_sessions: 记录每次导入的元信息（摘要、状态等）
 * import_session_chunks: 按顺序存储清洗后的行数据块
 */

export async function up(knex) {
    // ── import_sessions ──────────────────────────────────
    await knex.schema.createTable('import_sessions', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.string('status', 20).notNullable().defaultTo('open');  // open | committed | cancelled
        t.integer('raw_count').notNullable().defaultTo(0);
        t.integer('total_rows').notNullable().defaultTo(0);
        t.jsonb('raw_preview');   // 前 50 行原始预览
        t.jsonb('stats');         // 清洗统计 { pinyin: N, country: N, ... }
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index('org_id');
        t.index('status');
    });

    // ── import_session_chunks ────────────────────────────
    await knex.schema.createTable('import_session_chunks', (t) => {
        t.increments('id').primary();
        t.uuid('session_id').notNullable()
            .references('id').inTable('import_sessions')
            .onDelete('CASCADE');
        t.integer('seq').notNullable();           // 块序号，从 0 开始递增
        t.jsonb('rows_data').notNullable();       // 存储行数组 [{...}, {...}, ...]
        t.integer('row_count').notNullable();     // 本块行数
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['session_id', 'seq']);
    });
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('import_session_chunks');
    await knex.schema.dropTableIfExists('import_sessions');
}

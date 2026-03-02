/**
 * Phase 2 — 选手报名记录表
 * 40+ 字段，与前端 DbRecord 接口 1:1 对齐 (snake_case 版)
 */

export async function up(knex) {
    await knex.schema.createTable('records', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.bigInteger('race_id').notNullable().references('id').inTable('races');

        // ── 基本信息 ──────────────────────────────────────
        t.text('name').notNullable().defaultTo('');
        t.text('name_pinyin').notNullable().defaultTo('');
        t.text('phone').notNullable().defaultTo('');
        t.text('country').notNullable().defaultTo('');
        t.text('id_type').notNullable().defaultTo('');
        t.text('id_number').notNullable().defaultTo('');
        t.text('gender').notNullable().defaultTo('');
        t.text('age').notNullable().defaultTo('');
        t.text('birthday').notNullable().defaultTo('');
        t.text('event').notNullable().defaultTo('');
        t.text('source').notNullable().defaultTo('');

        // ── 衣物与地址 ──────────────────────────────────
        t.text('clothing_size').notNullable().defaultTo('');
        t.text('province').notNullable().defaultTo('');
        t.text('city').notNullable().defaultTo('');
        t.text('district').notNullable().defaultTo('');
        t.text('address').notNullable().defaultTo('');
        t.text('email').notNullable().defaultTo('');

        // ── 紧急联系人 ──────────────────────────────────
        t.text('emergency_name').notNullable().defaultTo('');
        t.text('emergency_phone').notNullable().defaultTo('');
        t.text('blood_type').notNullable().defaultTo('');

        // ── 订单/状态 ────────────────────────────────────
        t.text('order_group_id').notNullable().defaultTo('');
        t.text('payment_status').notNullable().defaultTo('');
        t.text('mark').notNullable().defaultTo('');

        // ── 抽签相关 ────────────────────────────────────
        t.text('lottery_status').nullable();
        t.jsonb('personal_best_full').nullable();      // { raceName, netTime }
        t.jsonb('personal_best_half').nullable();      // { raceName, netTime }
        t.text('lottery_zone').nullable();

        // ── 物料/号码布 ─────────────────────────────────
        t.text('bag_window_no').nullable();
        t.text('bag_no').nullable();
        t.text('expo_window_no').nullable();
        t.text('bib_number').nullable();
        t.text('bib_color').nullable();

        // ── 来源追踪 ────────────────────────────────────
        t.text('_source').notNullable().defaultTo('');
        t.timestamp('_imported_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        // ── v3.0 新增字段 ───────────────────────────────
        t.text('runner_category').nullable();           // Mass/Elite/Permanent/Pacer/Medic/Sponsor
        t.text('audit_status').nullable();              // pending/pass/reject/review
        t.text('reject_reason').nullable();
        t.smallint('is_locked').nullable().defaultTo(0);
        t.text('region_type').nullable();               // Local_City/Local_Province/Domestic/International
        t.integer('duplicate_count').nullable().defaultTo(0);
        t.text('duplicate_sources').nullable();          // JSON

        // ── 时间戳 ──────────────────────────────────────
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        // ── 索引 ────────────────────────────────────────
        t.index(['org_id', 'race_id']);
        t.index('id_number');
        t.index('name');
    });

    // GIN 全文索引（支持关键词搜索）
    await knex.raw(`
    CREATE INDEX records_search_idx
    ON records
    USING gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(id_number,'') || ' ' || coalesce(phone,'')))
  `);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('records');
}

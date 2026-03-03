/**
 * Phase 6 — 抽签结果、快照、Bib 排号、执行日志
 *
 * 建表清单：
 *   1. lottery_results           – 抽签结果持久化
 *   2. pipeline_snapshots        – 快照头记录（pre_lottery / pre_bib）
 *   3. pipeline_snapshot_items   – 快照明细（字段子集 JSONB）
 *   4. bib_numbering_configs     – 排号编号配置（区间、前缀等）
 *   5. bib_assignments           – Bib 号码分配记录
 *   6. pipeline_executions       – Pipeline 执行日志
 *
 * 注意：
 *   - Electron 端另有 bib_layout_templates 表（PDF 排版模板），与此处
 *     bib_numbering_configs（排号编号配置）用途完全不同，请勿混淆。
 *   - Phase 5 已建 start_zones / performance_rules，此处不再重建。
 */

export async function up(knex) {
    // ─── 1. lottery_results ─────────────────────────────────────────
    await knex.schema.createTable('lottery_results', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable();
        t.integer('record_id').notNullable();
        t.string('result_status', 20).notNullable();             // 'winner' | 'loser' | 'waitlist'
        t.string('bucket_name', 100).notNullable().defaultTo('');
        t.integer('draw_order').notNullable().defaultTo(0);
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'race_id', 'record_id']);
        t.index(['org_id', 'race_id']);
    });

    await knex.raw(`
        ALTER TABLE lottery_results
        ADD CONSTRAINT lottery_results_status_check
        CHECK (result_status IN ('winner', 'loser', 'waitlist'))
    `);

    // ─── 2. pipeline_snapshots ──────────────────────────────────────
    await knex.schema.createTable('pipeline_snapshots', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable();
        t.string('snapshot_type', 30).notNullable();             // 'pre_lottery' | 'pre_bib'
        t.jsonb('snapshot_data').notNullable().defaultTo('{}');   // 全局统计元数据
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'race_id', 'snapshot_type']);
        t.index(['org_id', 'race_id']);
    });

    await knex.raw(`
        ALTER TABLE pipeline_snapshots
        ADD CONSTRAINT pipeline_snapshots_type_check
        CHECK (snapshot_type IN ('pre_lottery', 'pre_bib'))
    `);

    // ─── 3. pipeline_snapshot_items ─────────────────────────────────
    await knex.schema.createTable('pipeline_snapshot_items', (t) => {
        t.increments('id').primary();
        t.integer('snapshot_id').unsigned().notNullable()
            .references('id').inTable('pipeline_snapshots').onDelete('CASCADE');
        t.integer('record_id').notNullable();
        t.jsonb('field_data').notNullable();                     // { audit_status, lottery_status, ... }

        t.unique(['snapshot_id', 'record_id']);
        t.index('snapshot_id');
    });

    // ─── 4. bib_numbering_configs ───────────────────────────────────
    //   ⚠️ 与 Electron 端的 bib_layout_templates（PDF 排版模板）不同，
    //      此表用于排号的编号区间配置。
    await knex.schema.createTable('bib_numbering_configs', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable();
        t.string('event', 100).notNullable().defaultTo('');
        t.string('prefix', 20).notNullable().defaultTo('');
        t.integer('start_number').notNullable().defaultTo(1);
        t.integer('end_number').notNullable().defaultTo(9999);
        t.integer('padding').notNullable().defaultTo(4);
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'race_id', 'event']);
        t.index(['org_id', 'race_id']);
    });

    // ─── 5. bib_assignments ─────────────────────────────────────────
    await knex.schema.createTable('bib_assignments', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable();
        t.integer('record_id').notNullable();
        t.string('bib_number', 50).notNullable();
        t.timestamp('assigned_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'race_id', 'bib_number']);
        t.unique(['org_id', 'race_id', 'record_id']);
        t.index(['org_id', 'race_id']);
    });

    // ─── 6. pipeline_executions ─────────────────────────────────────
    await knex.schema.createTable('pipeline_executions', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable();
        t.string('execution_type', 50).notNullable();            // 'lottery' | 'bib_numbering' | 'rollback_lottery' | 'rollback_bib'
        t.string('status', 20).notNullable().defaultTo('running'); // 'running' | 'succeeded' | 'failed'
        t.jsonb('result').notNullable().defaultTo('{}');
        t.text('error');
        t.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('completed_at', { useTz: true });

        t.index(['org_id', 'race_id']);
        t.index(['org_id', 'race_id', 'execution_type', 'status']);
    });
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('pipeline_executions');
    await knex.schema.dropTableIfExists('bib_assignments');
    await knex.schema.dropTableIfExists('bib_numbering_configs');
    await knex.schema.dropTableIfExists('pipeline_snapshot_items');
    await knex.schema.dropTableIfExists('pipeline_snapshots');
    await knex.schema.dropTableIfExists('lottery_results');
}

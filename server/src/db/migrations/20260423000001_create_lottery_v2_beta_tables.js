/**
 * Lottery V2 Beta — 服装库存硬约束抽签
 *
 * 独立于 V1 lottery_results / pre_lottery snapshot。
 */

export async function up(knex) {
    await knex.schema.createTable('lottery_v2_configs', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable();
        t.string('apparel_scope_mode', 40).notNullable().defaultTo('gender_size');
        t.string('size_match_policy', 40).notNullable().defaultTo('exact');
        t.float('performance_ratio').notNullable().defaultTo(0.3);
        t.jsonb('gender_ratio').notNullable().defaultTo('{"M":0.6,"F":0.4}');
        t.string('region_dimension', 40).notNullable().defaultTo('province');
        t.jsonb('region_ratios').notNullable().defaultTo('{}');
        t.text('seed').notNullable().defaultTo('');
        t.string('fallback_strategy', 40).notNullable().defaultTo('same_pool');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'race_id']);
        t.index(['org_id', 'race_id']);
    });

    await knex.raw(`
        ALTER TABLE lottery_v2_configs
        ADD CONSTRAINT lottery_v2_configs_apparel_scope_check
        CHECK (apparel_scope_mode IN ('unisex_size', 'gender_size', 'event_gender_size'))
    `);

    await knex.raw(`
        ALTER TABLE lottery_v2_configs
        ADD CONSTRAINT lottery_v2_configs_size_match_check
        CHECK (size_match_policy IN ('exact'))
    `);

    await knex.schema.createTable('lottery_v2_snapshots', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable();
        t.string('status', 20).notNullable().defaultTo('ready');
        t.text('config_hash').notNullable().defaultTo('');
        t.text('seed').notNullable().defaultTo('');
        t.jsonb('payload').notNullable().defaultTo('{}');
        t.jsonb('errors').notNullable().defaultTo('[]');
        t.jsonb('warnings').notNullable().defaultTo('[]');
        t.jsonb('result_summary').notNullable().defaultTo('{}');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('finalized_at', { useTz: true }).nullable();
        t.timestamp('rolled_back_at', { useTz: true }).nullable();
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['org_id', 'race_id', 'status']);
        t.index(['org_id', 'race_id', 'created_at']);
    });

    await knex.raw(`
        ALTER TABLE lottery_v2_snapshots
        ADD CONSTRAINT lottery_v2_snapshots_status_check
        CHECK (status IN ('ready', 'blocked', 'stale', 'finalized', 'rolled_back'))
    `);

    await knex.schema.createTable('lottery_v2_results', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable();
        t.uuid('snapshot_id').notNullable()
            .references('id').inTable('lottery_v2_snapshots').onDelete('CASCADE');
        t.integer('record_id').notNullable();
        t.string('result_status', 20).notNullable();
        t.string('bucket_name', 200).notNullable().defaultTo('');
        t.integer('draw_order').notNullable().defaultTo(0);
        t.string('apparel_bucket', 200).notNullable().defaultTo('');
        t.jsonb('quota_path').notNullable().defaultTo('{}');
        t.text('reason').notNullable().defaultTo('');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['snapshot_id', 'record_id']);
        t.index(['org_id', 'race_id']);
        t.index(['org_id', 'race_id', 'result_status']);
    });

    await knex.raw(`
        ALTER TABLE lottery_v2_results
        ADD CONSTRAINT lottery_v2_results_status_check
        CHECK (result_status IN ('winner', 'loser', 'waitlist'))
    `);

    await knex.schema.createTable('apparel_reservations', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable();
        t.uuid('snapshot_id').nullable()
            .references('id').inTable('lottery_v2_snapshots').onDelete('CASCADE');
        t.integer('record_id').notNullable();
        t.string('reservation_type', 30).notNullable();
        t.string('event', 100).notNullable().defaultTo('');
        t.string('gender_bucket', 20).notNullable().defaultTo('');
        t.string('size', 40).notNullable().defaultTo('');
        t.string('apparel_bucket', 200).notNullable().defaultTo('');
        t.integer('quantity').notNullable().defaultTo(1);
        t.string('source', 80).notNullable().defaultTo('lottery_v2');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['snapshot_id', 'record_id', 'reservation_type']);
        t.index(['org_id', 'race_id']);
        t.index(['org_id', 'race_id', 'apparel_bucket']);
    });

    await knex.raw(`
        ALTER TABLE apparel_reservations
        ADD CONSTRAINT apparel_reservations_type_check
        CHECK (reservation_type IN ('direct', 'lottery'))
    `);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('apparel_reservations');
    await knex.schema.dropTableIfExists('lottery_v2_results');
    await knex.schema.dropTableIfExists('lottery_v2_snapshots');
    await knex.schema.dropTableIfExists('lottery_v2_configs');
}

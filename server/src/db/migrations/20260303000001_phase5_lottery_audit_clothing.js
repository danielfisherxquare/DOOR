/**
 * Phase 5 — 抽签配置、名单、库存、审核 + 出发区 / 成绩规则
 *
 * 建表清单：
 *   1. race_capacity       – 赛事容量目标 (CapacityPlanner)
 *   2. lottery_configs      – 分区/规格配置 (旧版兼容)
 *   3. lottery_lists        – 黑白名单
 *   4. lottery_rules        – 抽签分组规则
 *   5. lottery_weights      – 抽签权重
 *   6. audit_runs           – 审核运行记录
 *   7. audit_results        – 审核结果明细
 *   8. clothing_limits      – 服装库存
 *   9. start_zones          – 出发区 (补建)
 *  10. performance_rules    – 成绩规则 (补建)
 */

export async function up(knex) {
    // ─── 1. race_capacity ────────────────────────────────────────────
    await knex.schema.createTable('race_capacity', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable();
        t.string('event', 100).notNullable().defaultTo('');
        t.integer('target_count').notNullable().defaultTo(0);
        t.float('draw_ratio').notNullable().defaultTo(0.85);
        t.float('reserved_ratio').notNullable().defaultTo(0.15);
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'race_id', 'event']);
        t.index(['org_id', 'race_id']);
    });

    // ─── 2. lottery_configs ──────────────────────────────────────────
    await knex.schema.createTable('lottery_configs', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable();
        t.string('zone', 100).nullable();
        t.string('event_type', 100).nullable();
        t.integer('capacity').notNullable().defaultTo(0);
        t.jsonb('rules').notNullable().defaultTo('[]');
        t.string('calc_type', 20).notNullable().defaultTo('manual');
        t.float('length').notNullable().defaultTo(0);
        t.float('width').notNullable().defaultTo(0);
        t.string('color', 50).notNullable().defaultTo('#3B82F6');
        t.integer('design_capacity').notNullable().defaultTo(0);
        t.float('interval_gap').notNullable().defaultTo(0);
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['org_id', 'race_id']);
    });

    // ─── 3. lottery_lists ────────────────────────────────────────────
    await knex.schema.createTable('lottery_lists', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable();
        t.string('list_type', 20).notNullable();              // 'whitelist' | 'blacklist'
        t.string('name', 200).notNullable().defaultTo('');
        t.string('id_number', 100).notNullable().defaultTo('');
        t.string('phone', 50).notNullable().defaultTo('');
        t.integer('matched_record_id').nullable();
        t.string('match_type', 20).nullable();                // 'exact' | 'fuzzy'
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'race_id', 'list_type', 'id_number']);
        t.index(['org_id', 'race_id', 'list_type']);
        t.index('id_number');
        t.index('matched_record_id');
    });

    await knex.raw(`
        ALTER TABLE lottery_lists
        ADD CONSTRAINT lottery_lists_list_type_check
        CHECK (list_type IN ('whitelist', 'blacklist'))
    `);

    // ─── 4. lottery_rules ────────────────────────────────────────────
    await knex.schema.createTable('lottery_rules', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable();
        t.string('target_group', 100).notNullable().defaultTo('');
        t.integer('target_count').notNullable().defaultTo(0);
        t.float('draw_ratio').notNullable().defaultTo(0.85);
        t.float('reserved_ratio').notNullable().defaultTo(0.15);
        t.text('gender_ratio').notNullable().defaultTo('');
        t.text('region_ratio').notNullable().defaultTo('');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'race_id', 'target_group']);
        t.index(['org_id', 'race_id']);
    });

    // ─── 5. lottery_weights ──────────────────────────────────────────
    await knex.schema.createTable('lottery_weights', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable();
        t.string('target_group', 50).notNullable().defaultTo('ALL');
        t.string('weight_type', 50).notNullable().defaultTo('gender');
        t.integer('enabled').notNullable().defaultTo(0);
        t.jsonb('weight_config').notNullable().defaultTo('{}');
        t.integer('priority').notNullable().defaultTo(0);
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'race_id', 'target_group', 'weight_type']);
        t.index(['race_id', 'enabled']);
    });

    // ─── 6. audit_runs ──────────────────────────────────────────────
    await knex.schema.createTable('audit_runs', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable();
        t.integer('step_number').notNullable();               // 1-5
        t.string('step_name', 100).notNullable();             // underage / blacklist / fake_elite / direct_lock / mass_pool
        t.string('status', 20).notNullable().defaultTo('pending');
        t.integer('affected').notNullable().defaultTo(0);
        t.integer('remaining').notNullable().defaultTo(0);
        t.text('error').nullable();
        t.timestamp('executed_at', { useTz: true }).nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['org_id', 'race_id']);
    });

    await knex.raw(`
        ALTER TABLE audit_runs
        ADD CONSTRAINT audit_runs_status_check
        CHECK (status IN ('pending', 'running', 'completed', 'failed'))
    `);

    // ─── 7. audit_results ───────────────────────────────────────────
    await knex.schema.createTable('audit_results', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable();
        t.integer('run_id').nullable().references('id').inTable('audit_runs').onDelete('SET NULL');
        t.integer('record_id').notNullable();
        t.string('action', 50).notNullable();                 // reject / lock / pass / pool
        t.string('reason', 200).nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index('run_id');
        t.index(['org_id', 'race_id']);
    });

    // ─── 8. clothing_limits ─────────────────────────────────────────
    await knex.schema.createTable('clothing_limits', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable();
        t.string('event', 100).notNullable().defaultTo('');
        t.string('gender', 10).notNullable().defaultTo('');
        t.string('size', 20).notNullable().defaultTo('');
        t.integer('total_inventory').notNullable().defaultTo(0);
        t.integer('used_count').notNullable().defaultTo(0);
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'race_id', 'event', 'gender', 'size']);
        t.index(['org_id', 'race_id']);
    });

    // ─── 9. start_zones (补建，Phase 4 遗留) ────────────────────────
    if (!(await knex.schema.hasTable('start_zones'))) {
        await knex.schema.createTable('start_zones', (t) => {
            t.increments('id').primary();
            t.uuid('org_id').notNullable().references('id').inTable('organizations');
            t.integer('race_id').notNullable();
            t.string('zone_name', 100).notNullable().defaultTo('');
            t.float('width').notNullable().defaultTo(10);
            t.float('length').notNullable().defaultTo(20);
            t.float('density').notNullable().defaultTo(2.5);
            t.integer('calculated_capacity').notNullable().defaultTo(0);
            t.string('color', 50).notNullable().defaultTo('#3B82F6');
            t.integer('sort_order').notNullable().defaultTo(0);
            t.float('gap_distance').notNullable().defaultTo(0);
            t.string('event', 100).notNullable().defaultTo('');
            t.float('capacity_ratio').notNullable().defaultTo(1);
            t.integer('score_upper_seconds').nullable();
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            t.unique(['org_id', 'race_id', 'zone_name']);
            t.index(['org_id', 'race_id']);
        });
    }

    // ─── 10. performance_rules (补建，Phase 4 遗留) ──────────────────
    if (!(await knex.schema.hasTable('performance_rules'))) {
        await knex.schema.createTable('performance_rules', (t) => {
            t.increments('id').primary();
            t.uuid('org_id').notNullable().references('id').inTable('organizations');
            t.integer('race_id').notNullable();
            t.string('event', 100).notNullable().defaultTo('');
            t.string('min_time', 20).notNullable().defaultTo('');
            t.string('max_time', 20).notNullable().defaultTo('');
            t.float('priority_ratio').notNullable().defaultTo(0.6);
            t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            t.unique(['org_id', 'race_id', 'event']);
            t.index(['org_id', 'race_id']);
        });
    }
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('performance_rules');
    await knex.schema.dropTableIfExists('start_zones');
    await knex.schema.dropTableIfExists('clothing_limits');
    await knex.schema.dropTableIfExists('audit_results');
    await knex.schema.dropTableIfExists('audit_runs');
    await knex.schema.dropTableIfExists('lottery_weights');
    await knex.schema.dropTableIfExists('lottery_rules');
    await knex.schema.dropTableIfExists('lottery_lists');
    await knex.schema.dropTableIfExists('lottery_configs');
    await knex.schema.dropTableIfExists('race_capacity');
}

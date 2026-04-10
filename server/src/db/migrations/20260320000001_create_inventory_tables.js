/**
 * 仓储管理系统 — 创建库存相关表
 *
 * 建表清单：
 *   1. org_inventory_batches    – 机构物资批次
 *   2. org_inventory_units      – 机构物资单元（每件物资一个二维码）
 *   3. warehouses               – 仓库
 *   4. warehouse_locations      – 库位
 *   5. race_material_requests   – 赛事物资申请
 *   6. inventory_transactions   – 物资流转记录
 *   7. inventory_alert_rules    – 库存预警规则
 *   8. inventory_alerts         – 库存预警记录
 *   9. stocktaking_plans        – 盘点计划
 *  10. stocktaking_records      – 盘点记录
 */

export async function up(knex) {
    // ─── 1. org_inventory_batches ────────────────────────────────────
    await knex.schema.createTable('org_inventory_batches', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.string('batch_name', 100).notNullable();
        t.string('batch_type', 50).notNullable();  // clothing/medal/bag/other
        t.string('supplier', 200).nullable();
        t.date('purchase_date').nullable();
        t.integer('total_quantity').notNullable().defaultTo(0);
        t.string('status', 20).notNullable().defaultTo('draft');  // draft/active/archived
        t.uuid('created_by').nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['org_id', 'batch_type']);
    });

    // ─── 2. warehouses ───────────────────────────────────────────────
    await knex.schema.createTable('warehouses', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.string('code', 50).notNullable();
        t.string('name', 100).notNullable();
        t.text('address').nullable();
        t.string('contact', 100).nullable();
        t.boolean('is_default').notNullable().defaultTo(false);
        t.string('status', 20).notNullable().defaultTo('active');  // active/inactive
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'code']);
        t.index(['org_id']);
    });

    // ─── 3. warehouse_locations ──────────────────────────────────────
    await knex.schema.createTable('warehouse_locations', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('warehouse_id').notNullable().references('id').inTable('warehouses').onDelete('CASCADE');
        t.string('code', 50).notNullable();  // A-01-03-02
        t.string('zone', 50).nullable();  // A区
        t.string('aisle', 50).nullable();  // 01货架
        t.string('shelf', 50).nullable();  // 03层
        t.string('position', 50).nullable();  // 02位
        t.string('qr_code', 100).nullable().unique();
        t.integer('capacity').notNullable().defaultTo(0);
        t.integer('used_capacity').notNullable().defaultTo(0);
        t.jsonb('item_types').nullable();  // ["clothing","medal"]
        t.string('status', 20).notNullable().defaultTo('empty');  // empty/partial/full/locked
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['warehouse_id', 'code']);
        t.index(['org_id', 'warehouse_id']);
    });

    // ─── 4. org_inventory_units ──────────────────────────────────────
    await knex.schema.createTable('org_inventory_units', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('batch_id').notNullable().references('id').inTable('org_inventory_batches').onDelete('CASCADE');
        t.string('qr_code', 100).notNullable().unique();
        t.string('item_type', 50).notNullable();  // clothing/medal/bag
        t.string('item_category', 50).nullable();  // tshirt/jacket/medal_finisher
        t.jsonb('item_spec').nullable();  // {"size":"L","gender":"M","color":"blue"}
        t.string('status', 20).notNullable().defaultTo('in_stock');  // in_stock/allocated/picked/returned/damaged/lost
        t.string('current_holder_type', 20).notNullable().defaultTo('org');  // org/race/runner
        t.string('current_holder_id', 36).nullable();
        t.integer('warehouse_id').nullable().references('id').inTable('warehouses');
        t.integer('location_id').nullable().references('id').inTable('warehouse_locations');
        t.timestamp('allocated_at', { useTz: true }).nullable();
        t.timestamp('picked_at', { useTz: true }).nullable();
        t.string('picked_by', 100).nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['org_id', 'batch_id']);
        t.index(['org_id', 'status']);
        t.index(['org_id', 'item_type']);
        t.index(['qr_code']);
    });

    // ─── 5. race_material_requests ───────────────────────────────────
    await knex.schema.createTable('race_material_requests', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('race_id').notNullable();
        t.string('item_type', 50).notNullable();
        t.jsonb('item_spec').notNullable();  // {"size":"L","gender":"M"}
        t.integer('requested_quantity').notNullable();
        t.integer('approved_quantity').notNullable().defaultTo(0);
        t.integer('allocated_quantity').notNullable().defaultTo(0);
        t.string('status', 20).notNullable().defaultTo('pending');  // pending/approved/rejected/fulfilled
        t.uuid('approved_by').nullable();
        t.timestamp('approved_at', { useTz: true }).nullable();
        t.text('remarks').nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['org_id', 'race_id']);
        t.index(['org_id', 'status']);
    });

    // ─── 6. inventory_transactions ───────────────────────────────────
    await knex.schema.createTable('inventory_transactions', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.bigInteger('unit_id').notNullable().references('id').inTable('org_inventory_units');
        t.string('transaction_type', 20).notNullable();  // inbound/allocate/pickup/return/damage/transfer
        t.string('from_holder_type', 20).nullable();  // org/race/runner/external
        t.string('from_holder_id', 36).nullable();
        t.string('to_holder_type', 20).nullable();
        t.string('to_holder_id', 36).nullable();
        t.uuid('operator_id').nullable();
        t.string('operator_name', 100).nullable();
        t.text('remarks').nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['org_id', 'unit_id']);
        t.index(['org_id', 'transaction_type']);
        t.index(['org_id', 'created_at']);
    });

    // ─── 7. inventory_alert_rules ────────────────────────────────────
    await knex.schema.createTable('inventory_alert_rules', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.string('rule_type', 20).notNullable();  // low_stock/expiring/slow_moving/abnormal_loss
        t.string('item_type', 50).nullable();
        t.string('item_category', 50).nullable();
        t.decimal('threshold_value', 10, 2).notNullable();
        t.string('threshold_type', 20).notNullable();  // quantity/percentage/days
        t.jsonb('notify_channels').notNullable().defaultTo('["in_app"]');  // ["in_app","email","sms"]
        t.jsonb('notify_users').nullable();
        t.boolean('is_enabled').notNullable().defaultTo(true);
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['org_id', 'rule_type']);
    });

    // ─── 8. inventory_alerts ─────────────────────────────────────────
    await knex.schema.createTable('inventory_alerts', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('rule_id').nullable().references('id').inTable('inventory_alert_rules');
        t.string('alert_type', 20).notNullable();
        t.string('severity', 20).notNullable().defaultTo('warning');  // info/warning/critical
        t.string('title', 200).notNullable();
        t.text('content').nullable();
        t.bigInteger('related_unit_id').nullable();
        t.integer('related_batch_id').nullable();
        t.boolean('is_read').notNullable().defaultTo(false);
        t.boolean('is_resolved').notNullable().defaultTo(false);
        t.uuid('resolved_by').nullable();
        t.timestamp('resolved_at', { useTz: true }).nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['org_id', 'is_read']);
        t.index(['org_id', 'created_at']);
    });

    // ─── 9. stocktaking_plans ────────────────────────────────────────
    await knex.schema.createTable('stocktaking_plans', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('warehouse_id').nullable().references('id').inTable('warehouses');
        t.string('plan_name', 100).notNullable();
        t.string('plan_type', 20).notNullable().defaultTo('full');  // full/partial/dynamic
        t.jsonb('scope').nullable();  // {"item_types":["clothing"],"locations":["A区"]}
        t.string('status', 20).notNullable().defaultTo('draft');  // draft/in_progress/completed/cancelled
        t.integer('total_items').notNullable().defaultTo(0);
        t.integer('counted_items').notNullable().defaultTo(0);
        t.integer('diff_items').notNullable().defaultTo(0);
        t.timestamp('started_at', { useTz: true }).nullable();
        t.timestamp('completed_at', { useTz: true }).nullable();
        t.uuid('created_by').nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['org_id', 'status']);
    });

    // ─── 10. stocktaking_records ─────────────────────────────────────
    await knex.schema.createTable('stocktaking_records', (t) => {
        t.bigIncrements('id').primary();
        t.integer('plan_id').notNullable().references('id').inTable('stocktaking_plans').onDelete('CASCADE');
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.bigInteger('unit_id').nullable().references('id').inTable('org_inventory_units');
        t.string('qr_code', 100).nullable();
        t.string('expected_location', 100).nullable();
        t.string('actual_location', 100).nullable();
        t.string('expected_status', 50).nullable();
        t.string('actual_status', 50).nullable();
        t.integer('system_quantity').notNullable().defaultTo(1);
        t.integer('actual_quantity').nullable();
        t.boolean('is_matched').nullable();
        t.string('diff_reason', 200).nullable();
        t.uuid('counted_by').nullable();
        t.timestamp('counted_at', { useTz: true }).nullable();

        t.index(['plan_id']);
        t.index(['org_id', 'unit_id']);
    });
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('stocktaking_records');
    await knex.schema.dropTableIfExists('stocktaking_plans');
    await knex.schema.dropTableIfExists('inventory_alerts');
    await knex.schema.dropTableIfExists('inventory_alert_rules');
    await knex.schema.dropTableIfExists('inventory_transactions');
    await knex.schema.dropTableIfExists('race_material_requests');
    await knex.schema.dropTableIfExists('org_inventory_units');
    await knex.schema.dropTableIfExists('warehouse_locations');
    await knex.schema.dropTableIfExists('warehouses');
    await knex.schema.dropTableIfExists('org_inventory_batches');
}

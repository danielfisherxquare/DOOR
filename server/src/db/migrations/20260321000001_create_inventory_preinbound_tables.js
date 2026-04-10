export async function up(knex) {
    await knex.schema.createTable('inventory_preinbound_orders', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.string('reference_no', 64).notNullable();
        t.string('item_name', 200).notNullable();
        t.string('item_type', 50).notNullable().defaultTo('other');
        t.string('item_category', 100).nullable();
        t.jsonb('item_spec').nullable();
        t.integer('planned_quantity').notNullable().defaultTo(0);
        t.integer('confirmed_quantity').notNullable().defaultTo(0);
        t.string('supplier', 200).nullable();
        t.string('owner_name', 100).nullable();
        t.string('contact_name', 100).nullable();
        t.string('contact_phone', 50).nullable();
        t.date('expected_arrival_date').nullable();
        t.string('current_stage', 32).notNullable().defaultTo('pending');
        t.string('priority', 20).notNullable().defaultTo('normal');
        t.integer('linked_batch_id').nullable().references('id').inTable('org_inventory_batches').onDelete('SET NULL');
        t.text('remarks').nullable();
        t.uuid('created_by').nullable();
        t.timestamp('completed_at', { useTz: true }).nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'reference_no']);
        t.index(['org_id', 'current_stage']);
        t.index(['org_id', 'priority']);
        t.index(['org_id', 'expected_arrival_date']);
    });

    await knex.schema.createTable('inventory_preinbound_logs', (t) => {
        t.bigIncrements('id').primary();
        t.integer('order_id').notNullable().references('id').inTable('inventory_preinbound_orders').onDelete('CASCADE');
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.string('action_type', 32).notNullable();
        t.string('from_stage', 32).nullable();
        t.string('to_stage', 32).nullable();
        t.text('note').nullable();
        t.jsonb('metadata').nullable();
        t.uuid('operator_id').nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['org_id', 'order_id']);
        t.index(['org_id', 'action_type']);
        t.index(['order_id', 'created_at']);
    });
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('inventory_preinbound_logs');
    await knex.schema.dropTableIfExists('inventory_preinbound_orders');
}

export async function up(knex) {
    await knex.schema.createTable('bib_tracking_items', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        t.bigInteger('record_id').notNullable().references('id').inTable('records').onDelete('CASCADE');
        t.text('bib_number').notNullable();
        t.text('qr_token').notNullable().unique();
        t.integer('qr_version').notNullable().defaultTo(1);
        t.text('status').notNullable();
        t.timestamp('receipt_printed_at', { useTz: true });
        t.timestamp('picked_up_at', { useTz: true });
        t.timestamp('checked_in_at', { useTz: true });
        t.timestamp('finished_at', { useTz: true });
        t.timestamp('last_scan_at', { useTz: true });
        t.uuid('last_scan_by').references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('invalidated_at', { useTz: true });
        t.text('external_sync_source');
        t.jsonb('external_sync_payload');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'race_id', 'record_id']);
        t.unique(['org_id', 'race_id', 'bib_number']);
        t.index(['org_id', 'race_id']);
        t.index(['race_id', 'status']);
    });

    await knex.raw(`
        ALTER TABLE bib_tracking_items
        ADD CONSTRAINT bib_tracking_items_status_check
        CHECK (status IN ('receipt_printed', 'picked_up', 'checked_in', 'finished'))
    `);

    await knex.schema.createTable('bib_tracking_events', (t) => {
        t.bigIncrements('id').primary();
        t.bigInteger('tracking_item_id').notNullable()
            .references('id').inTable('bib_tracking_items').onDelete('CASCADE');
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        t.bigInteger('record_id').notNullable().references('id').inTable('records').onDelete('CASCADE');
        t.text('event_type').notNullable();
        t.text('from_status');
        t.text('to_status').notNullable();
        t.uuid('operator_user_id').references('id').inTable('users').onDelete('SET NULL');
        t.text('operator_device');
        t.text('source').notNullable();
        t.jsonb('payload').notNullable().defaultTo('{}');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['tracking_item_id', 'created_at']);
        t.index(['org_id', 'race_id', 'created_at']);
    });
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('bib_tracking_events');
    await knex.schema.dropTableIfExists('bib_tracking_items');
}

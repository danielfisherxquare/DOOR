export async function up(knex) {
    if (await knex.schema.hasTable('bib_tracking_items')) {
        if (!(await knex.schema.hasColumn('bib_tracking_items', 'qr_version'))) {
            await knex.schema.alterTable('bib_tracking_items', (t) => {
                t.integer('qr_version').notNullable().defaultTo(1);
            });
        }

        if (!(await knex.schema.hasColumn('bib_tracking_items', 'receipt_printed_at'))) {
            await knex.schema.alterTable('bib_tracking_items', (t) => {
                t.timestamp('receipt_printed_at', { useTz: true });
            });
        }

        if (!(await knex.schema.hasColumn('bib_tracking_items', 'picked_up_at'))) {
            await knex.schema.alterTable('bib_tracking_items', (t) => {
                t.timestamp('picked_up_at', { useTz: true });
            });
        }

        if (!(await knex.schema.hasColumn('bib_tracking_items', 'checked_in_at'))) {
            await knex.schema.alterTable('bib_tracking_items', (t) => {
                t.timestamp('checked_in_at', { useTz: true });
            });
        }

        if (!(await knex.schema.hasColumn('bib_tracking_items', 'finished_at'))) {
            await knex.schema.alterTable('bib_tracking_items', (t) => {
                t.timestamp('finished_at', { useTz: true });
            });
        }

        if (!(await knex.schema.hasColumn('bib_tracking_items', 'last_scan_at'))) {
            await knex.schema.alterTable('bib_tracking_items', (t) => {
                t.timestamp('last_scan_at', { useTz: true });
            });
        }

        if (!(await knex.schema.hasColumn('bib_tracking_items', 'last_scan_by'))) {
            await knex.schema.alterTable('bib_tracking_items', (t) => {
                t.uuid('last_scan_by').references('id').inTable('users').onDelete('SET NULL');
            });
        }

        if (!(await knex.schema.hasColumn('bib_tracking_items', 'invalidated_at'))) {
            await knex.schema.alterTable('bib_tracking_items', (t) => {
                t.timestamp('invalidated_at', { useTz: true });
            });
        }

        if (!(await knex.schema.hasColumn('bib_tracking_items', 'external_sync_source'))) {
            await knex.schema.alterTable('bib_tracking_items', (t) => {
                t.text('external_sync_source');
            });
        }

        if (!(await knex.schema.hasColumn('bib_tracking_items', 'external_sync_payload'))) {
            await knex.schema.alterTable('bib_tracking_items', (t) => {
                t.jsonb('external_sync_payload').defaultTo('{}');
            });
        }

        if (!(await knex.schema.hasColumn('bib_tracking_items', 'created_at'))) {
            await knex.schema.alterTable('bib_tracking_items', (t) => {
                t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            });
        }

        if (!(await knex.schema.hasColumn('bib_tracking_items', 'updated_at'))) {
            await knex.schema.alterTable('bib_tracking_items', (t) => {
                t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            });
        }
    }

    if (await knex.schema.hasTable('bib_tracking_events')) {
        if (!(await knex.schema.hasColumn('bib_tracking_events', 'operator_user_id'))) {
            await knex.schema.alterTable('bib_tracking_events', (t) => {
                t.uuid('operator_user_id').references('id').inTable('users').onDelete('SET NULL');
            });
        }

        if (!(await knex.schema.hasColumn('bib_tracking_events', 'source'))) {
            await knex.schema.alterTable('bib_tracking_events', (t) => {
                t.text('source').notNullable().defaultTo('unknown');
            });
        }

        if (!(await knex.schema.hasColumn('bib_tracking_events', 'payload'))) {
            await knex.schema.alterTable('bib_tracking_events', (t) => {
                t.jsonb('payload').notNullable().defaultTo('{}');
            });
        }
    }
}

export async function down() {}

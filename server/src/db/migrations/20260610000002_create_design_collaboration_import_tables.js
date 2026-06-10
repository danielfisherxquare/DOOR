export async function up(knex) {
    const hasSourceType = await knex.schema.hasColumn('design_requests', 'source_type');
    if (!hasSourceType) {
        await knex.schema.alterTable('design_requests', (table) => {
            table.text('source_type').notNullable().defaultTo('manual');
        });
        await knex('design_requests').whereNull('source_type').update({ source_type: 'manual' });
        await knex.schema.alterTable('design_requests', (table) => {
            table.index(['source_type']);
        });
    }

    const importsExists = await knex.schema.hasTable('design_collaboration_imports');
    if (!importsExists) {
        await knex.schema.createTable('design_collaboration_imports', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
            table.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
            table.text('event_type').notNullable().defaultTo('general');
            table.text('file_name').notNullable();
            table.text('file_hash').notNullable();
            table.text('sheet_name');
            table.text('status').notNullable().defaultTo('parsed');
            table.integer('row_count').notNullable().defaultTo(0);
            table.integer('design_count').notNullable().defaultTo(0);
            table.integer('ready_count').notNullable().defaultTo(0);
            table.integer('needs_info_count').notNullable().defaultTo(0);
            table.integer('synced_count').notNullable().defaultTo(0);
            table.jsonb('issue_summary_json').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
            table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['org_id', 'race_id']);
            table.index(['race_id', 'status']);
            table.index(['file_hash']);
        });
    }

    const itemsExists = await knex.schema.hasTable('design_collaboration_items');
    if (!itemsExists) {
        await knex.schema.createTable('design_collaboration_items', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('import_id').notNullable().references('id').inTable('design_collaboration_imports').onDelete('CASCADE');
            table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
            table.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
            table.integer('excel_row_number').notNullable();
            table.text('row_hash').notNullable();
            table.text('area');
            table.text('supplier');
            table.text('category');
            table.text('item_name');
            table.text('build_material');
            table.text('craft');
            table.text('build_size');
            table.decimal('quantity', 14, 4);
            table.text('unit');
            table.decimal('unit_price', 14, 2);
            table.decimal('total_price', 14, 2);
            table.text('build_note');
            table.boolean('needs_design').notNullable().defaultTo(false);
            table.text('requester_department');
            table.text('requester_name');
            table.timestamp('due_at', { useTz: true });
            table.text('priority').notNullable().defaultTo('normal');
            table.text('design_material');
            table.text('design_size');
            table.text('design_note');
            table.text('reference_image');
            table.text('reference_note');
            table.text('sync_status').notNullable().defaultTo('ignored');
            table.jsonb('sync_issues_json').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
            table.uuid('design_request_id').references('id').inTable('design_requests').onDelete('SET NULL');
            table.jsonb('raw_json').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.unique(['import_id', 'excel_row_number']);
            table.index(['import_id']);
            table.index(['org_id', 'race_id']);
            table.index(['race_id', 'sync_status']);
            table.index(['needs_design']);
            table.index(['design_request_id']);
            table.index(['row_hash']);
        });
    }
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('design_collaboration_items');
    await knex.schema.dropTableIfExists('design_collaboration_imports');
    const hasSourceType = await knex.schema.hasColumn('design_requests', 'source_type');
    if (hasSourceType) {
        await knex.schema.alterTable('design_requests', (table) => {
            table.dropIndex(['source_type']);
            table.dropColumn('source_type');
        });
    }
}

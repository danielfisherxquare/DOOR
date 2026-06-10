export async function up(knex) {
    const importsHasNewCount = await knex.schema.hasColumn('design_collaboration_imports', 'new_count');
    if (!importsHasNewCount) {
        await knex.schema.alterTable('design_collaboration_imports', (table) => {
            table.integer('new_count').notNullable().defaultTo(0);
            table.integer('changed_count').notNullable().defaultTo(0);
            table.integer('unchanged_count').notNullable().defaultTo(0);
            table.integer('new_category_count').notNullable().defaultTo(0);
        });
    }

    const itemsHasStableKey = await knex.schema.hasColumn('design_collaboration_items', 'stable_key');
    if (!itemsHasStableKey) {
        await knex.schema.alterTable('design_collaboration_items', (table) => {
            table.text('stable_key');
            table.text('content_hash');
            table.text('change_type').notNullable().defaultTo('new');
            table.timestamp('first_seen_at', { useTz: true });
            table.timestamp('last_changed_at', { useTz: true });
            table.index(['race_id', 'stable_key']);
            table.index(['race_id', 'change_type']);
            table.index(['first_seen_at']);
            table.index(['last_changed_at']);
        });
    }

    const snapshotsExists = await knex.schema.hasTable('design_collaboration_item_snapshots');
    if (!snapshotsExists) {
        await knex.schema.createTable('design_collaboration_item_snapshots', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
            table.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
            table.text('event_type').notNullable().defaultTo('general');
            table.text('stable_key').notNullable();
            table.text('content_hash').notNullable();
            table.uuid('last_import_id').references('id').inTable('design_collaboration_imports').onDelete('SET NULL');
            table.uuid('last_item_id').references('id').inTable('design_collaboration_items').onDelete('SET NULL');
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
            table.jsonb('raw_json').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
            table.timestamp('first_seen_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('last_changed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.unique(['org_id', 'race_id', 'stable_key']);
            table.index(['org_id', 'race_id']);
            table.index(['race_id', 'event_type']);
            table.index(['race_id', 'area', 'category']);
            table.index(['first_seen_at']);
            table.index(['last_changed_at']);
        });
    }

    const exportsExists = await knex.schema.hasTable('design_collaboration_exports');
    if (!exportsExists) {
        await knex.schema.createTable('design_collaboration_exports', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
            table.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
            table.text('event_type').notNullable().defaultTo('general');
            table.integer('round_no').notNullable();
            table.text('mode').notNullable();
            table.uuid('baseline_export_id').references('id').inTable('design_collaboration_exports').onDelete('SET NULL');
            table.text('file_name').notNullable();
            table.text('status').notNullable().defaultTo('generated');
            table.integer('row_count').notNullable().defaultTo(0);
            table.integer('new_count').notNullable().defaultTo(0);
            table.integer('changed_count').notNullable().defaultTo(0);
            table.integer('unchanged_count').notNullable().defaultTo(0);
            table.integer('new_category_count').notNullable().defaultTo(0);
            table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.unique(['org_id', 'race_id', 'round_no']);
            table.index(['org_id', 'race_id']);
            table.index(['race_id', 'event_type']);
            table.index(['mode']);
        });
    }

    const exportItemsExists = await knex.schema.hasTable('design_collaboration_export_items');
    if (!exportItemsExists) {
        await knex.schema.createTable('design_collaboration_export_items', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('export_id').notNullable().references('id').inTable('design_collaboration_exports').onDelete('CASCADE');
            table.uuid('snapshot_id').references('id').inTable('design_collaboration_item_snapshots').onDelete('SET NULL');
            table.text('stable_key');
            table.text('content_hash');
            table.text('change_type').notNullable().defaultTo('unchanged');
            table.timestamp('first_seen_at', { useTz: true });
            table.timestamp('last_changed_at', { useTz: true });
            table.jsonb('row_json').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['export_id']);
            table.index(['stable_key']);
            table.index(['change_type']);
        });
    }
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('design_collaboration_export_items');
    await knex.schema.dropTableIfExists('design_collaboration_exports');
    await knex.schema.dropTableIfExists('design_collaboration_item_snapshots');

    const itemsHasStableKey = await knex.schema.hasColumn('design_collaboration_items', 'stable_key');
    if (itemsHasStableKey) {
        await knex.schema.alterTable('design_collaboration_items', (table) => {
            table.dropIndex(['race_id', 'stable_key']);
            table.dropIndex(['race_id', 'change_type']);
            table.dropIndex(['first_seen_at']);
            table.dropIndex(['last_changed_at']);
            table.dropColumn('stable_key');
            table.dropColumn('content_hash');
            table.dropColumn('change_type');
            table.dropColumn('first_seen_at');
            table.dropColumn('last_changed_at');
        });
    }

    const importsHasNewCount = await knex.schema.hasColumn('design_collaboration_imports', 'new_count');
    if (importsHasNewCount) {
        await knex.schema.alterTable('design_collaboration_imports', (table) => {
            table.dropColumn('new_count');
            table.dropColumn('changed_count');
            table.dropColumn('unchanged_count');
            table.dropColumn('new_category_count');
        });
    }
}

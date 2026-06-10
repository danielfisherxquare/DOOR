export async function up(knex) {
    const templatesExists = await knex.schema.hasTable('design_request_templates');
    if (!templatesExists) {
        await knex.schema.createTable('design_request_templates', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('org_id').references('id').inTable('organizations').onDelete('CASCADE');
            table.bigInteger('race_id').references('id').inTable('races').onDelete('CASCADE');
            table.text('event_type').notNullable().defaultTo('general');
            table.text('name').notNullable();
            table.text('description');
            table.jsonb('fields_json').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
            table.jsonb('sample_payload_json').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
            table.uuid('source_request_id');
            table.boolean('is_default').notNullable().defaultTo(false);
            table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['org_id', 'race_id']);
            table.index(['event_type']);
            table.index(['is_default']);
        });
    }

    const requestsExists = await knex.schema.hasTable('design_requests');
    if (!requestsExists) {
        await knex.schema.createTable('design_requests', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
            table.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
            table.uuid('template_id').references('id').inTable('design_request_templates').onDelete('SET NULL');
            table.text('event_type').notNullable().defaultTo('general');
            table.text('requester_department').notNullable();
            table.text('requester_name').notNullable();
            table.text('title').notNullable();
            table.text('requirement_text').notNullable();
            table.text('reference_notes');
            table.text('size_spec');
            table.text('material_spec');
            table.timestamp('due_at', { useTz: true }).notNullable();
            table.text('priority').notNullable().defaultTo('normal');
            table.text('status').notNullable().defaultTo('pending_review');
            table.uuid('assigned_designer_id').references('id').inTable('users').onDelete('SET NULL');
            table.uuid('reviewer_id').references('id').inTable('users').onDelete('SET NULL');
            table.text('review_comment');
            table.timestamp('approved_at', { useTz: true });
            table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
            table.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['org_id', 'race_id']);
            table.index(['race_id', 'status']);
            table.index(['event_type']);
            table.index(['assigned_designer_id']);
            table.index(['due_at']);
        });
    }

    const assetsExists = await knex.schema.hasTable('design_request_assets');
    if (!assetsExists) {
        await knex.schema.createTable('design_request_assets', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('request_id').notNullable().references('id').inTable('design_requests').onDelete('CASCADE');
            table.text('asset_type').notNullable();
            table.text('file_name').notNullable();
            table.text('file_url').notNullable();
            table.text('mime_type');
            table.text('note');
            table.integer('version').notNullable().defaultTo(1);
            table.uuid('uploaded_by').references('id').inTable('users').onDelete('SET NULL');
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['request_id', 'asset_type']);
        });
    }

    const reviewsExists = await knex.schema.hasTable('design_request_reviews');
    if (!reviewsExists) {
        await knex.schema.createTable('design_request_reviews', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('request_id').notNullable().references('id').inTable('design_requests').onDelete('CASCADE');
            table.text('action').notNullable();
            table.text('from_status');
            table.text('to_status').notNullable();
            table.text('comment');
            table.uuid('actor_id').references('id').inTable('users').onDelete('SET NULL');
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['request_id']);
            table.index(['action']);
        });
    }
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('design_request_reviews');
    await knex.schema.dropTableIfExists('design_request_assets');
    await knex.schema.dropTableIfExists('design_requests');
    await knex.schema.dropTableIfExists('design_request_templates');
}

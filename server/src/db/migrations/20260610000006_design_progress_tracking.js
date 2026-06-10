async function addColumnIfMissing(knex, tableName, columnName, addColumn) {
    const exists = await knex.schema.hasColumn(tableName, columnName);
    if (!exists) {
        await knex.schema.alterTable(tableName, (table) => addColumn(table));
    }
}

export async function up(knex) {
    const requestsExists = await knex.schema.hasTable('design_requests');
    if (!requestsExists) return;

    await addColumnIfMissing(knex, 'design_requests', 'progress_stage', (table) => {
        table.text('progress_stage').notNullable().defaultTo('intake_review');
    });
    await addColumnIfMissing(knex, 'design_requests', 'current_revision_no', (table) => {
        table.integer('current_revision_no').notNullable().defaultTo(0);
    });
    await addColumnIfMissing(knex, 'design_requests', 'revision_count', (table) => {
        table.integer('revision_count').notNullable().defaultTo(0);
    });
    await addColumnIfMissing(knex, 'design_requests', 'order_status', (table) => {
        table.text('order_status').notNullable().defaultTo('not_ready');
    });
    await addColumnIfMissing(knex, 'design_requests', 'order_reference', (table) => {
        table.text('order_reference');
    });
    await addColumnIfMissing(knex, 'design_requests', 'order_note', (table) => {
        table.text('order_note');
    });
    await addColumnIfMissing(knex, 'design_requests', 'final_approved_at', (table) => {
        table.timestamp('final_approved_at', { useTz: true });
    });
    await addColumnIfMissing(knex, 'design_requests', 'ordered_at', (table) => {
        table.timestamp('ordered_at', { useTz: true });
    });

    await knex.raw(`
        UPDATE design_requests
        SET progress_stage = CASE status
            WHEN 'pending_review' THEN 'intake_review'
            WHEN 'needs_info' THEN 'intake_review'
            WHEN 'approved' THEN 'assigned'
            WHEN 'in_design' THEN 'designing'
            WHEN 'design_uploaded' THEN 'internal_review'
            WHEN 'delivered' THEN 'delivered'
            ELSE progress_stage
        END
    `);

    const eventsExists = await knex.schema.hasTable('design_request_progress_events');
    if (!eventsExists) {
        await knex.schema.createTable('design_request_progress_events', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('request_id').notNullable().references('id').inTable('design_requests').onDelete('CASCADE');
            table.text('event_type').notNullable();
            table.text('from_stage');
            table.text('to_stage');
            table.integer('revision_no');
            table.text('order_status');
            table.text('comment');
            table.jsonb('metadata_json').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
            table.uuid('actor_id').references('id').inTable('users').onDelete('SET NULL');
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['request_id', 'created_at']);
            table.index(['event_type']);
            table.index(['to_stage']);
        });
    }

    await knex.raw(`
        INSERT INTO design_request_progress_events (
            request_id,
            event_type,
            to_stage,
            revision_no,
            order_status,
            comment,
            actor_id,
            created_at
        )
        SELECT
            dr.id,
            'backfilled',
            dr.progress_stage,
            dr.current_revision_no,
            dr.order_status,
            '由历史状态补齐的进度记录',
            dr.updated_by,
            dr.created_at
        FROM design_requests dr
        WHERE NOT EXISTS (
            SELECT 1
            FROM design_request_progress_events dpe
            WHERE dpe.request_id = dr.id
        )
    `);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('design_request_progress_events');

    const requestsExists = await knex.schema.hasTable('design_requests');
    if (!requestsExists) return;

    for (const columnName of [
        'ordered_at',
        'final_approved_at',
        'order_note',
        'order_reference',
        'order_status',
        'revision_count',
        'current_revision_no',
        'progress_stage',
    ]) {
        const exists = await knex.schema.hasColumn('design_requests', columnName);
        if (exists) {
            await knex.schema.alterTable('design_requests', (table) => {
                table.dropColumn(columnName);
            });
        }
    }
}

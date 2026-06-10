export async function up(knex) {
    const definitionsExists = await knex.schema.hasTable('approval_definitions');
    if (!definitionsExists) {
        await knex.schema.createTable('approval_definitions', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('org_id').nullable().references('id').inTable('organizations').onDelete('CASCADE');
            table.bigInteger('race_id').nullable().references('id').inTable('races').onDelete('CASCADE');
            table.text('business_type').notNullable();
            table.text('action_key').notNullable();
            table.text('name').notNullable();
            table.integer('version').notNullable().defaultTo(1);
            table.text('status').notNullable().defaultTo('active');
            table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
            table.timestamp('published_at', { useTz: true }).nullable();
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['business_type', 'action_key', 'status']);
            table.index(['org_id', 'race_id']);
        });
    }

    const stepsExists = await knex.schema.hasTable('approval_steps');
    if (!stepsExists) {
        await knex.schema.createTable('approval_steps', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('definition_id').notNullable().references('id').inTable('approval_definitions').onDelete('CASCADE');
            table.integer('step_order').notNullable();
            table.text('step_key').notNullable();
            table.text('step_name').notNullable();
            table.text('task_type').notNullable().defaultTo('approval');
            table.text('resolver_type').notNullable();
            table.jsonb('resolver_config_json').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
            table.text('decision_mode').notNullable().defaultTo('single');
            table.integer('min_approvals').notNullable().defaultTo(1);
            table.text('reject_behavior').notNullable().defaultTo('reject_instance');
            table.boolean('exclude_requester').notNullable().defaultTo(true);
            table.integer('due_duration_hours').nullable();
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.unique(['definition_id', 'step_key']);
            table.index(['definition_id', 'step_order']);
        });
    }

    const instancesExists = await knex.schema.hasTable('approval_instances');
    if (!instancesExists) {
        await knex.schema.createTable('approval_instances', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('definition_id').notNullable().references('id').inTable('approval_definitions').onDelete('RESTRICT');
            table.integer('definition_version').notNullable().defaultTo(1);
            table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
            table.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
            table.text('business_type').notNullable();
            table.text('business_id').notNullable();
            table.text('action_key').notNullable();
            table.uuid('requester_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
            table.text('status').notNullable().defaultTo('pending');
            table.integer('current_step_order').nullable();
            table.jsonb('business_snapshot_json').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
            table.jsonb('result_json').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
            table.text('blocked_reason').nullable();
            table.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('completed_at', { useTz: true }).nullable();
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['business_type', 'business_id']);
            table.index(['org_id', 'race_id', 'status']);
            table.index(['requester_user_id']);
        });
    }

    const tasksExists = await knex.schema.hasTable('approval_tasks');
    if (!tasksExists) {
        await knex.schema.createTable('approval_tasks', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('instance_id').notNullable().references('id').inTable('approval_instances').onDelete('CASCADE');
            table.uuid('step_id').notNullable().references('id').inTable('approval_steps').onDelete('CASCADE');
            table.uuid('assigned_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
            table.text('candidate_role_key').nullable();
            table.text('candidate_department_scope').nullable();
            table.text('status').notNullable().defaultTo('pending');
            table.text('decision').nullable();
            table.text('comment').nullable();
            table.jsonb('result_json').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
            table.timestamp('due_at', { useTz: true }).nullable();
            table.uuid('acted_by').nullable().references('id').inTable('users').onDelete('SET NULL');
            table.timestamp('acted_at', { useTz: true }).nullable();
            table.uuid('delegated_from_task_id').nullable().references('id').inTable('approval_tasks').onDelete('SET NULL');
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['instance_id', 'status']);
            table.index(['assigned_user_id', 'status']);
            table.index(['step_id']);
        });
    }

    const eventsExists = await knex.schema.hasTable('approval_events');
    if (!eventsExists) {
        await knex.schema.createTable('approval_events', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('instance_id').notNullable().references('id').inTable('approval_instances').onDelete('CASCADE');
            table.uuid('task_id').nullable().references('id').inTable('approval_tasks').onDelete('SET NULL');
            table.text('event_type').notNullable();
            table.uuid('actor_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
            table.jsonb('payload_json').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['instance_id', 'created_at']);
            table.index(['event_type']);
        });
    }

    function quoteValues(values) {
        return values.map((value) => `'${String(value).replace(/'/g, "''")}'`).join(', ');
    }

    for (const [tableName, constraintName, values] of [
        ['approval_definitions', 'approval_definitions_status_check', ['draft', 'active', 'archived']],
        ['approval_steps', 'approval_steps_task_type_check', ['approval', 'assignment']],
        ['approval_steps', 'approval_steps_decision_mode_check', ['single', 'all', 'quorum']],
        ['approval_instances', 'approval_instances_status_check', ['pending', 'approved', 'rejected', 'needs_info', 'blocked', 'cancelled']],
        ['approval_tasks', 'approval_tasks_status_check', ['pending', 'completed', 'cancelled']],
    ]) {
        await knex.raw(`ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${constraintName}`);
        const column = constraintName.includes('task_type')
            ? 'task_type'
            : constraintName.includes('decision_mode')
                ? 'decision_mode'
                : 'status';
        await knex.raw(`
            ALTER TABLE ${tableName}
            ADD CONSTRAINT ${constraintName}
            CHECK (${column} IN (${quoteValues(values)}))
        `);
    }
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('approval_events');
    await knex.schema.dropTableIfExists('approval_tasks');
    await knex.schema.dropTableIfExists('approval_instances');
    await knex.schema.dropTableIfExists('approval_steps');
    await knex.schema.dropTableIfExists('approval_definitions');
}

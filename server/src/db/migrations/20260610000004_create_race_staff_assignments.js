export async function up(knex) {
    const exists = await knex.schema.hasTable('race_staff_assignments');
    if (!exists) {
        await knex.schema.createTable('race_staff_assignments', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
            table.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
            table.uuid('team_member_id').notNullable().references('id').inTable('team_members').onDelete('CASCADE');
            table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
            table.text('role_key').notNullable();
            table.text('role_name').notNullable();
            table.text('department_scope').nullable();
            table.text('module_scope').nullable();
            table.boolean('is_primary').notNullable().defaultTo(false);
            table.text('status').notNullable().defaultTo('active');
            table.timestamp('starts_at', { useTz: true }).nullable();
            table.timestamp('ends_at', { useTz: true }).nullable();
            table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['org_id', 'race_id']);
            table.index(['race_id', 'role_key', 'status']);
            table.index(['race_id', 'department_scope', 'role_key']);
            table.index(['user_id']);
        });
    }

    await knex.raw(`
        ALTER TABLE race_staff_assignments DROP CONSTRAINT IF EXISTS race_staff_assignments_status_check
    `);
    await knex.raw(`
        ALTER TABLE race_staff_assignments
        ADD CONSTRAINT race_staff_assignments_status_check
        CHECK (status IN ('active', 'inactive', 'archived'))
    `);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('race_staff_assignments');
}

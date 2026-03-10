/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    await knex.schema.createTable('projects', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.string('name').notNullable();
        table.text('description');
        table.string('race_id'); // Optional link to a race
        table.timestamps(true, true);
    });

    await knex.schema.createTable('project_tasks', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
        table.uuid('parent_id').references('id').inTable('project_tasks').onDelete('CASCADE'); // Root tasks have null parent
        table.string('title').notNullable();
        table.enum('status', ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']).defaultTo('TODO');
        table.timestamp('start_date');
        table.timestamp('end_date');
        table.boolean('is_milestone').defaultTo(false);
        table.text('notes');
        table.float('sort_order').defaultTo(0);
        table.timestamps(true, true);
    });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    await knex.schema.dropTableIfExists('project_tasks');
    await knex.schema.dropTableIfExists('projects');
}

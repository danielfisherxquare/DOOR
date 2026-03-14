/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    const exists = await knex.schema.hasTable('tools');
    if (exists) return;

    await knex.schema.createTable('tools', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.text('name').notNullable().unique();
        table.text('description').notNullable().defaultTo('');
        table.text('icon_type').notNullable().defaultTo('lucide');
        table.text('icon_name').notNullable().defaultTo('Wrench');
        table.text('status').notNullable().defaultTo('online');
        table.boolean('is_external').notNullable().defaultTo(false);
        table.text('external_url').nullable();
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    const exists = await knex.schema.hasTable('tools');
    if (!exists) return;
    await knex.schema.dropTable('tools');
}

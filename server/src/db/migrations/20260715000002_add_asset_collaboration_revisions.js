/**
 * Optimistic revisions for shared metadata and version upload conflict checks.
 */
export async function up(knex) {
    await knex.schema.alterTable('asset_folders', (table) => {
        table.integer('revision').notNullable().defaultTo(1);
    });
    await knex.schema.alterTable('asset_tags', (table) => {
        table.integer('revision').notNullable().defaultTo(1);
    });
    await knex.schema.alterTable('asset_uploads', (table) => {
        table.integer('base_revision');
    });
}

export async function down(knex) {
    await knex.schema.alterTable('asset_uploads', (table) => table.dropColumn('base_revision'));
    await knex.schema.alterTable('asset_tags', (table) => table.dropColumn('revision'));
    await knex.schema.alterTable('asset_folders', (table) => table.dropColumn('revision'));
}

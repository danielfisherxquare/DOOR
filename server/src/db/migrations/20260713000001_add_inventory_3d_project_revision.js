export async function up(knex) {
    await knex.schema.alterTable('inventory_3d_projects', (table) => {
        table.integer('revision').notNullable().defaultTo(1);
    });

    await knex.raw(`
        ALTER TABLE inventory_3d_projects
        ADD CONSTRAINT inventory_3d_projects_revision_check
        CHECK (revision >= 1)
    `);
}

export async function down(knex) {
    await knex.raw(
        'ALTER TABLE inventory_3d_projects DROP CONSTRAINT IF EXISTS inventory_3d_projects_revision_check'
    );
    await knex.schema.alterTable('inventory_3d_projects', (table) => {
        table.dropColumn('revision');
    });
}

export async function up(knex) {
    await knex.schema.alterTable('column_mappings', (table) => {
        table.uuid('user_id').nullable().references('id').inTable('users').onDelete('CASCADE');
    });

    await knex.raw(`
        ALTER TABLE column_mappings
        DROP CONSTRAINT IF EXISTS column_mappings_org_id_source_column_unique
    `);

    await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS column_mappings_org_source_org_default_unique
        ON column_mappings (org_id, source_column)
        WHERE user_id IS NULL
    `);

    await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS column_mappings_org_user_source_unique
        ON column_mappings (org_id, user_id, source_column)
        WHERE user_id IS NOT NULL
    `);

    await knex.raw(`
        CREATE INDEX IF NOT EXISTS column_mappings_org_user_idx
        ON column_mappings (org_id, user_id)
    `);
}

export async function down(knex) {
    await knex.raw(`
        DROP INDEX IF EXISTS column_mappings_org_user_idx
    `);

    await knex.raw(`
        DROP INDEX IF EXISTS column_mappings_org_user_source_unique
    `);

    await knex.raw(`
        DROP INDEX IF EXISTS column_mappings_org_source_org_default_unique
    `);

    await knex('column_mappings').whereNotNull('user_id').delete();

    await knex.schema.alterTable('column_mappings', (table) => {
        table.dropColumn('user_id');
    });

    await knex.schema.alterTable('column_mappings', (table) => {
        table.unique(['org_id', 'source_column']);
    });
}

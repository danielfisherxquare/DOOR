export async function up(knex) {
    await knex.schema.createTable('credential_access_areas', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        t.text('access_code').notNullable();
        t.text('access_name').notNullable();
        t.text('access_color').notNullable().defaultTo('#3B82F6');
        t.integer('sort_order').notNullable().defaultTo(0);
        t.jsonb('geometry').nullable();
        t.text('description').nullable();
        t.boolean('is_active').notNullable().defaultTo(true);
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'race_id', 'access_code']);
        t.index(['org_id', 'race_id']);
        t.index(['race_id', 'is_active']);
    });

    await knex.raw("ALTER TABLE credential_access_areas ADD CONSTRAINT credential_access_areas_access_code_digits CHECK (access_code ~ '^[0-9]+$')");
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('credential_access_areas');
}

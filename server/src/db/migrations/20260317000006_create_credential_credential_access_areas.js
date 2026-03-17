export async function up(knex) {
    await knex.schema.createTable('credential_credential_access_areas', (t) => {
        t.bigIncrements('id').primary();
        t.bigInteger('credential_id').notNullable()
            .references('id').inTable('credential_credentials').onDelete('CASCADE');
        t.bigInteger('access_area_id').nullable()
            .references('id').inTable('credential_access_areas').onDelete('SET NULL');
        t.text('access_code').notNullable();
        t.text('access_name').notNullable();
        t.text('access_color').notNullable().defaultTo('#3B82F6');
        t.jsonb('geometry').nullable();
        t.text('access_description').nullable();
        t.integer('sort_order').notNullable().defaultTo(0);
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['credential_id', 'access_code']);
        t.index(['credential_id']);
        t.index(['access_area_id']);
    });
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('credential_credential_access_areas');
}

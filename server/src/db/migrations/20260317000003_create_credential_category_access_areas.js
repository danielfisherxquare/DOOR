export async function up(knex) {
    await knex.schema.createTable('credential_category_access_areas', (t) => {
        t.bigIncrements('id').primary();
        t.bigInteger('category_id').notNullable()
            .references('id').inTable('credential_categories').onDelete('CASCADE');
        t.bigInteger('access_area_id').notNullable()
            .references('id').inTable('credential_access_areas').onDelete('CASCADE');
        t.integer('sort_order').notNullable().defaultTo(0);
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['category_id', 'access_area_id']);
        t.index(['category_id']);
        t.index(['access_area_id']);
    });
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('credential_category_access_areas');
}

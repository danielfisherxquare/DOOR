export async function up(knex) {
    await knex.schema.createTable('credential_categories', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        t.text('category_name').notNullable();
        t.text('category_code').notNullable();
        t.text('card_color').notNullable().defaultTo('#6B7280');
        t.boolean('requires_review').notNullable().defaultTo(true);
        t.boolean('is_active').notNullable().defaultTo(true);
        t.bigInteger('default_style_template_id').nullable()
            .references('id').inTable('credential_style_templates').onDelete('SET NULL');
        t.text('description').nullable();
        t.integer('sort_order').notNullable().defaultTo(0);
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'race_id', 'category_code']);
        t.index(['org_id', 'race_id']);
        t.index(['race_id', 'is_active']);
    });
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('credential_categories');
}

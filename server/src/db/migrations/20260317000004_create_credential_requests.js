export async function up(knex) {
    await knex.schema.createTable('credential_requests', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        t.uuid('applicant_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.text('source_mode').notNullable();
        t.bigInteger('category_id').notNullable()
            .references('id').inTable('credential_categories').onDelete('RESTRICT');
        t.text('category_name').notNullable();
        t.text('category_color').notNullable().defaultTo('#6B7280');
        t.text('person_name').notNullable();
        t.text('org_name').nullable();
        t.text('job_title').nullable();
        t.text('status').notNullable().defaultTo('draft');
        t.uuid('reviewer_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('reviewed_at', { useTz: true }).nullable();
        t.text('review_remark').nullable();
        t.text('reject_reason').nullable();
        t.text('remark').nullable();
        t.jsonb('custom_fields').nullable();
        t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['org_id', 'race_id']);
        t.index(['race_id', 'status']);
        t.index(['category_id']);
        t.index(['applicant_user_id']);
    });
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('credential_requests');
}

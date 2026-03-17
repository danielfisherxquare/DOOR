export async function up(knex) {
    await knex.schema.createTable('credential_credentials', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        t.text('credential_no').notNullable();

        t.bigInteger('application_id').nullable()
            .references('id').inTable('credential_applications').onDelete('RESTRICT');
        t.bigInteger('request_id').nullable();

        t.text('role_name').notNullable();
        t.text('category_name').nullable();
        t.text('category_color').nullable();
        t.text('job_title').nullable();
        t.text('person_name').notNullable();
        t.text('org_name').nullable();
        t.text('default_zone_code').nullable();

        t.jsonb('template_snapshot_json').notNullable();
        t.jsonb('map_snapshot_json').nullable();

        t.text('qr_payload').notNullable();
        t.integer('qr_version').notNullable().defaultTo(1);
        t.text('status').notNullable().defaultTo('generated');

        t.bigInteger('print_batch_id').nullable()
            .references('id').inTable('credential_print_batches').onDelete('SET NULL');
        t.timestamp('printed_at', { useTz: true }).nullable();

        t.uuid('issued_to_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('issued_at', { useTz: true }).nullable();
        t.text('issue_source').nullable();

        t.timestamp('returned_at', { useTz: true }).nullable();
        t.text('return_remark').nullable();

        t.timestamp('voided_at', { useTz: true }).nullable();
        t.uuid('voided_by_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.text('void_reason').nullable();

        t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'race_id', 'credential_no']);
        t.index(['org_id', 'race_id']);
        t.index(['race_id', 'status']);
        t.index(['application_id']);
        t.index(['request_id']);
        t.index(['print_batch_id']);
        t.index(['qr_payload']);
    });
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('credential_credentials');
}

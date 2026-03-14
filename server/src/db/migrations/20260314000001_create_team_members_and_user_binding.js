/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    await knex.schema.createTable('team_members', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.text('employee_code').notNullable();
        t.text('employee_name').notNullable();
        t.text('position').nullable();
        t.text('department').notNullable();
        t.text('member_type').notNullable().defaultTo('employee');
        t.text('external_engagement_type').nullable();
        t.binary('id_number_ciphertext').notNullable();
        t.text('id_number_iv').notNullable();
        t.text('id_number_auth_tag').notNullable();
        t.text('id_number_last4').notNullable();
        t.binary('contact_ciphertext').notNullable();
        t.text('contact_iv').notNullable();
        t.text('contact_auth_tag').notNullable();
        t.text('contact_last4').notNullable();
        t.text('status').notNullable().defaultTo('active');
        t.uuid('account_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'employee_code']);
        t.index(['org_id', 'member_type']);
        t.index(['org_id', 'department']);
        t.index(['org_id', 'status']);
    });

    await knex.raw(`
        ALTER TABLE team_members
        ADD CONSTRAINT team_members_member_type_check
        CHECK (member_type IN ('employee', 'external_support'))
    `);

    await knex.raw(`
        ALTER TABLE team_members
        ADD CONSTRAINT team_members_external_engagement_type_check
        CHECK (
            external_engagement_type IS NULL
            OR external_engagement_type IN ('temporary', 'long_term')
        )
    `);

    await knex.raw(`
        ALTER TABLE team_members
        ADD CONSTRAINT team_members_external_type_required_check
        CHECK (
            (member_type = 'employee' AND external_engagement_type IS NULL)
            OR (member_type = 'external_support' AND external_engagement_type IS NOT NULL)
        )
    `);

    await knex.raw(`
        ALTER TABLE team_members
        ADD CONSTRAINT team_members_status_check
        CHECK (status IN ('active', 'inactive', 'archived'))
    `);

    await knex.schema.alterTable('users', (t) => {
        t.uuid('team_member_id').nullable().references('id').inTable('team_members').onDelete('SET NULL');
        t.text('account_source').notNullable().defaultTo('manual');
    });

    await knex.raw(`
        ALTER TABLE users
        ADD CONSTRAINT users_account_source_check
        CHECK (account_source IN ('manual', 'team_member_auto', 'team_member_manual_enable'))
    `);

    await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS users_team_member_id_unique
        ON users (team_member_id)
        WHERE team_member_id IS NOT NULL
    `);
}

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    await knex.raw('DROP INDEX IF EXISTS users_team_member_id_unique');
    await knex.raw('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_source_check');

    const hasTeamMemberId = await knex.schema.hasColumn('users', 'team_member_id');
    const hasAccountSource = await knex.schema.hasColumn('users', 'account_source');
    await knex.schema.alterTable('users', (t) => {
        if (hasTeamMemberId) t.dropColumn('team_member_id');
        if (hasAccountSource) t.dropColumn('account_source');
    });

    await knex.raw('ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_status_check');
    await knex.raw('ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_external_type_required_check');
    await knex.raw('ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_external_engagement_type_check');
    await knex.raw('ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_member_type_check');
    await knex.schema.dropTableIfExists('team_members');
}

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    const hasSourceType = await knex.schema.hasColumn('assessment_members', 'source_type');
    const hasTeamMemberId = await knex.schema.hasColumn('assessment_members', 'team_member_id');
    const hasMemberType = await knex.schema.hasColumn('assessment_members', 'member_type');

    await knex.schema.alterTable('assessment_members', (t) => {
        if (!hasSourceType) t.text('source_type').notNullable().defaultTo('team_member');
        if (!hasTeamMemberId) t.uuid('team_member_id').nullable().references('id').inTable('team_members').onDelete('SET NULL');
        if (!hasMemberType) t.text('member_type').notNullable().defaultTo('employee');
    });

    await knex.raw(`
        ALTER TABLE assessment_members
        ADD CONSTRAINT assessment_members_source_type_check
        CHECK (source_type IN ('team_member'))
    `);

    await knex.raw(`
        ALTER TABLE assessment_members
        ADD CONSTRAINT assessment_members_member_type_check
        CHECK (member_type IN ('employee', 'external_support'))
    `);
}

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    await knex.raw('ALTER TABLE assessment_members DROP CONSTRAINT IF EXISTS assessment_members_member_type_check');
    await knex.raw('ALTER TABLE assessment_members DROP CONSTRAINT IF EXISTS assessment_members_source_type_check');

    const hasSourceType = await knex.schema.hasColumn('assessment_members', 'source_type');
    const hasTeamMemberId = await knex.schema.hasColumn('assessment_members', 'team_member_id');
    const hasMemberType = await knex.schema.hasColumn('assessment_members', 'member_type');

    await knex.schema.alterTable('assessment_members', (t) => {
        if (hasSourceType) t.dropColumn('source_type');
        if (hasTeamMemberId) t.dropColumn('team_member_id');
        if (hasMemberType) t.dropColumn('member_type');
    });
}

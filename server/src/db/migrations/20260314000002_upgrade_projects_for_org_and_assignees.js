/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    const hasOrgId = await knex.schema.hasColumn('projects', 'org_id');
    const hasCreatedBy = await knex.schema.hasColumn('projects', 'created_by');

    await knex.schema.alterTable('projects', (t) => {
        if (!hasOrgId) t.uuid('org_id').nullable().references('id').inTable('organizations').onDelete('SET NULL');
        if (!hasCreatedBy) t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    });

    await knex.raw(`
        CREATE INDEX IF NOT EXISTS projects_org_id_created_at_idx
        ON projects (org_id, created_at DESC)
    `);

    await knex.raw(`
        UPDATE projects
        SET org_id = races.org_id
        FROM races
        WHERE projects.org_id IS NULL
          AND NULLIF(projects.race_id, '') IS NOT NULL
          AND CAST(projects.race_id AS INTEGER) = races.id
    `);

    await knex.schema.createTable('project_task_assignees', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('task_id').notNullable().references('id').inTable('project_tasks').onDelete('CASCADE');
        t.text('source_type').notNullable().defaultTo('team_member');
        t.uuid('team_member_id').nullable().references('id').inTable('team_members').onDelete('SET NULL');
        t.text('employee_code').notNullable();
        t.text('employee_name').notNullable();
        t.text('position').nullable();
        t.text('member_type').notNullable().defaultTo('employee');
        t.text('external_engagement_type').nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['task_id']);
        t.index(['team_member_id']);
    });

    await knex.raw(`
        ALTER TABLE project_task_assignees
        ADD CONSTRAINT project_task_assignees_source_type_check
        CHECK (source_type = 'team_member')
    `);

    await knex.raw(`
        ALTER TABLE project_task_assignees
        ADD CONSTRAINT project_task_assignees_member_type_check
        CHECK (member_type IN ('employee', 'external_support'))
    `);

    await knex.raw(`
        ALTER TABLE project_task_assignees
        ADD CONSTRAINT project_task_assignees_external_engagement_type_check
        CHECK (
            external_engagement_type IS NULL
            OR external_engagement_type IN ('temporary', 'long_term')
        )
    `);

    const hasResponsibleGroup = await knex.schema.hasColumn('project_tasks', 'responsible_group');
    if (hasResponsibleGroup) {
        const rows = await knex('project_tasks')
            .whereNotNull('responsible_group')
            .whereRaw(`NULLIF(BTRIM(responsible_group), '') IS NOT NULL`)
            .select('id', 'responsible_group');

        if (rows.length > 0) {
            await knex('project_task_assignees').insert(
                rows.map((row) => ({
                    task_id: row.id,
                    source_type: 'team_member',
                    team_member_id: null,
                    employee_code: `LEGACY-${String(row.id).slice(0, 8)}`,
                    employee_name: row.responsible_group,
                    position: null,
                    member_type: 'external_support',
                    external_engagement_type: 'temporary',
                })),
            );
        }
    }
}

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    await knex.raw('DROP INDEX IF EXISTS projects_org_id_created_at_idx');
    await knex.raw('ALTER TABLE project_task_assignees DROP CONSTRAINT IF EXISTS project_task_assignees_external_engagement_type_check');
    await knex.raw('ALTER TABLE project_task_assignees DROP CONSTRAINT IF EXISTS project_task_assignees_member_type_check');
    await knex.raw('ALTER TABLE project_task_assignees DROP CONSTRAINT IF EXISTS project_task_assignees_source_type_check');
    await knex.schema.dropTableIfExists('project_task_assignees');

    const hasOrgId = await knex.schema.hasColumn('projects', 'org_id');
    const hasCreatedBy = await knex.schema.hasColumn('projects', 'created_by');
    await knex.schema.alterTable('projects', (t) => {
        if (hasOrgId) t.dropColumn('org_id');
        if (hasCreatedBy) t.dropColumn('created_by');
    });
}

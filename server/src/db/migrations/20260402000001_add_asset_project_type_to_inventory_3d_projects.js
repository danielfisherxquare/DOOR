export async function up(knex) {
    await knex.raw('ALTER TABLE inventory_3d_projects DROP CONSTRAINT IF EXISTS inventory_3d_projects_project_type_check');
    await knex.raw(`
        ALTER TABLE inventory_3d_projects
        ADD CONSTRAINT inventory_3d_projects_project_type_check
        CHECK (project_type IN ('warehouse', 'venue', 'site', 'mixed', 'asset'))
    `);
}

export async function down(knex) {
    await knex.raw('ALTER TABLE inventory_3d_projects DROP CONSTRAINT IF EXISTS inventory_3d_projects_project_type_check');
    await knex.raw(`
        ALTER TABLE inventory_3d_projects
        ADD CONSTRAINT inventory_3d_projects_project_type_check
        CHECK (project_type IN ('warehouse', 'venue', 'site', 'mixed'))
    `);
}

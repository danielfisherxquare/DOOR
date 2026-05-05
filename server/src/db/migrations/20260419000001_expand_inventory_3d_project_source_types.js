/**
 * Expand inventory 3D project source_type to support generated scene imports.
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    await knex.raw('ALTER TABLE inventory_3d_projects DROP CONSTRAINT IF EXISTS inventory_3d_projects_source_type_check');
    await knex.raw(`
        ALTER TABLE inventory_3d_projects
        ADD CONSTRAINT inventory_3d_projects_source_type_check
        CHECK (source_type IN ('blank', 'warehouse-import', 'generated-scene-import'))
    `);
}

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    await knex.raw('ALTER TABLE inventory_3d_projects DROP CONSTRAINT IF EXISTS inventory_3d_projects_source_type_check');
    await knex.raw(`
        ALTER TABLE inventory_3d_projects
        ADD CONSTRAINT inventory_3d_projects_source_type_check
        CHECK (source_type IN ('blank', 'warehouse-import'))
    `);
}

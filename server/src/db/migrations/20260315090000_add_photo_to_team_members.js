/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
    const hasPhotoPath = await knex.schema.hasColumn('team_members', 'photo_path');
    if (!hasPhotoPath) {
        await knex.schema.alterTable('team_members', (t) => {
            t.text('photo_path').nullable();
        });
    }
}

/**
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
    const hasPhotoPath = await knex.schema.hasColumn('team_members', 'photo_path');
    if (hasPhotoPath) {
        await knex.schema.alterTable('team_members', (t) => {
            t.dropColumn('photo_path');
        });
    }
}

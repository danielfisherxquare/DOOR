/**
 * 机构赛事授权表
 * org_race_permissions:
 *   - 超管为机构授予可操作赛事范围
 *   - access_level: editor/viewer
 */

export async function up(knex) {
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS user_race_permissions_user_org_idx
        ON user_race_permissions (user_id, org_id)
    `);

    await knex.schema.createTable('org_race_permissions', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.integer('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        t.text('access_level').notNullable().defaultTo('viewer');
        t.uuid('granted_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'race_id']);
        t.index(['org_id']);
        t.index(['race_id']);
        t.index(['org_id', 'access_level']);
    });

    await knex.raw(`
        ALTER TABLE org_race_permissions ADD CONSTRAINT org_race_permissions_access_level_check
        CHECK (access_level IN ('editor', 'viewer'))
    `);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('org_race_permissions');
    await knex.raw('DROP INDEX IF EXISTS user_race_permissions_user_org_idx');
}

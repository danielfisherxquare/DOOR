export async function up(knex) {
    await knex.schema.createTable('inventory_3d_projects', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('owner_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.text('name').notNullable();
        t.text('scene_type').notNullable().defaultTo('warehouse');
        t.jsonb('snapshot_json').notNullable();
        t.text('source_type').notNullable().defaultTo('blank');
        t.integer('source_warehouse_id').nullable();
        t.uuid('source_org_id').nullable().references('id').inTable('organizations').onDelete('SET NULL');
        t.text('thumbnail_data_url').nullable();
        t.timestamp('last_opened_at', { useTz: true }).nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['owner_user_id', 'updated_at'], 'inventory_3d_projects_owner_updated_idx');
        t.index(['owner_user_id', 'last_opened_at'], 'inventory_3d_projects_owner_opened_idx');
    });

    await knex.raw(`
        ALTER TABLE inventory_3d_projects
        ADD CONSTRAINT inventory_3d_projects_scene_type_check
        CHECK (scene_type IN ('warehouse', 'outdoor-event'))
    `);

    await knex.raw(`
        ALTER TABLE inventory_3d_projects
        ADD CONSTRAINT inventory_3d_projects_source_type_check
        CHECK (source_type IN ('blank', 'warehouse-import'))
    `);
}

export async function down(knex) {
    await knex.raw('ALTER TABLE inventory_3d_projects DROP CONSTRAINT IF EXISTS inventory_3d_projects_scene_type_check');
    await knex.raw('ALTER TABLE inventory_3d_projects DROP CONSTRAINT IF EXISTS inventory_3d_projects_source_type_check');
    await knex.schema.dropTableIfExists('inventory_3d_projects');
}

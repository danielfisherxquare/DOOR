export async function up(knex) {
    await knex.schema.alterTable('inventory_3d_projects', (t) => {
        t.uuid('org_id').nullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.text('project_type').notNullable().defaultTo('warehouse');
        t.text('status').notNullable().defaultTo('draft');
        t.jsonb('geo_anchor').nullable();
        t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    });

    await knex.raw(`
        UPDATE inventory_3d_projects AS project
        SET
            org_id = COALESCE(project.source_org_id, users.org_id),
            created_by = COALESCE(project.created_by, project.owner_user_id),
            updated_by = COALESCE(project.updated_by, project.owner_user_id),
            project_type = CASE
                WHEN project.scene_type = 'warehouse' THEN 'warehouse'
                ELSE 'site'
            END
        FROM users
        WHERE project.owner_user_id = users.id
    `);

    await knex.schema.alterTable('inventory_3d_projects', (t) => {
        t.index(['org_id', 'updated_at'], 'inventory_3d_projects_org_updated_idx');
        t.index(['org_id', 'project_type'], 'inventory_3d_projects_org_type_idx');
    });

    await knex.raw(`
        ALTER TABLE inventory_3d_projects
        ADD CONSTRAINT inventory_3d_projects_project_type_check
        CHECK (project_type IN ('warehouse', 'venue', 'site', 'mixed'))
    `);

    await knex.raw(`
        ALTER TABLE inventory_3d_projects
        ADD CONSTRAINT inventory_3d_projects_status_check
        CHECK (status IN ('draft', 'active', 'archived'))
    `);

    await knex.schema.createTable('inventory_3d_asset_templates', (t) => {
        t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.text('kind').notNullable().defaultTo('parametric');
        t.text('category').notNullable();
        t.text('name').notNullable();
        t.text('thumbnail_url').nullable();
        t.jsonb('parameters_schema').nullable();
        t.jsonb('default_parameters').nullable();
        t.text('model_url').nullable();
        t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['org_id', 'category'], 'inventory_3d_asset_templates_org_category_idx');
        t.index(['org_id', 'updated_at'], 'inventory_3d_asset_templates_org_updated_idx');
    });

    await knex.raw(`
        ALTER TABLE inventory_3d_asset_templates
        ADD CONSTRAINT inventory_3d_asset_templates_kind_check
        CHECK (kind IN ('parametric', 'model'))
    `);
}

export async function down(knex) {
    await knex.raw('ALTER TABLE inventory_3d_asset_templates DROP CONSTRAINT IF EXISTS inventory_3d_asset_templates_kind_check');
    await knex.schema.dropTableIfExists('inventory_3d_asset_templates');

    await knex.raw('ALTER TABLE inventory_3d_projects DROP CONSTRAINT IF EXISTS inventory_3d_projects_project_type_check');
    await knex.raw('ALTER TABLE inventory_3d_projects DROP CONSTRAINT IF EXISTS inventory_3d_projects_status_check');

    await knex.schema.alterTable('inventory_3d_projects', (t) => {
        t.dropIndex(['org_id', 'updated_at'], 'inventory_3d_projects_org_updated_idx');
        t.dropIndex(['org_id', 'project_type'], 'inventory_3d_projects_org_type_idx');
        t.dropColumn('org_id');
        t.dropColumn('project_type');
        t.dropColumn('status');
        t.dropColumn('geo_anchor');
        t.dropColumn('created_by');
        t.dropColumn('updated_by');
    });
}

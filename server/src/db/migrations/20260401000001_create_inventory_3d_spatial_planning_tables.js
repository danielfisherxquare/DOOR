/**
 * Create spatial planning tables for GIS + 3D Studio convergence.
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    const zonesExists = await knex.schema.hasTable('inventory_3d_terrain_work_zones');
    if (!zonesExists) {
        await knex.schema.createTable('inventory_3d_terrain_work_zones', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('project_id').notNullable().references('id').inTable('inventory_3d_projects').onDelete('CASCADE');
            table.text('name').notNullable();
            table.text('zone_type').notNullable().defaultTo('focus-zone');
            table.jsonb('clip_polygon_wgs84').notNullable();
            table.jsonb('origin_wgs84').notNullable();
            table.jsonb('enu_transform');
            table.integer('terrain_resolution').notNullable().defaultTo(2);
            table.uuid('terrain_mesh_asset_id').references('id').inTable('inventory_3d_assets').onDelete('SET NULL');
            table.jsonb('included_object_ids').notNullable().defaultTo(knex.raw(`'[]'::jsonb`));
            table.jsonb('publish_target').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
            table.jsonb('snapshot_json');
            table.jsonb('metadata');
            table.text('status').notNullable().defaultTo('draft');
            table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
            table.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['project_id'], 'inventory_3d_terrain_work_zones_project_idx');
            table.index(['project_id', 'zone_type'], 'inventory_3d_terrain_work_zones_project_type_idx');
            table.index(['project_id', 'status'], 'inventory_3d_terrain_work_zones_project_status_idx');
        });

        await knex.raw(`
            ALTER TABLE inventory_3d_terrain_work_zones
            ADD CONSTRAINT inventory_3d_terrain_work_zones_zone_type_check
            CHECK (zone_type IN ('focus-zone', 'terrain-clip', 'corridor-zone'))
        `);

        await knex.raw(`
            ALTER TABLE inventory_3d_terrain_work_zones
            ADD CONSTRAINT inventory_3d_terrain_work_zones_status_check
            CHECK (status IN ('draft', 'ready', 'published', 'archived'))
        `);
    }

    const objectsExists = await knex.schema.hasTable('inventory_3d_event_spatial_objects');
    if (!objectsExists) {
        await knex.schema.createTable('inventory_3d_event_spatial_objects', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('project_id').notNullable().references('id').inTable('inventory_3d_projects').onDelete('CASCADE');
            table.uuid('focus_zone_id').references('id').inTable('inventory_3d_terrain_work_zones').onDelete('SET NULL');
            table.text('object_type').notNullable();
            table.text('template_id');
            table.text('variant_id');
            table.text('title').notNullable();
            table.text('placement_mode').notNullable().defaultTo('follow-terrain');
            table.jsonb('anchor_wgs84').notNullable();
            table.jsonb('local_transform').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
            table.jsonb('footprint');
            table.double('base_elevation');
            table.jsonb('terrain_normal');
            table.double('slope_deg');
            table.jsonb('lod_profile').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
            table.jsonb('material_variant').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
            table.text('branding_pack_id');
            table.jsonb('render_profile').notNullable().defaultTo(knex.raw(`'{}'::jsonb`));
            table.jsonb('metadata');
            table.text('status').notNullable().defaultTo('draft');
            table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
            table.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['project_id'], 'inventory_3d_event_spatial_objects_project_idx');
            table.index(['project_id', 'object_type'], 'inventory_3d_event_spatial_objects_project_type_idx');
            table.index(['project_id', 'focus_zone_id'], 'inventory_3d_event_spatial_objects_project_zone_idx');
            table.index(['project_id', 'status'], 'inventory_3d_event_spatial_objects_project_status_idx');
        });

        await knex.raw(`
            ALTER TABLE inventory_3d_event_spatial_objects
            ADD CONSTRAINT inventory_3d_event_spatial_objects_type_check
            CHECK (object_type IN (
                'arch',
                'stage',
                'tent',
                'light_tower',
                'supply_station',
                'medical_station',
                'fence_segment',
                'route_sign',
                'generator',
                'toilet',
                'media_zone',
                'generic'
            ))
        `);

        await knex.raw(`
            ALTER TABLE inventory_3d_event_spatial_objects
            ADD CONSTRAINT inventory_3d_event_spatial_objects_placement_mode_check
            CHECK (placement_mode IN ('follow-terrain', 'level-platform', 'vertical-keep'))
        `);

        await knex.raw(`
            ALTER TABLE inventory_3d_event_spatial_objects
            ADD CONSTRAINT inventory_3d_event_spatial_objects_status_check
            CHECK (status IN ('draft', 'active', 'archived'))
        `);
    }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    await knex.raw('ALTER TABLE inventory_3d_event_spatial_objects DROP CONSTRAINT IF EXISTS inventory_3d_event_spatial_objects_status_check');
    await knex.raw('ALTER TABLE inventory_3d_event_spatial_objects DROP CONSTRAINT IF EXISTS inventory_3d_event_spatial_objects_placement_mode_check');
    await knex.raw('ALTER TABLE inventory_3d_event_spatial_objects DROP CONSTRAINT IF EXISTS inventory_3d_event_spatial_objects_type_check');
    await knex.schema.dropTableIfExists('inventory_3d_event_spatial_objects');

    await knex.raw('ALTER TABLE inventory_3d_terrain_work_zones DROP CONSTRAINT IF EXISTS inventory_3d_terrain_work_zones_status_check');
    await knex.raw('ALTER TABLE inventory_3d_terrain_work_zones DROP CONSTRAINT IF EXISTS inventory_3d_terrain_work_zones_zone_type_check');
    await knex.schema.dropTableIfExists('inventory_3d_terrain_work_zones');
}

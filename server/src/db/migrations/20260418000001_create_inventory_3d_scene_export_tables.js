/**
 * Create generated scene + scene export job tables for stable GIS -> Studio export pipeline.
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    const scenesExists = await knex.schema.hasTable('inventory_3d_generated_scenes');
    if (!scenesExists) {
        await knex.schema.createTable('inventory_3d_generated_scenes', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('project_id').notNullable().references('id').inTable('inventory_3d_projects').onDelete('CASCADE');
            table.uuid('focus_zone_id').notNullable().references('id').inTable('inventory_3d_terrain_work_zones').onDelete('CASCADE');
            table.text('source_hash').notNullable();
            table.text('quality_preset').notNullable().defaultTo('standard');
            table.text('status').notNullable().defaultTo('pending');
            table.jsonb('manifest_json');
            table.uuid('preview_file_id');
            table.uuid('scene_asset_id').references('id').inTable('inventory_3d_assets').onDelete('SET NULL');
            table.uuid('buildings_asset_id').references('id').inTable('inventory_3d_assets').onDelete('SET NULL');
            table.uuid('terrain_asset_id').references('id').inTable('inventory_3d_assets').onDelete('SET NULL');
            table.jsonb('metadata');
            table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
            table.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['project_id'], 'inventory_3d_generated_scenes_project_idx');
            table.index(['focus_zone_id'], 'inventory_3d_generated_scenes_focus_zone_idx');
            table.index(['project_id', 'focus_zone_id', 'status'], 'inventory_3d_generated_scenes_project_zone_status_idx');
            table.unique(
                ['project_id', 'focus_zone_id', 'source_hash', 'quality_preset'],
                'inventory_3d_generated_scenes_dedupe_unique',
            );
        });

        await knex.raw(`
            ALTER TABLE inventory_3d_generated_scenes
            ADD CONSTRAINT inventory_3d_generated_scenes_quality_preset_check
            CHECK (quality_preset IN ('fast', 'standard', 'precise'))
        `);

        await knex.raw(`
            ALTER TABLE inventory_3d_generated_scenes
            ADD CONSTRAINT inventory_3d_generated_scenes_status_check
            CHECK (status IN ('pending', 'ready', 'failed', 'archived'))
        `);
    }

    const jobsExists = await knex.schema.hasTable('inventory_3d_scene_export_jobs');
    if (!jobsExists) {
        await knex.schema.createTable('inventory_3d_scene_export_jobs', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('project_id').notNullable().references('id').inTable('inventory_3d_projects').onDelete('CASCADE');
            table.uuid('focus_zone_id').notNullable().references('id').inTable('inventory_3d_terrain_work_zones').onDelete('CASCADE');
            table.uuid('generated_scene_id').references('id').inTable('inventory_3d_generated_scenes').onDelete('SET NULL');
            table.text('job_type').notNullable().defaultTo('scene-export');
            table.text('target_type').notNullable().defaultTo('studio');
            table.text('quality_preset').notNullable().defaultTo('standard');
            table.text('stage').notNullable().defaultTo('queued');
            table.integer('progress').notNullable().defaultTo(0);
            table.text('status').notNullable().defaultTo('queued');
            table.text('error_message');
            table.jsonb('error_detail');
            table.jsonb('metadata');
            table.timestamp('started_at', { useTz: true });
            table.timestamp('finished_at', { useTz: true });
            table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
            table.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['project_id'], 'inventory_3d_scene_export_jobs_project_idx');
            table.index(['focus_zone_id'], 'inventory_3d_scene_export_jobs_focus_zone_idx');
            table.index(['generated_scene_id'], 'inventory_3d_scene_export_jobs_scene_idx');
            table.index(['project_id', 'status'], 'inventory_3d_scene_export_jobs_project_status_idx');
        });

        await knex.raw(`
            ALTER TABLE inventory_3d_scene_export_jobs
            ADD CONSTRAINT inventory_3d_scene_export_jobs_job_type_check
            CHECK (job_type IN ('scene-export'))
        `);

        await knex.raw(`
            ALTER TABLE inventory_3d_scene_export_jobs
            ADD CONSTRAINT inventory_3d_scene_export_jobs_target_type_check
            CHECK (target_type IN ('studio', 'file'))
        `);

        await knex.raw(`
            ALTER TABLE inventory_3d_scene_export_jobs
            ADD CONSTRAINT inventory_3d_scene_export_jobs_quality_preset_check
            CHECK (quality_preset IN ('fast', 'standard', 'precise'))
        `);

        await knex.raw(`
            ALTER TABLE inventory_3d_scene_export_jobs
            ADD CONSTRAINT inventory_3d_scene_export_jobs_status_check
            CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled'))
        `);
    }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    await knex.raw('ALTER TABLE inventory_3d_scene_export_jobs DROP CONSTRAINT IF EXISTS inventory_3d_scene_export_jobs_status_check');
    await knex.raw('ALTER TABLE inventory_3d_scene_export_jobs DROP CONSTRAINT IF EXISTS inventory_3d_scene_export_jobs_quality_preset_check');
    await knex.raw('ALTER TABLE inventory_3d_scene_export_jobs DROP CONSTRAINT IF EXISTS inventory_3d_scene_export_jobs_target_type_check');
    await knex.raw('ALTER TABLE inventory_3d_scene_export_jobs DROP CONSTRAINT IF EXISTS inventory_3d_scene_export_jobs_job_type_check');
    await knex.schema.dropTableIfExists('inventory_3d_scene_export_jobs');

    await knex.raw('ALTER TABLE inventory_3d_generated_scenes DROP CONSTRAINT IF EXISTS inventory_3d_generated_scenes_status_check');
    await knex.raw('ALTER TABLE inventory_3d_generated_scenes DROP CONSTRAINT IF EXISTS inventory_3d_generated_scenes_quality_preset_check');
    await knex.schema.dropTableIfExists('inventory_3d_generated_scenes');
}

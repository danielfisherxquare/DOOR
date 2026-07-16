/**
 * Organization-scoped digital asset library.
 * Files stay immutable in object storage; mutable metadata and sync cursors live here.
 */
export async function up(knex) {
    await knex.schema.createTable('asset_libraries', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        table.text('name').notNullable();
        table.text('slug').notNullable().defaultTo('main');
        table.boolean('is_default').notNullable().defaultTo(false);
        table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.unique(['org_id', 'slug']);
        table.index(['org_id', 'is_default']);
    });
    await knex.raw(`
        CREATE UNIQUE INDEX asset_libraries_one_default_per_org
        ON asset_libraries (org_id)
        WHERE is_default = true
    `);

    await knex.schema.createTable('asset_folders', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        table.uuid('library_id').notNullable().references('id').inTable('asset_libraries').onDelete('CASCADE');
        table.uuid('parent_id').references('id').inTable('asset_folders').onDelete('CASCADE');
        table.text('name').notNullable();
        table.integer('sort_order').notNullable().defaultTo(0);
        table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.index(['org_id', 'library_id']);
        table.index(['parent_id']);
    });
    await knex.raw(`
        CREATE UNIQUE INDEX asset_folders_unique_sibling_name
        ON asset_folders (library_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
    `);

    await knex.schema.createTable('asset_objects', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        table.text('sha256').notNullable();
        table.bigInteger('size').notNullable();
        table.text('mime_type').notNullable();
        table.text('object_key').notNullable();
        table.text('thumbnail_key');
        table.integer('width');
        table.integer('height');
        table.text('status').notNullable().defaultTo('ready');
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.unique(['org_id', 'sha256', 'size']);
        table.unique(['object_key']);
        table.index(['org_id', 'status']);
    });

    await knex.schema.createTable('assets', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        table.uuid('library_id').notNullable().references('id').inTable('asset_libraries').onDelete('CASCADE');
        table.uuid('folder_id').references('id').inTable('asset_folders').onDelete('SET NULL');
        table.uuid('object_id').notNullable().references('id').inTable('asset_objects').onDelete('RESTRICT');
        table.text('name').notNullable();
        table.text('kind').notNullable();
        table.text('note');
        table.smallint('rating');
        table.integer('current_version').notNullable().defaultTo(1);
        table.integer('revision').notNullable().defaultTo(1);
        table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
        table.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
        table.timestamp('deleted_at', { useTz: true });
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.index(['org_id', 'library_id', 'updated_at']);
        table.index(['org_id', 'folder_id']);
        table.index(['org_id', 'kind']);
        table.index(['org_id', 'deleted_at']);
    });

    await knex.schema.createTable('asset_versions', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('asset_id').notNullable().references('id').inTable('assets').onDelete('CASCADE');
        table.uuid('object_id').notNullable().references('id').inTable('asset_objects').onDelete('RESTRICT');
        table.integer('version').notNullable();
        table.text('file_name').notNullable();
        table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.unique(['asset_id', 'version']);
        table.index(['object_id']);
    });

    await knex.schema.createTable('asset_tags', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        table.text('name').notNullable();
        table.text('color').notNullable().defaultTo('#d8262c');
        table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.index(['org_id']);
    });
    await knex.raw('CREATE UNIQUE INDEX asset_tags_unique_org_name ON asset_tags (org_id, lower(name))');

    await knex.schema.createTable('asset_tag_links', (table) => {
        table.uuid('asset_id').notNullable().references('id').inTable('assets').onDelete('CASCADE');
        table.uuid('tag_id').notNullable().references('id').inTable('asset_tags').onDelete('CASCADE');
        table.primary(['asset_id', 'tag_id']);
        table.index(['tag_id']);
    });

    await knex.schema.createTable('asset_uploads', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        table.uuid('library_id').notNullable().references('id').inTable('asset_libraries').onDelete('CASCADE');
        table.uuid('folder_id').references('id').inTable('asset_folders').onDelete('SET NULL');
        table.uuid('asset_id').references('id').inTable('assets').onDelete('SET NULL');
        table.text('file_name').notNullable();
        table.text('mime_type').notNullable();
        table.bigInteger('size').notNullable();
        table.text('sha256').notNullable();
        table.bigInteger('part_size').notNullable();
        table.integer('expected_parts').notNullable();
        table.text('status').notNullable().defaultTo('pending');
        table.text('client_mutation_id').notNullable();
        table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
        table.timestamp('expires_at', { useTz: true }).notNullable();
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp('completed_at', { useTz: true });
        table.unique(['org_id', 'client_mutation_id']);
        table.index(['org_id', 'status', 'expires_at']);
    });

    await knex.schema.createTable('asset_upload_parts', (table) => {
        table.uuid('upload_id').notNullable().references('id').inTable('asset_uploads').onDelete('CASCADE');
        table.integer('part_number').notNullable();
        table.text('etag').notNullable();
        table.bigInteger('size').notNullable();
        table.text('temp_path').notNullable();
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.primary(['upload_id', 'part_number']);
    });

    await knex.schema.createTable('asset_changes', (table) => {
        table.bigIncrements('id').primary();
        table.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        table.uuid('asset_id').notNullable();
        table.text('operation').notNullable();
        table.integer('revision').notNullable();
        table.jsonb('payload_json').notNullable().defaultTo(knex.raw("'{}'::jsonb"));
        table.uuid('actor_id').references('id').inTable('users').onDelete('SET NULL');
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.index(['org_id', 'id']);
        table.index(['asset_id', 'id']);
    });

    await knex.raw(`ALTER TABLE assets ADD CONSTRAINT assets_kind_check CHECK (kind IN ('image','video','audio','document','design','archive','other'))`);
    await knex.raw('ALTER TABLE assets ADD CONSTRAINT assets_rating_check CHECK (rating IS NULL OR rating BETWEEN 0 AND 5)');
    await knex.raw(`ALTER TABLE asset_objects ADD CONSTRAINT asset_objects_status_check CHECK (status IN ('ready','quarantined','missing'))`);
    await knex.raw(`ALTER TABLE asset_uploads ADD CONSTRAINT asset_uploads_status_check CHECK (status IN ('pending','uploading','processing','completed','failed','expired'))`);
    await knex.raw(`ALTER TABLE asset_changes ADD CONSTRAINT asset_changes_operation_check CHECK (operation IN ('upsert','delete'))`);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('asset_changes');
    await knex.schema.dropTableIfExists('asset_upload_parts');
    await knex.schema.dropTableIfExists('asset_uploads');
    await knex.schema.dropTableIfExists('asset_tag_links');
    await knex.schema.dropTableIfExists('asset_tags');
    await knex.schema.dropTableIfExists('asset_versions');
    await knex.schema.dropTableIfExists('assets');
    await knex.schema.dropTableIfExists('asset_objects');
    await knex.schema.dropTableIfExists('asset_folders');
    await knex.schema.dropTableIfExists('asset_libraries');
}

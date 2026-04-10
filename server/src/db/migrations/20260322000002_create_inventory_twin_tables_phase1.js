export async function up(knex) {
    await knex.schema.createTable('warehouse_zones', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('warehouse_id').notNullable().references('id').inTable('warehouses').onDelete('CASCADE');
        t.string('code', 100).notNullable();
        t.string('name', 200).notNullable();
        t.string('zone_type', 50).notNullable().defaultTo('storage');
        t.jsonb('bounds_mm').notNullable();
        t.jsonb('metadata').nullable();
        t.string('status', 20).notNullable().defaultTo('active');
        t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['warehouse_id', 'code'], 'warehouse_zones_warehouse_id_code_unique');
        t.index(['org_id', 'warehouse_id'], 'warehouse_zones_org_id_warehouse_id_idx');
    });

    await knex.schema.createTable('rack_templates', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.string('code', 100).notNullable();
        t.string('name', 200).notNullable();
        t.string('shape_type', 50).notNullable().defaultTo('standard');
        t.jsonb('outer_dimensions_mm').notNullable();
        t.integer('levels').notNullable().defaultTo(1);
        t.integer('bays').notNullable().defaultTo(1);
        t.decimal('max_load_kg', 12, 2).nullable();
        t.jsonb('slot_rule').notNullable().defaultTo('{}');
        t.jsonb('allowed_shape_types').nullable();
        t.string('status', 20).notNullable().defaultTo('active');
        t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'code'], 'rack_templates_org_id_code_unique');
        t.index(['org_id', 'status'], 'rack_templates_org_id_status_idx');
    });

    await knex.schema.createTable('rack_instances', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('warehouse_id').notNullable().references('id').inTable('warehouses').onDelete('CASCADE');
        t.integer('rack_template_id').notNullable().references('id').inTable('rack_templates');
        t.string('code', 100).notNullable();
        t.string('name', 200).notNullable();
        t.jsonb('position_mm').notNullable();
        t.jsonb('rotation_deg').nullable();
        t.jsonb('scale').nullable();
        t.string('status', 20).notNullable().defaultTo('active');
        t.jsonb('metadata').nullable();
        t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['warehouse_id', 'code'], 'rack_instances_warehouse_id_code_unique');
        t.index(['org_id', 'warehouse_id'], 'rack_instances_org_id_warehouse_id_idx');
    });

    await knex.schema.createTable('item_shape_templates', (t) => {
        t.increments('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.string('code', 100).notNullable();
        t.string('name', 200).notNullable();
        t.string('shape_type', 50).notNullable();
        t.jsonb('dimensions_mm').notNullable();
        t.jsonb('geometry_profile').nullable();
        t.decimal('default_weight_kg', 12, 2).nullable();
        t.boolean('stackable').notNullable().defaultTo(true);
        t.jsonb('orientation_rules').nullable();
        t.string('status', 20).notNullable().defaultTo('active');
        t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'code'], 'item_shape_templates_org_id_code_unique');
        t.index(['org_id', 'shape_type'], 'item_shape_templates_org_id_shape_type_idx');
    });

    await knex.schema.createTable('inventory_objects', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.bigInteger('legacy_unit_id').nullable().references('id').inTable('org_inventory_units').onDelete('SET NULL');
        t.integer('batch_id').nullable().references('id').inTable('org_inventory_batches').onDelete('SET NULL');
        t.integer('shape_template_id').nullable().references('id').inTable('item_shape_templates').onDelete('SET NULL');
        t.string('object_code', 100).notNullable();
        t.string('object_level', 20).notNullable().defaultTo('unit');
        t.string('shape_type', 50).notNullable();
        t.jsonb('dimensions_mm').nullable();
        t.decimal('weight_kg', 12, 2).nullable();
        t.boolean('stackable').notNullable().defaultTo(true);
        t.jsonb('orientation_rules').nullable();
        t.bigInteger('parent_object_id').nullable().references('id').inTable('inventory_objects').onDelete('SET NULL');
        t.integer('current_warehouse_id').nullable().references('id').inTable('warehouses').onDelete('SET NULL');
        t.integer('current_location_id').nullable().references('id').inTable('warehouse_locations').onDelete('SET NULL');
        t.string('status', 20).notNullable().defaultTo('in_stock');
        t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['org_id', 'object_code'], 'inventory_objects_org_id_object_code_unique');
        t.index(['org_id', 'current_warehouse_id'], 'inventory_objects_org_id_current_warehouse_id_idx');
        t.index(['org_id', 'current_location_id'], 'inventory_objects_org_id_current_location_id_idx');
        t.index(['parent_object_id'], 'inventory_objects_parent_object_id_idx');
    });

    await knex.schema.createTable('qr_entities', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.string('entity_type', 50).notNullable();
        t.string('entity_id', 100).notNullable();
        t.string('qr_code', 100).notNullable();
        t.integer('payload_version').notNullable().defaultTo(1);
        t.string('status', 20).notNullable().defaultTo('active');
        t.jsonb('payload').nullable();
        t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.unique(['qr_code'], 'qr_entities_qr_code_unique');
        t.unique(['org_id', 'entity_type', 'entity_id'], 'qr_entities_org_id_entity_type_entity_id_unique');
        t.index(['org_id', 'entity_type'], 'qr_entities_org_id_entity_type_idx');
    });

    await knex.schema.createTable('location_bindings', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.bigInteger('object_id').notNullable().references('id').inTable('inventory_objects').onDelete('CASCADE');
        t.integer('warehouse_id').notNullable().references('id').inTable('warehouses').onDelete('CASCADE');
        t.integer('location_id').notNullable().references('id').inTable('warehouse_locations').onDelete('CASCADE');
        t.uuid('operator_id').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.string('binding_mode', 20).notNullable().defaultTo('scan');
        t.timestamp('bound_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('unbound_at', { useTz: true }).nullable();
        t.uuid('released_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.text('release_reason').nullable();
        t.jsonb('metadata').nullable();

        t.index(['org_id', 'warehouse_id'], 'location_bindings_org_id_warehouse_id_idx');
        t.index(['org_id', 'location_id'], 'location_bindings_org_id_location_id_idx');
        t.index(['object_id', 'bound_at'], 'location_bindings_object_id_bound_at_idx');
    });

    await knex.raw(`
        CREATE UNIQUE INDEX location_bindings_active_object_unique
        ON location_bindings (object_id)
        WHERE unbound_at IS NULL
    `);

    await knex.schema.createTable('twin_events', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations');
        t.integer('warehouse_id').nullable().references('id').inTable('warehouses').onDelete('SET NULL');
        t.integer('location_id').nullable().references('id').inTable('warehouse_locations').onDelete('SET NULL');
        t.bigInteger('object_id').nullable().references('id').inTable('inventory_objects').onDelete('SET NULL');
        t.string('event_type', 50).notNullable();
        t.string('event_status', 20).notNullable().defaultTo('committed');
        t.uuid('actor_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.string('source', 30).notNullable().defaultTo('system');
        t.jsonb('event_payload').nullable();
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['org_id', 'created_at'], 'twin_events_org_id_created_at_idx');
        t.index(['org_id', 'event_type'], 'twin_events_org_id_event_type_idx');
    });
}

export async function down(knex) {
    await knex.raw('DROP INDEX IF EXISTS location_bindings_active_object_unique');
    await knex.schema.dropTableIfExists('twin_events');
    await knex.schema.dropTableIfExists('location_bindings');
    await knex.schema.dropTableIfExists('qr_entities');
    await knex.schema.dropTableIfExists('inventory_objects');
    await knex.schema.dropTableIfExists('item_shape_templates');
    await knex.schema.dropTableIfExists('rack_instances');
    await knex.schema.dropTableIfExists('rack_templates');
    await knex.schema.dropTableIfExists('warehouse_zones');
}

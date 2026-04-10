export async function up(knex) {
    await knex.schema.alterTable('warehouses', (t) => {
        t.jsonb('dimensions_mm').nullable();
        t.jsonb('origin').nullable();
        t.integer('floor_count').notNullable().defaultTo(1);
        t.integer('scene_version').notNullable().defaultTo(1);
        t.jsonb('layout_json').nullable();
    });

    await knex.schema.alterTable('warehouse_locations', (t) => {
        t.jsonb('transform').nullable();
        t.jsonb('dimensions_mm').nullable();
        t.decimal('max_weight_kg', 12, 2).nullable();
        t.string('occupancy_mode', 20).notNullable().defaultTo('count');
        t.string('rack_instance_code', 100).nullable();
        t.string('slot_path', 200).nullable();
    });

    await knex.schema.alterTable('org_inventory_units', (t) => {
        t.string('shape_template_code', 100).nullable();
        t.jsonb('dimensions_mm').nullable();
        t.decimal('weight_kg', 12, 2).nullable();
        t.bigInteger('parent_unit_id').nullable().references('id').inTable('org_inventory_units').onDelete('SET NULL');
        t.string('object_level', 20).notNullable().defaultTo('unit');
    });

    await knex.schema.alterTable('org_inventory_units', (t) => {
        t.index(['parent_unit_id'], 'org_inventory_units_parent_unit_id_idx');
        t.index(['org_id', 'object_level'], 'org_inventory_units_org_id_object_level_idx');
    });
}

export async function down(knex) {
    await knex.schema.alterTable('org_inventory_units', (t) => {
        t.dropIndex(['parent_unit_id'], 'org_inventory_units_parent_unit_id_idx');
        t.dropIndex(['org_id', 'object_level'], 'org_inventory_units_org_id_object_level_idx');
    });

    await knex.schema.alterTable('org_inventory_units', (t) => {
        t.dropColumn('object_level');
        t.dropColumn('parent_unit_id');
        t.dropColumn('weight_kg');
        t.dropColumn('dimensions_mm');
        t.dropColumn('shape_template_code');
    });

    await knex.schema.alterTable('warehouse_locations', (t) => {
        t.dropColumn('slot_path');
        t.dropColumn('rack_instance_code');
        t.dropColumn('occupancy_mode');
        t.dropColumn('max_weight_kg');
        t.dropColumn('dimensions_mm');
        t.dropColumn('transform');
    });

    await knex.schema.alterTable('warehouses', (t) => {
        t.dropColumn('layout_json');
        t.dropColumn('scene_version');
        t.dropColumn('floor_count');
        t.dropColumn('origin');
        t.dropColumn('dimensions_mm');
    });
}

import test from 'node:test';
import assert from 'node:assert/strict';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');

const expectedTables = [
    'warehouse_zones',
    'rack_templates',
    'rack_instances',
    'item_shape_templates',
    'inventory_objects',
    'qr_entities',
    'location_bindings',
    'twin_events',
];

test('inventory twin phase1 schema provides twin fields, twin tables, and uniqueness constraints', async (t) => {
    await knex.migrate.rollback(undefined, true);
    await knex.migrate.latest();

    const warehouseColumns = ['dimensions_mm', 'origin', 'floor_count', 'scene_version', 'layout_json'];
    for (const column of warehouseColumns) {
        assert.equal(await knex.schema.hasColumn('warehouses', column), true, `warehouses.${column} should exist`);
    }

    const locationColumns = ['transform', 'dimensions_mm', 'max_weight_kg', 'occupancy_mode', 'rack_instance_code', 'slot_path'];
    for (const column of locationColumns) {
        assert.equal(await knex.schema.hasColumn('warehouse_locations', column), true, `warehouse_locations.${column} should exist`);
    }

    const unitColumns = ['shape_template_code', 'dimensions_mm', 'weight_kg', 'parent_unit_id', 'object_level'];
    for (const column of unitColumns) {
        assert.equal(await knex.schema.hasColumn('org_inventory_units', column), true, `org_inventory_units.${column} should exist`);
    }

    for (const tableName of expectedTables) {
        assert.equal(await knex.schema.hasTable(tableName), true, `${tableName} should exist`);
    }

    const indexRows = await knex('pg_indexes')
        .select('tablename', 'indexname')
        .whereIn('tablename', ['rack_templates', 'rack_instances', 'item_shape_templates', 'inventory_objects', 'qr_entities', 'location_bindings'])
        .whereIn('indexname', [
            'rack_templates_org_id_code_unique',
            'rack_instances_warehouse_id_code_unique',
            'item_shape_templates_org_id_code_unique',
            'inventory_objects_org_id_object_code_unique',
            'qr_entities_qr_code_unique',
            'location_bindings_active_object_unique',
        ]);

    const indexNames = new Set(indexRows.map((row) => row.indexname));
    assert.equal(indexNames.has('rack_templates_org_id_code_unique'), true);
    assert.equal(indexNames.has('rack_instances_warehouse_id_code_unique'), true);
    assert.equal(indexNames.has('item_shape_templates_org_id_code_unique'), true);
    assert.equal(indexNames.has('inventory_objects_org_id_object_code_unique'), true);
    assert.equal(indexNames.has('qr_entities_qr_code_unique'), true);
    assert.equal(indexNames.has('location_bindings_active_object_unique'), true);

    t.after(async () => {
        await knex.destroy();
    });
});

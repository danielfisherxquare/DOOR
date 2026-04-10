import test, { after } from 'node:test';
import assert from 'node:assert/strict';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
const twinService = await import('../src/modules/inventory/inventory.twin.service.js');

after(async () => {
    await knex.destroy();
});

test('scan binding creates one active binding, updates legacy location fields, and rejects duplicates', async () => {
    await knex.migrate.rollback(undefined, true);
    await knex.migrate.latest();

    const [org] = await knex('organizations').insert({ name: 'Twin Binding Org', slug: 'twin-binding-org' }).returning('*');
    const warehouse = await twinService.createTwinWarehouse(org.id, {
        code: 'WH-BIND',
        name: 'Binding Warehouse',
        dimensionsMm: { widthMm: 24000, depthMm: 18000, heightMm: 9000 },
        origin: { x: 0, y: 0, z: 0 },
    });

    const [batch] = await knex('org_inventory_batches').insert({
        org_id: org.id,
        batch_name: 'Binding Batch',
        batch_type: 'other',
        total_quantity: 1,
        status: 'active',
    }).returning('*');

    const [legacyUnit] = await knex('org_inventory_units').insert({
        org_id: org.id,
        batch_id: batch.id,
        qr_code: 'LEG-UNIT-001',
        item_type: 'other',
        status: 'in_stock',
        current_holder_type: 'org',
        current_holder_id: org.id,
    }).returning('*');

    const [locationA, locationB] = await twinService.batchGenerateLocations(org.id, {
        warehouseId: warehouse.id,
        zone: 'A',
        capacity: 1,
        slots: [
            {
                aisle: '01',
                shelf: '01',
                position: '01',
                dimensionsMm: { widthMm: 800, depthMm: 800, heightMm: 800 },
                transform: { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0 },
            },
            {
                aisle: '01',
                shelf: '01',
                position: '02',
                dimensionsMm: { widthMm: 800, depthMm: 800, heightMm: 800 },
                transform: { x: 900, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0 },
            },
        ],
    });

    const object = await twinService.createInventoryObject(org.id, {
        legacyUnitId: legacyUnit.id,
        batchId: batch.id,
        objectCode: 'OBJ-001',
        objectLevel: 'unit',
        shapeType: 'box',
        dimensionsMm: { widthMm: 600, depthMm: 600, heightMm: 600 },
        weightKg: 12.5,
        status: 'in_stock',
    });

    await twinService.createQrEntity(org.id, {
        entityType: 'inventory_object',
        entityId: String(object.id),
        qrCode: 'OBJ-001',
        payload: { objectId: object.id },
    });
    await twinService.createQrEntity(org.id, {
        entityType: 'location',
        entityId: String(locationA.id),
        qrCode: 'LOC-A-01',
        payload: { locationId: locationA.id },
    });
    await twinService.createQrEntity(org.id, {
        entityType: 'location',
        entityId: String(locationB.id),
        qrCode: 'LOC-A-02',
        payload: { locationId: locationB.id },
    });

    const firstBinding = await twinService.scanBinding(org.id, {
        objectQr: 'OBJ-001',
        locationQr: 'LOC-A-01',
    });

    assert.equal(firstBinding.binding.binding_mode, 'scan');
    assert.equal(firstBinding.object.current_location_id, locationA.id);
    assert.equal(firstBinding.object.current_warehouse_id, warehouse.id);
    assert.equal(firstBinding.legacyUnit.location_id, locationA.id);
    assert.equal(firstBinding.legacyUnit.warehouse_id, warehouse.id);
    assert.equal(firstBinding.location.used_capacity, 1);
    assert.equal(firstBinding.location.status, 'full');
    assert.equal(firstBinding.transaction.transaction_type, 'inbound');
    assert.equal(firstBinding.event.event_type, 'inbound');

    const activeBindingsAfterFirst = await knex('location_bindings')
        .where({ org_id: org.id, object_id: object.id })
        .whereNull('unbound_at');
    assert.equal(activeBindingsAfterFirst.length, 1);

    await assert.rejects(
        () => twinService.scanBinding(org.id, {
            objectQr: 'OBJ-001',
            locationQr: 'LOC-A-01',
        }),
        /already bound/i
    );

    const movedBinding = await twinService.moveBinding(org.id, {
        objectQr: 'OBJ-001',
        locationQr: 'LOC-A-02',
    });

    assert.equal(movedBinding.binding.binding_mode, 'move');
    assert.equal(movedBinding.object.current_location_id, locationB.id);
    assert.equal(movedBinding.legacyUnit.location_id, locationB.id);
    assert.equal(movedBinding.location.id, locationB.id);
    assert.equal(movedBinding.location.used_capacity, 1);
    assert.equal(movedBinding.location.status, 'full');
    assert.equal(movedBinding.transaction.transaction_type, 'transfer');
    assert.equal(movedBinding.event.event_type, 'transfer');

    const locationAReloaded = await knex('warehouse_locations').where({ id: locationA.id }).first();
    assert.equal(locationAReloaded.used_capacity, 0);
    assert.equal(locationAReloaded.status, 'empty');

    const activeBindingsAfterMove = await knex('location_bindings')
        .where({ org_id: org.id, object_id: object.id })
        .whereNull('unbound_at');
    assert.equal(activeBindingsAfterMove.length, 1);

    const allBindingsAfterMove = await knex('location_bindings')
        .where({ org_id: org.id, object_id: object.id })
        .orderBy('id', 'asc');
    assert.equal(allBindingsAfterMove.length, 2);
    assert.ok(allBindingsAfterMove[0].unbound_at);
    assert.equal(allBindingsAfterMove[1].location_id, locationB.id);

    const unbound = await twinService.unbindBinding(org.id, {
        objectQr: 'OBJ-001',
        reason: 'manual_unbind',
    });

    assert.equal(unbound.object.current_location_id, null);
    assert.equal(unbound.object.current_warehouse_id, null);
    assert.equal(unbound.legacyUnit.location_id, null);
    assert.equal(unbound.legacyUnit.warehouse_id, null);
    assert.equal(unbound.event.event_type, 'unbind');

    const locationBReloaded = await knex('warehouse_locations').where({ id: locationB.id }).first();
    assert.equal(locationBReloaded.used_capacity, 0);
    assert.equal(locationBReloaded.status, 'empty');

    const activeBindingsAfterUnbind = await knex('location_bindings')
        .where({ org_id: org.id, object_id: object.id })
        .whereNull('unbound_at');
    assert.equal(activeBindingsAfterUnbind.length, 0);

    const transactionTypes = await knex('inventory_transactions')
        .where({ org_id: org.id, unit_id: legacyUnit.id })
        .orderBy('id', 'asc')
        .pluck('transaction_type');
    assert.deepEqual(transactionTypes, ['inbound', 'transfer', 'transfer']);
});

test('phase 1 binding rejects cross-warehouse scan and move operations', async () => {
    await knex.migrate.rollback(undefined, true);
    await knex.migrate.latest();

    const [org] = await knex('organizations').insert({ name: 'Twin Cross Warehouse Org', slug: 'twin-cross-warehouse-org' }).returning('*');
    const warehouseA = await twinService.createTwinWarehouse(org.id, {
        code: 'WH-CROSS-A',
        name: 'Cross Warehouse A',
        dimensionsMm: { widthMm: 18000, depthMm: 16000, heightMm: 8000 },
        origin: { x: 0, y: 0, z: 0 },
    });
    const warehouseB = await twinService.createTwinWarehouse(org.id, {
        code: 'WH-CROSS-B',
        name: 'Cross Warehouse B',
        dimensionsMm: { widthMm: 18000, depthMm: 16000, heightMm: 8000 },
        origin: { x: 0, y: 0, z: 0 },
    });

    const [batch] = await knex('org_inventory_batches').insert({
        org_id: org.id,
        batch_name: 'Cross Warehouse Batch',
        batch_type: 'other',
        total_quantity: 2,
        status: 'active',
    }).returning('*');

    const [legacyUnitA, legacyUnitB] = await knex('org_inventory_units').insert([
        {
            org_id: org.id,
            batch_id: batch.id,
            qr_code: 'LEG-CROSS-001',
            item_type: 'other',
            status: 'in_stock',
            current_holder_type: 'org',
            current_holder_id: org.id,
        },
        {
            org_id: org.id,
            batch_id: batch.id,
            qr_code: 'LEG-CROSS-002',
            item_type: 'other',
            status: 'in_stock',
            current_holder_type: 'org',
            current_holder_id: org.id,
        },
    ]).returning('*');

    const [locationA] = await twinService.batchGenerateLocations(org.id, {
        warehouseId: warehouseA.id,
        zone: 'A',
        capacity: 1,
        slots: [
            {
                aisle: '01',
                shelf: '01',
                position: '01',
                dimensionsMm: { widthMm: 1000, depthMm: 1000, heightMm: 1000 },
                transform: { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0 },
            },
        ],
    });
    const [locationB] = await twinService.batchGenerateLocations(org.id, {
        warehouseId: warehouseB.id,
        zone: 'B',
        capacity: 1,
        slots: [
            {
                aisle: '01',
                shelf: '01',
                position: '01',
                dimensionsMm: { widthMm: 1000, depthMm: 1000, heightMm: 1000 },
                transform: { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0 },
            },
        ],
    });

    const objectForScan = await twinService.createInventoryObject(org.id, {
        legacyUnitId: legacyUnitA.id,
        batchId: batch.id,
        objectCode: 'OBJ-CROSS-SCAN',
        objectLevel: 'unit',
        shapeType: 'box',
        dimensionsMm: { widthMm: 500, depthMm: 500, heightMm: 500 },
        weightKg: 5,
        status: 'in_stock',
        currentWarehouseId: warehouseA.id,
    });
    const objectForMove = await twinService.createInventoryObject(org.id, {
        legacyUnitId: legacyUnitB.id,
        batchId: batch.id,
        objectCode: 'OBJ-CROSS-MOVE',
        objectLevel: 'unit',
        shapeType: 'box',
        dimensionsMm: { widthMm: 500, depthMm: 500, heightMm: 500 },
        weightKg: 5,
        status: 'in_stock',
    });

    await twinService.createQrEntity(org.id, {
        entityType: 'inventory_object',
        entityId: String(objectForScan.id),
        qrCode: 'OBJ-CROSS-SCAN',
        payload: { objectId: objectForScan.id },
    });
    await twinService.createQrEntity(org.id, {
        entityType: 'inventory_object',
        entityId: String(objectForMove.id),
        qrCode: 'OBJ-CROSS-MOVE',
        payload: { objectId: objectForMove.id },
    });
    await twinService.createQrEntity(org.id, {
        entityType: 'location',
        entityId: String(locationA.id),
        qrCode: 'LOC-CROSS-A',
        payload: { locationId: locationA.id },
    });
    await twinService.createQrEntity(org.id, {
        entityType: 'location',
        entityId: String(locationB.id),
        qrCode: 'LOC-CROSS-B',
        payload: { locationId: locationB.id },
    });

    await assert.rejects(
        () => twinService.scanBinding(org.id, {
            objectQr: 'OBJ-CROSS-SCAN',
            locationQr: 'LOC-CROSS-B',
        }),
        /cross-warehouse binding is not allowed/i
    );

    const firstBinding = await twinService.scanBinding(org.id, {
        objectQr: 'OBJ-CROSS-MOVE',
        locationQr: 'LOC-CROSS-A',
    });
    assert.equal(firstBinding.object.current_warehouse_id, warehouseA.id);
    assert.equal(firstBinding.object.current_location_id, locationA.id);

    await assert.rejects(
        () => twinService.moveBinding(org.id, {
            objectQr: 'OBJ-CROSS-MOVE',
            locationQr: 'LOC-CROSS-B',
        }),
        /cross-warehouse binding is not allowed/i
    );

    const objectAfterMoveAttempt = await knex('inventory_objects').where({ org_id: org.id, id: objectForMove.id }).first();
    assert.equal(objectAfterMoveAttempt.current_warehouse_id, warehouseA.id);
    assert.equal(objectAfterMoveAttempt.current_location_id, locationA.id);

    const locationBReloaded = await knex('warehouse_locations').where({ org_id: org.id, id: locationB.id }).first();
    assert.equal(locationBReloaded.used_capacity, 0);
    assert.equal(locationBReloaded.status, 'empty');
});

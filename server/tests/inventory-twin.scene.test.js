import test, { after } from 'node:test';
import assert from 'node:assert/strict';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
const twinService = await import('../src/modules/inventory/inventory.twin.service.js');

after(async () => {
    await knex.destroy();
});

test('scene endpoint returns warehouse, zones, rack instances, locations, objects, and sceneVersion', async () => {
    await knex.migrate.rollback(undefined, true);
    await knex.migrate.latest();

    const [org] = await knex('organizations').insert({ name: 'Twin Scene Org', slug: 'twin-scene-org' }).returning('*');
    const warehouse = await twinService.createTwinWarehouse(org.id, {
        code: 'WH-SCENE',
        name: 'Scene Warehouse',
        dimensionsMm: { widthMm: 36000, depthMm: 22000, heightMm: 10000 },
        origin: { x: 0, y: 0, z: 0 },
    });
    await twinService.saveTwinWarehouseLayout(org.id, warehouse.id, {
        camera: 'perspective',
        layers: ['racks', 'locations', 'objects'],
    });

    await twinService.createWarehouseZone(org.id, {
        warehouseId: warehouse.id,
        code: 'ZONE-S',
        name: 'Scene Zone',
        boundsMm: { x: 0, y: 0, z: 0, widthMm: 12000, depthMm: 12000, heightMm: 4000 },
    });

    const rackTemplate = await twinService.createRackTemplate(org.id, {
        code: 'RACK-S',
        name: 'Scene Rack Template',
        shapeType: 'standard',
        outerDimensionsMm: { widthMm: 2400, depthMm: 1000, heightMm: 3200 },
        levels: 2,
        bays: 2,
        slotRule: { levels: 2, bays: 2 },
    });

    const rackInstance = await twinService.createRackInstance(org.id, {
        warehouseId: warehouse.id,
        rackTemplateId: rackTemplate.id,
        code: 'RACK-S-01',
        name: 'Scene Rack 01',
        positionMm: { x: 1000, y: 0, z: 2000 },
    });

    const [batch] = await knex('org_inventory_batches').insert({
        org_id: org.id,
        batch_name: 'Scene Batch',
        batch_type: 'other',
        total_quantity: 1,
        status: 'active',
    }).returning('*');

    const [legacyUnit] = await knex('org_inventory_units').insert({
        org_id: org.id,
        batch_id: batch.id,
        qr_code: 'LEG-SCENE-001',
        item_type: 'other',
        status: 'in_stock',
        current_holder_type: 'org',
        current_holder_id: org.id,
    }).returning('*');

    const [location] = await twinService.batchGenerateLocations(org.id, {
        warehouseId: warehouse.id,
        rackInstanceCode: rackInstance.code,
        zone: 'S',
        slots: [
            {
                aisle: '01',
                shelf: '01',
                position: '01',
                slotPath: 'L1/B1/P1',
                dimensionsMm: { widthMm: 800, depthMm: 800, heightMm: 800 },
                transform: { x: 1000, y: 0, z: 2000, rotationX: 0, rotationY: 0, rotationZ: 0 },
            },
        ],
    });

    const object = await twinService.createInventoryObject(org.id, {
        legacyUnitId: legacyUnit.id,
        batchId: batch.id,
        objectCode: 'OBJ-SCENE-001',
        objectLevel: 'unit',
        shapeType: 'box',
        dimensionsMm: { widthMm: 600, depthMm: 600, heightMm: 600 },
        weightKg: 8.4,
        currentWarehouseId: warehouse.id,
    });

    await twinService.createQrEntity(org.id, {
        entityType: 'inventory_object',
        entityId: String(object.id),
        qrCode: 'OBJ-SCENE-001',
        payload: { objectId: object.id },
    });
    await twinService.createQrEntity(org.id, {
        entityType: 'location',
        entityId: String(location.id),
        qrCode: 'LOC-SCENE-001',
        payload: { locationId: location.id },
    });

    await twinService.scanBinding(org.id, {
        objectQr: 'OBJ-SCENE-001',
        locationQr: 'LOC-SCENE-001',
    });

    const scene = await twinService.getTwinScene(org.id, warehouse.id);

    assert.equal(scene.warehouse.id, warehouse.id);
    assert.equal(scene.version, 2);
    assert.deepEqual(scene.warehouse.layout_json, {
        camera: 'perspective',
        layers: ['racks', 'locations', 'objects'],
    });
    assert.equal(scene.zones.length, 1);
    assert.equal(scene.racks.length, 1);
    assert.equal(scene.locations.length, 1);
    assert.equal(scene.objects.length, 1);
    assert.equal(scene.alerts.length, 0);
    assert.ok(scene.events.length >= 1);
    assert.equal(scene.events[0].warehouseId, warehouse.id);
    assert.equal(scene.events[0].eventType, 'inbound');
    assert.equal(scene.events[0].eventStatus, 'committed');
});

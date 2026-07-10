import test, { after } from 'node:test';
import assert from 'node:assert/strict';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
const twinService = await import('../src/modules/inventory/inventory.twin.service.js');

after(async () => {
    await knex.destroy();
});

test('inventory twin repository creates warehouses, rack templates, instances, locations, and objects with org isolation', async () => {
    await knex.migrate.rollback(undefined, true);
    await knex.migrate.latest();

    const [orgA] = await knex('organizations').insert({ name: 'Twin Org A', slug: 'twin-org-a' }).returning('*');
    const [orgB] = await knex('organizations').insert({ name: 'Twin Org B', slug: 'twin-org-b' }).returning('*');

    const warehouseA = await twinService.createTwinWarehouse(orgA.id, {
        code: 'WH-A',
        name: 'Warehouse A',
        dimensionsMm: { widthMm: 50000, depthMm: 30000, heightMm: 12000 },
        origin: { x: 0, y: 0, z: 0 },
    });
    await twinService.createTwinWarehouse(orgB.id, {
        code: 'WH-B',
        name: 'Warehouse B',
        dimensionsMm: { widthMm: 25000, depthMm: 20000, heightMm: 8000 },
        origin: { x: 10, y: 0, z: 10 },
    });

    assert.equal(warehouseA.floor_count, 1);
    assert.equal(warehouseA.scene_version, 1);

    const layout = await twinService.saveTwinWarehouseLayout(orgA.id, warehouseA.id, {
        camera: 'top',
        nodes: [{ kind: 'rack', code: 'RACK-A-01' }],
    });
    assert.equal(layout.scene_version, 2);

    const concurrentLayouts = await Promise.all([
        twinService.saveTwinWarehouseLayout(orgA.id, warehouseA.id, { camera: 'front' }),
        twinService.saveTwinWarehouseLayout(orgA.id, warehouseA.id, { camera: 'side' }),
    ]);
    assert.deepEqual(
        concurrentLayouts.map((item) => item.scene_version).sort((left, right) => left - right),
        [3, 4]
    );

    const zone = await twinService.createWarehouseZone(orgA.id, {
        warehouseId: warehouseA.id,
        code: 'ZONE-A',
        name: 'Storage Zone A',
        boundsMm: { x: 0, y: 0, z: 0, widthMm: 10000, depthMm: 10000, heightMm: 4000 },
    });
    assert.equal(zone.code, 'ZONE-A');

    const rackTemplate = await twinService.createRackTemplate(orgA.id, {
        code: 'RACK-STD',
        name: 'Standard Rack',
        shapeType: 'standard',
        outerDimensionsMm: { widthMm: 2400, depthMm: 1000, heightMm: 3000 },
        levels: 3,
        bays: 2,
        slotRule: { levels: 3, bays: 2 },
        allowedShapeTypes: ['box', 'bin'],
    });

    const rackInstance = await twinService.createRackInstance(orgA.id, {
        warehouseId: warehouseA.id,
        rackTemplateId: rackTemplate.id,
        code: 'RACK-A-01',
        name: 'Rack A 01',
        positionMm: { x: 1200, y: 0, z: 1800 },
        rotationDeg: { x: 0, y: 90, z: 0 },
    });

    const locations = await twinService.batchGenerateLocations(orgA.id, {
        warehouseId: warehouseA.id,
        rackInstanceCode: rackInstance.code,
        zone: 'A',
        slots: [
            {
                aisle: '01',
                shelf: '01',
                position: '01',
                slotPath: 'L1/B1/P1',
                dimensionsMm: { widthMm: 600, depthMm: 800, heightMm: 500 },
                transform: { x: 1200, y: 0, z: 1800, rotationX: 0, rotationY: 0, rotationZ: 0 },
            },
            {
                aisle: '01',
                shelf: '01',
                position: '02',
                slotPath: 'L1/B1/P2',
                dimensionsMm: { widthMm: 600, depthMm: 800, heightMm: 500 },
                transform: { x: 1800, y: 0, z: 1800, rotationX: 0, rotationY: 0, rotationZ: 0 },
            },
        ],
    });

    assert.equal(locations.length, 2);
    assert.equal(locations[0].code, 'A-01-01-01');
    assert.equal(locations[0].rack_instance_code, 'RACK-A-01');
    assert.match(locations[0].qr_code, new RegExp(`^LOC-${warehouseA.id}-`));

    const shapeTemplate = await twinService.createItemShapeTemplate(orgA.id, {
        code: 'BOX-L',
        name: 'Large Box',
        shapeType: 'box',
        dimensionsMm: { widthMm: 580, depthMm: 780, heightMm: 480 },
        defaultWeightKg: 18.5,
    });

    const [batch] = await knex('org_inventory_batches').insert({
        org_id: orgA.id,
        batch_name: 'Twin Repo Batch',
        batch_type: 'other',
        total_quantity: 1,
        status: 'active',
    }).returning('*');

    const inventoryObject = await twinService.createInventoryObject(orgA.id, {
        batchId: batch.id,
        shapeTemplateId: shapeTemplate.id,
        objectCode: 'OBJ-001',
        objectLevel: 'unit',
        shapeType: 'box',
        dimensionsMm: { widthMm: 580, depthMm: 780, heightMm: 480 },
        weightKg: 16.2,
        currentWarehouseId: warehouseA.id,
        currentLocationId: locations[0].id,
    });

    assert.equal(inventoryObject.current_warehouse_id, warehouseA.id);
    assert.equal(inventoryObject.current_location_id, locations[0].id);

    const qrEntity = await twinService.createQrEntity(orgA.id, {
        entityType: 'location',
        entityId: String(locations[0].id),
        qrCode: locations[0].qr_code,
        payload: { warehouseId: warehouseA.id, locationId: locations[0].id },
    });
    assert.equal(qrEntity.entity_type, 'location');

    const foundQrEntity = await twinService.findQrEntityByCode(orgA.id, locations[0].qr_code);
    assert.ok(foundQrEntity);
    assert.equal(foundQrEntity.entity_id, String(locations[0].id));

    const warehousesA = await twinService.getTwinWarehouses(orgA.id);
    const racksA = await twinService.getRackInstances(orgA.id, { warehouseId: warehouseA.id });
    const locationsA = await twinService.getTwinLocations(orgA.id, { warehouseId: warehouseA.id });
    const objectsA = await twinService.getInventoryObjects(orgA.id, { warehouseId: warehouseA.id });
    const objectsByBatch = await twinService.getInventoryObjects(orgA.id, { batchId: batch.id });
    const zonesA = await twinService.getWarehouseZones(orgA.id, { warehouseId: warehouseA.id });

    assert.equal(warehousesA.length, 1);
    assert.equal(racksA.length, 1);
    assert.equal(locationsA.length, 2);
    assert.equal(objectsA.length, 1);
    assert.equal(objectsByBatch.length, 1);
    assert.equal(zonesA.length, 1);
    assert.equal(warehousesA[0].org_id, orgA.id);
    assert.equal(objectsA[0].object_code, 'OBJ-001');
    assert.equal(objectsByBatch[0].batch_id, batch.id);

    const warehousesB = await twinService.getTwinWarehouses(orgB.id);
    assert.equal(warehousesB.length, 1);
    assert.equal(warehousesB[0].code, 'WH-B');
});

test('inventory twin service validates dimensions and allowed shape types', async () => {
    await assert.rejects(
        () => twinService.createRackTemplate('fake-org', {
            code: 'BAD-RACK',
            name: 'Bad Rack',
            shapeType: 'standard',
            outerDimensionsMm: { widthMm: 1000, depthMm: 500 },
            allowedShapeTypes: ['box'],
        }),
        /outerDimensionsMm\.heightMm is required/
    );

    await assert.rejects(
        () => twinService.createRackTemplate('fake-org', {
            code: 'BAD-SHAPES',
            name: 'Bad Shapes',
            shapeType: 'standard',
            outerDimensionsMm: { widthMm: 1000, depthMm: 500, heightMm: 2000 },
            allowedShapeTypes: ['triangle'],
        }),
        /allowedShapeTypes item must be one of/
    );
});

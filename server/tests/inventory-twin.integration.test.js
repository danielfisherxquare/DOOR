import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door_test';
process.env.DATABASE_URL = DATABASE_URL;

const { default: knex } = await import('../src/db/knex.js');
const { default: inventoryRoutes } = await import('../src/modules/inventory/inventory.routes.js');

let server;
let baseUrl;

async function api(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
}

after(async () => {
    server?.close();
    await knex.destroy();
});

test('inventory twin integration flow keeps legacy location fields in sync and rejects a concurrent second bind', async () => {
    await knex.migrate.rollback(undefined, true);
    await knex.migrate.latest();

    const [org] = await knex('organizations').insert({
        name: 'Twin Integration Org',
        slug: 'twin-integration-org',
    }).returning('*');

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.authContext = { role: 'org_admin', orgId: org.id, userId: null };
        next();
    });
    app.use('/api/inventory', inventoryRoutes);
    app.use((error, _req, res, _next) => {
        res.status(500).json({ success: false, message: error.message });
    });
    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;

    const warehouseResult = await api('/api/inventory/twin/warehouses', {
        method: 'POST',
        body: JSON.stringify({
            code: 'WH-INT',
            name: 'Integration Warehouse',
            dimensionsMm: { widthMm: 24000, depthMm: 18000, heightMm: 9000 },
            origin: { x: 0, y: 0, z: 0 },
        }),
    });
    assert.equal(warehouseResult.status, 200);
    const warehouse = warehouseResult.body.data;

    const rackTemplateResult = await api('/api/inventory/twin/rack-templates', {
        method: 'POST',
        body: JSON.stringify({
            code: 'RACK-INT',
            name: 'Integration Rack',
            shapeType: 'standard',
            outerDimensionsMm: { widthMm: 2400, depthMm: 1000, heightMm: 3000 },
            levels: 3,
            bays: 2,
            slotRule: { levels: 3, bays: 2 },
        }),
    });
    assert.equal(rackTemplateResult.status, 200);
    const rackTemplate = rackTemplateResult.body.data;

    const rackInstanceResult = await api('/api/inventory/twin/rack-instances', {
        method: 'POST',
        body: JSON.stringify({
            warehouseId: warehouse.id,
            rackTemplateId: rackTemplate.id,
            code: 'RACK-INT-01',
            name: 'Integration Rack 01',
            positionMm: { x: 1200, y: 0, z: 1800 },
        }),
    });
    assert.equal(rackInstanceResult.status, 200);

    const locationResult = await api('/api/inventory/twin/locations/batch-generate', {
        method: 'POST',
        body: JSON.stringify({
            warehouseId: warehouse.id,
            rackInstanceCode: 'RACK-INT-01',
            zone: 'A',
            capacity: 1,
            slots: [
                {
                    aisle: '01',
                    shelf: '01',
                    position: '01',
                    slotPath: 'L1/B1/P1',
                    dimensionsMm: { widthMm: 900, depthMm: 900, heightMm: 900 },
                    transform: { x: 1200, y: 0, z: 1800, rotationX: 0, rotationY: 0, rotationZ: 0 },
                },
                {
                    aisle: '01',
                    shelf: '01',
                    position: '02',
                    slotPath: 'L1/B1/P2',
                    dimensionsMm: { widthMm: 900, depthMm: 900, heightMm: 900 },
                    transform: { x: 2100, y: 0, z: 1800, rotationX: 0, rotationY: 0, rotationZ: 0 },
                },
            ],
        }),
    });
    assert.equal(locationResult.status, 200);
    const [locationA, locationB] = locationResult.body.data;

    const [batch] = await knex('org_inventory_batches').insert({
        org_id: org.id,
        batch_name: 'Integration Batch',
        batch_type: 'other',
        total_quantity: 1,
        status: 'active',
    }).returning('*');

    const [legacyUnit] = await knex('org_inventory_units').insert({
        org_id: org.id,
        batch_id: batch.id,
        qr_code: 'LEG-INT-001',
        item_type: 'other',
        status: 'in_stock',
        current_holder_type: 'org',
        current_holder_id: org.id,
    }).returning('*');

    const objectResult = await api('/api/inventory/twin/objects', {
        method: 'POST',
        body: JSON.stringify({
            legacyUnitId: legacyUnit.id,
            batchId: batch.id,
            objectCode: 'OBJ-INT-001',
            objectLevel: 'unit',
            shapeType: 'box',
            dimensionsMm: { widthMm: 600, depthMm: 600, heightMm: 600 },
            weightKg: 8.5,
            currentWarehouseId: warehouse.id,
        }),
    });
    assert.equal(objectResult.status, 200);

    const bindResults = await Promise.all([
        api('/api/inventory/twin/bindings/scan', {
            method: 'POST',
            body: JSON.stringify({ objectQr: 'OBJ-INT-001', locationQr: locationA.qr_code }),
        }),
        api('/api/inventory/twin/bindings/scan', {
            method: 'POST',
            body: JSON.stringify({ objectQr: 'OBJ-INT-001', locationQr: locationB.qr_code }),
        }),
    ]);

    const successResults = bindResults.filter((result) => result.status === 200);
    const failureResults = bindResults.filter((result) => result.status !== 200);

    assert.equal(successResults.length, 1);
    assert.equal(failureResults.length, 1);
    assert.equal(successResults[0].body.success, true);
    assert.equal(failureResults[0].body.success, false);
    assert.match(String(failureResults[0].body.message || ''), /duplicate key|already bound|location_bindings/i);

    const winningLocationId = successResults[0].body.data.location.id;
    assert.ok([locationA.id, locationB.id].includes(winningLocationId));

    const refreshedLegacyUnit = await knex('org_inventory_units').where({ org_id: org.id, id: legacyUnit.id }).first();
    assert.equal(refreshedLegacyUnit.warehouse_id, warehouse.id);
    assert.equal(refreshedLegacyUnit.location_id, winningLocationId);

    const refreshedObject = await knex('inventory_objects').where({ org_id: org.id, object_code: 'OBJ-INT-001' }).first();
    assert.equal(refreshedObject.current_warehouse_id, warehouse.id);
    assert.equal(refreshedObject.current_location_id, winningLocationId);

    const activeBindings = await knex('location_bindings')
        .where({ org_id: org.id, object_id: refreshedObject.id })
        .whereNull('unbound_at');
    assert.equal(activeBindings.length, 1);

    const occupiedLocations = await knex('warehouse_locations')
        .where({ org_id: org.id, warehouse_id: warehouse.id })
        .andWhere('used_capacity', '>', 0)
        .orderBy('id', 'asc');
    assert.equal(occupiedLocations.length, 1);
    assert.equal(occupiedLocations[0].id, winningLocationId);
});

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

test('batch inbound creates legacy units and syncs twin inventory objects in one flow', async () => {
    await knex.migrate.rollback(undefined, true);
    await knex.migrate.latest();

    const [org] = await knex('organizations').insert({
        name: 'Inbound Twin Org',
        slug: 'inbound-twin-org',
    }).returning('*');

    const [warehouse] = await knex('warehouses').insert({
        org_id: org.id,
        code: 'WH-IN',
        name: 'Inbound Warehouse',
        status: 'active',
    }).returning('*');

    const [batch] = await knex('org_inventory_batches').insert({
        org_id: org.id,
        batch_name: 'Inbound Batch',
        batch_type: 'bag',
        total_quantity: 0,
        status: 'draft',
    }).returning('*');

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.authContext = { role: 'org_admin', orgId: org.id, userId: null };
        next();
    });
    app.use('/api/inventory', inventoryRoutes);
    server = app.listen(0);
    baseUrl = `http://localhost:${server.address().port}`;

    const result = await api('/api/inventory/units/batch', {
        method: 'POST',
        body: JSON.stringify({
            batchId: batch.id,
            warehouseId: warehouse.id,
            items: [
                {
                    itemType: 'bag',
                    itemCategory: '参赛包',
                    itemSpec: {
                        dimensionsMm: { widthMm: 500, depthMm: 380, heightMm: 150 },
                        weightKg: 0.92,
                    },
                    quantity: 2,
                },
            ],
        }),
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.count, 2);
    assert.equal(result.body.twinObjectsCreated, 2);
    assert.equal(result.body.twinObjectsUpdated, 0);
    assert.equal(result.body.units.length, 2);

    const units = await knex('org_inventory_units')
        .where({ org_id: org.id, batch_id: batch.id })
        .orderBy('id', 'asc');
    assert.equal(units.length, 2);
    assert.ok(units.every((unit) => unit.warehouse_id === warehouse.id));

    const objects = await knex('inventory_objects')
        .where({ org_id: org.id, batch_id: batch.id })
        .orderBy('id', 'asc');
    assert.equal(objects.length, 2);
    assert.ok(objects.every((object) => object.current_warehouse_id === warehouse.id));
    assert.ok(objects.every((object) => object.object_code));
    assert.ok(objects.every((object) => object.legacy_unit_id));
    assert.equal(objects[0].shape_type, 'bin');

    const qrEntities = await knex('qr_entities')
        .where({ org_id: org.id, entity_type: 'inventory_object' })
        .orderBy('id', 'asc');
    assert.equal(qrEntities.length, 2);
    assert.equal(qrEntities[0].qr_code, objects[0].object_code);

    const refreshedBatch = await knex('org_inventory_batches').where({ id: batch.id }).first();
    assert.equal(refreshedBatch.total_quantity, 2);
});

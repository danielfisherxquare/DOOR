import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createInventoryTwinRouter } from '../src/modules/inventory/inventory.twin.routes.js';
import { parseTwinPayload } from '../src/modules/inventory/inventory.twin.schema.js';
import { twinValidation } from '../src/modules/inventory/inventory.twin.service.js';

function collectRoutes(router, prefix = '') {
    const routes = [];

    for (const layer of router.stack) {
        if (layer.route) {
            const path = `${prefix}${layer.route.path}`;
            const methods = Object.keys(layer.route.methods)
                .filter((method) => layer.route.methods[method])
                .map((method) => method.toUpperCase());

            routes.push(...methods.map((method) => `${method} ${path}`));
            continue;
        }

        if (layer.name === 'router' && layer.handle?.stack) {
            routes.push(...collectRoutes(layer.handle, prefix));
        }
    }

    return routes;
}

test('inventory twin routes expose warehouse, rack, location, shape, object, scene, and event endpoints', async () => {
    const router = createInventoryTwinRouter({
        resolveTargetOrgId: () => 'org-test',
        orgIdRequiredResponse: () => null,
    });

    const routes = collectRoutes(router);

    const expectedRoutes = [
        'GET /warehouses',
        'POST /warehouses',
        'PUT /warehouses/:id',
        'GET /warehouses/:id/layout',
        'PUT /warehouses/:id/layout',
        'GET /warehouse-zones',
        'POST /warehouse-zones',
        'PUT /warehouse-zones/:id',
        'GET /rack-templates',
        'POST /rack-templates',
        'PUT /rack-templates/:id',
        'GET /rack-instances',
        'POST /rack-instances',
        'PUT /rack-instances/:id',
        'GET /locations',
        'POST /locations',
        'PUT /locations/:id',
        'POST /locations/batch-generate',
        'POST /locations/batch-generate-qr',
        'GET /item-shapes',
        'POST /item-shapes',
        'PUT /item-shapes/:id',
        'GET /objects',
        'POST /objects',
        'PUT /objects/:id',
        'POST /bindings/scan',
        'POST /bindings/move',
        'POST /bindings/unbind',
        'GET /scene/:warehouseId',
        'GET /events',
    ];

    assert.deepEqual(routes.sort(), expectedRoutes.sort());
});

test('inventory twin payload schemas strip server-owned fields and cap batch expansion', () => {
    assert.deepEqual(parseTwinPayload('location', {
        warehouseId: 3,
        code: 'A-01',
        capacity: 2,
        usedCapacity: 999,
        orgId: 'forged',
        createdBy: 'forged',
    }), {
        warehouseId: 3,
        code: 'A-01',
        capacity: 2,
    });

    assert.throws(
        () => parseTwinPayload('batchLocations', {
            warehouseId: 3,
            slots: Array.from({ length: 1001 }, (_, index) => ({ code: `A-${index}` })),
        }),
        /1000/
    );
});

test('inventory twin value normalization rejects coercion and preserves spatial coordinates', () => {
    assert.deepEqual(
        twinValidation.normalizeWarehousePayload({
            code: 'WH-1',
            name: 'Main',
            isDefault: 'false',
            origin: { x: -25, y: 0, z: 10 },
        }),
        {
            code: 'WH-1',
            name: 'Main',
            isDefault: false,
            floorCount: 1,
            sceneVersion: 1,
            origin: { x: -25, y: 0, z: 10 },
        }
    );
    assert.throws(
        () => twinValidation.normalizeWarehousePayload({
            code: 'WH-1',
            name: 'Main',
            floorCount: -1,
        }),
        /floorCount/
    );
    assert.throws(
        () => twinValidation.normalizeLocationPayload({ warehouseId: 1.5, code: 'A-01' }),
        /warehouseId/
    );
});

test('inventory twin routes derive audit actors from auth context', async () => {
    let received;
    const service = {
        createInventoryObject: async (orgId, payload) => {
            received = { orgId, payload };
            return { id: 7 };
        },
    };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.authContext = { userId: 'user-real', orgId: 'org-real' };
        next();
    });
    app.use(createInventoryTwinRouter({
        resolveTargetOrgId: () => 'org-real',
        service,
    }));

    const response = await request(app)
        .post('/objects')
        .send({
            objectCode: 'OBJ-1',
            objectLevel: 'unit',
            shapeType: 'box',
            createdBy: 'user-forged',
            orgId: 'org-forged',
        });

    assert.equal(response.status, 200);
    assert.deepEqual(received, {
        orgId: 'org-real',
        payload: {
            objectCode: 'OBJ-1',
            objectLevel: 'unit',
            shapeType: 'box',
            createdBy: 'user-real',
        },
    });
});

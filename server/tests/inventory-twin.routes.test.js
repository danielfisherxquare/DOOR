import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryTwinRouter } from '../src/modules/inventory/inventory.twin.routes.js';

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

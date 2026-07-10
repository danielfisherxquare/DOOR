import { Router } from 'express';
import * as twinService from './inventory.twin.service.js';
import { parseTwinFilters, parseTwinId, parseTwinPayload } from './inventory.twin.schema.js';

function defaultOrgIdRequiredResponse(req, res) {
    return res.status(400).json({
        success: false,
        message: req.authContext?.role === 'super_admin'
            ? '请先选择要操作的机构'
            : '当前账号未关联机构，请联系管理员',
    });
}

export function createInventoryTwinRouter(options = {}) {
    const router = Router();
    const service = options.service || twinService;
    const resolveTargetOrgId = options.resolveTargetOrgId || ((req) => req.authContext?.orgId);
    const orgIdRequiredResponse = options.orgIdRequiredResponse || defaultOrgIdRequiredResponse;

    function requireOrgId(req, res) {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) {
            orgIdRequiredResponse(req, res);
            return null;
        }
        return orgId;
    }

    function handleMutation(handler) {
        return async (req, res, next) => {
            try {
                const orgId = requireOrgId(req, res);
                if (!orgId) return;
                const data = await handler(orgId, req);
                res.json({ success: true, data });
            } catch (error) {
                next(error);
            }
        };
    }

    router.get('/warehouses', handleMutation((orgId) => service.getTwinWarehouses(orgId)));
    router.post('/warehouses', handleMutation((orgId, req) => service.createTwinWarehouse(
        orgId,
        parseTwinPayload('warehouse', req.body)
    )));
    router.put('/warehouses/:id', handleMutation((orgId, req) => service.updateTwinWarehouse(
        orgId,
        parseTwinId(req.params.id),
        parseTwinPayload('warehouse', req.body)
    )));
    router.get('/warehouses/:id/layout', handleMutation((orgId, req) => service.getTwinWarehouseLayout(
        orgId,
        parseTwinId(req.params.id)
    )));
    router.put('/warehouses/:id/layout', handleMutation((orgId, req) => {
        const input = parseTwinPayload('layout', req.body);
        return service.saveTwinWarehouseLayout(orgId, parseTwinId(req.params.id), input.layoutJson);
    }));

    router.get('/warehouse-zones', handleMutation((orgId, req) => service.getWarehouseZones(
        orgId,
        parseTwinFilters('zones', req.query)
    )));
    router.post('/warehouse-zones', handleMutation((orgId, req) => service.createWarehouseZone(
        orgId,
        { ...parseTwinPayload('zone', req.body), createdBy: req.authContext?.userId || null }
    )));
    router.put('/warehouse-zones/:id', handleMutation((orgId, req) => service.updateWarehouseZone(
        orgId,
        parseTwinId(req.params.id),
        parseTwinPayload('zone', req.body)
    )));

    router.get('/rack-templates', handleMutation((orgId) => service.getRackTemplates(orgId)));
    router.post('/rack-templates', handleMutation((orgId, req) => service.createRackTemplate(
        orgId,
        { ...parseTwinPayload('rackTemplate', req.body), createdBy: req.authContext?.userId || null }
    )));
    router.put('/rack-templates/:id', handleMutation((orgId, req) => service.updateRackTemplate(
        orgId,
        parseTwinId(req.params.id),
        parseTwinPayload('rackTemplate', req.body)
    )));

    router.get('/rack-instances', handleMutation((orgId, req) => service.getRackInstances(
        orgId,
        parseTwinFilters('rackInstances', req.query)
    )));
    router.post('/rack-instances', handleMutation((orgId, req) => service.createRackInstance(
        orgId,
        { ...parseTwinPayload('rackInstance', req.body), createdBy: req.authContext?.userId || null }
    )));
    router.put('/rack-instances/:id', handleMutation((orgId, req) => service.updateRackInstance(
        orgId,
        parseTwinId(req.params.id),
        parseTwinPayload('rackInstance', req.body)
    )));

    router.get('/locations', handleMutation((orgId, req) => service.getTwinLocations(
        orgId,
        parseTwinFilters('locations', req.query)
    )));
    router.post('/locations', handleMutation((orgId, req) => service.createTwinLocation(
        orgId,
        parseTwinPayload('location', req.body)
    )));
    router.put('/locations/:id', handleMutation((orgId, req) => service.updateTwinLocation(
        orgId,
        parseTwinId(req.params.id),
        parseTwinPayload('location', req.body)
    )));
    router.post('/locations/batch-generate', handleMutation((orgId, req) => service.batchGenerateLocations(
        orgId,
        parseTwinPayload('batchLocations', req.body)
    )));
    router.post('/locations/batch-generate-qr', handleMutation((_orgId, req) => {
        const input = parseTwinPayload('qrPreview', req.body);
        return service.previewLocationQrCodes(input.warehouseId, input.codes);
    }));

    router.get('/item-shapes', handleMutation((orgId) => service.getItemShapeTemplates(orgId)));
    router.post('/item-shapes', handleMutation((orgId, req) => service.createItemShapeTemplate(
        orgId,
        { ...parseTwinPayload('itemShape', req.body), createdBy: req.authContext?.userId || null }
    )));
    router.put('/item-shapes/:id', handleMutation((orgId, req) => service.updateItemShapeTemplate(
        orgId,
        parseTwinId(req.params.id),
        parseTwinPayload('itemShape', req.body)
    )));

    router.get('/objects', handleMutation((orgId, req) => service.getInventoryObjects(
        orgId,
        parseTwinFilters('objects', req.query)
    )));
    router.post('/objects', handleMutation((orgId, req) => service.createInventoryObject(
        orgId,
        { ...parseTwinPayload('object', req.body), createdBy: req.authContext?.userId || null }
    )));
    router.put('/objects/:id', handleMutation((orgId, req) => service.updateInventoryObject(
        orgId,
        parseTwinId(req.params.id),
        parseTwinPayload('object', req.body)
    )));

    router.post('/bindings/scan', handleMutation((orgId, req) => service.scanBinding(orgId, {
        ...parseTwinPayload('binding', req.body),
        operatorId: req.authContext?.userId || null,
    })));
    router.post('/bindings/move', handleMutation((orgId, req) => service.moveBinding(orgId, {
        ...parseTwinPayload('binding', req.body),
        operatorId: req.authContext?.userId || null,
    })));
    router.post('/bindings/unbind', handleMutation((orgId, req) => service.unbindBinding(orgId, {
        ...parseTwinPayload('binding', req.body),
        operatorId: req.authContext?.userId || null,
    })));

    router.get('/scene/:warehouseId', handleMutation((orgId, req) => service.getTwinScene(
        orgId,
        parseTwinId(req.params.warehouseId, 'warehouseId')
    )));
    router.get('/events', handleMutation((orgId, req) => service.getTwinEvents(
        orgId,
        parseTwinFilters('events', req.query)
    )));

    return router;
}

export default createInventoryTwinRouter;

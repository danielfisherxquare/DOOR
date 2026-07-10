import { Router } from 'express';
import * as twinService from './inventory.twin.service.js';

function defaultOrgIdRequiredResponse(req, res) {
    return res.status(400).json({
        success: false,
        message: req.authContext?.role === 'super_admin'
            ? '璇峰厛閫夋嫨瑕佹搷浣滅殑鏈烘瀯'
            : '褰撳墠璐﹀彿鏈叧鑱旀満鏋勶紝璇疯仈绯荤鐞嗗憳',
    });
}

export function createInventoryTwinRouter(options = {}) {
    const router = Router();
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

    router.get('/warehouses', handleMutation((orgId) => twinService.getTwinWarehouses(orgId)));
    router.post('/warehouses', handleMutation((orgId, req) => twinService.createTwinWarehouse(orgId, req.body)));
    router.put('/warehouses/:id', handleMutation((orgId, req) => twinService.updateTwinWarehouse(orgId, Number(req.params.id), req.body)));
    router.get('/warehouses/:id/layout', handleMutation((orgId, req) => twinService.getTwinWarehouseLayout(orgId, Number(req.params.id))));
    router.put('/warehouses/:id/layout', handleMutation((orgId, req) => twinService.saveTwinWarehouseLayout(orgId, Number(req.params.id), req.body?.layoutJson ?? req.body)));

    router.get('/warehouse-zones', handleMutation((orgId, req) => twinService.getWarehouseZones(orgId, req.query)));
    router.post('/warehouse-zones', handleMutation((orgId, req) => twinService.createWarehouseZone(orgId, req.body)));
    router.put('/warehouse-zones/:id', handleMutation((orgId, req) => twinService.updateWarehouseZone(orgId, Number(req.params.id), req.body)));

    router.get('/rack-templates', handleMutation((orgId) => twinService.getRackTemplates(orgId)));
    router.post('/rack-templates', handleMutation((orgId, req) => twinService.createRackTemplate(orgId, req.body)));
    router.put('/rack-templates/:id', handleMutation((orgId, req) => twinService.updateRackTemplate(orgId, Number(req.params.id), req.body)));

    router.get('/rack-instances', handleMutation((orgId, req) => twinService.getRackInstances(orgId, req.query)));
    router.post('/rack-instances', handleMutation((orgId, req) => twinService.createRackInstance(orgId, req.body)));
    router.put('/rack-instances/:id', handleMutation((orgId, req) => twinService.updateRackInstance(orgId, Number(req.params.id), req.body)));

    router.get('/locations', handleMutation((orgId, req) => twinService.getTwinLocations(orgId, req.query)));
    router.post('/locations', handleMutation((orgId, req) => twinService.createTwinLocation(orgId, req.body)));
    router.put('/locations/:id', handleMutation((orgId, req) => twinService.updateTwinLocation(orgId, Number(req.params.id), req.body)));
    router.post('/locations/batch-generate', handleMutation((orgId, req) => twinService.batchGenerateLocations(orgId, req.body)));
    router.post('/locations/batch-generate-qr', handleMutation((orgId, req) => twinService.previewLocationQrCodes(req.body?.warehouseId, req.body?.codes || [])));

    router.get('/item-shapes', handleMutation((orgId) => twinService.getItemShapeTemplates(orgId)));
    router.post('/item-shapes', handleMutation((orgId, req) => twinService.createItemShapeTemplate(orgId, req.body)));
    router.put('/item-shapes/:id', handleMutation((orgId, req) => twinService.updateItemShapeTemplate(orgId, Number(req.params.id), req.body)));

    router.get('/objects', handleMutation((orgId, req) => twinService.getInventoryObjects(orgId, req.query)));
    router.post('/objects', handleMutation((orgId, req) => twinService.createInventoryObject(orgId, req.body)));
    router.put('/objects/:id', handleMutation((orgId, req) => twinService.updateInventoryObject(orgId, Number(req.params.id), req.body)));

    router.post('/bindings/scan', handleMutation((orgId, req) => twinService.scanBinding(orgId, {
        ...req.body,
        operatorId: req.authContext?.userId || null,
    })));
    router.post('/bindings/move', handleMutation((orgId, req) => twinService.moveBinding(orgId, {
        ...req.body,
        operatorId: req.authContext?.userId || null,
    })));
    router.post('/bindings/unbind', handleMutation((orgId, req) => twinService.unbindBinding(orgId, {
        ...req.body,
        operatorId: req.authContext?.userId || null,
    })));

    router.get('/scene/:warehouseId', handleMutation((orgId, req) => twinService.getTwinScene(orgId, Number(req.params.warehouseId))));
    router.get('/events', handleMutation((orgId, req) => twinService.getTwinEvents(orgId, req.query)));

    return router;
}

export default createInventoryTwinRouter;

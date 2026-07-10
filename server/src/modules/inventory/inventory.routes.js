import { Router } from 'express';
import * as repo from './inventory.repository.js';
import * as alertService from './inventory.alert.js';
import * as stocktakingService from './inventory.stocktaking.js';
import * as reportService from './inventory.report.js';
import * as workbenchService from './inventory.workbench.js';
import createInventoryTwinRouter from './inventory.twin.routes.js';
import {
    parseAlertFilters,
    parseAlertRulePayload,
    parseBatchPayload,
    parseBatchUnitPayload,
    parseInventoryId,
    parseInventoryFilters,
    parseInventoryNote,
    parseLocationRecommendation,
    parseLocationPayload,
    parseMaterialApprovalPayload,
    parseMaterialRequestFilters,
    parseMaterialRequestPayload,
    parsePreInboundAdvance,
    parsePreInboundPayload,
    parseStocktakingFilters,
    parseStocktakingPlanPayload,
    parseStocktakingScanPayload,
    parseSnapshotDate,
    parseTransactionFilters,
    parseTrendDays,
    parseTurnoverFilters,
    parseUnitStatusPayload,
    parseUnitScanPayload,
    parseWarehousePayload,
    parseWorkbenchSpaceFilters,
    resolveInventoryOrgId,
} from './inventory.schema.js';
import { inventoryWorkflow } from './inventory.workflow.service.js';
import { stocktakingWorkflow } from './inventory.stocktaking.workflow.service.js';

const router = Router();

function resolveTargetOrgId(req) {
    return resolveInventoryOrgId(req.authContext, {
        orgId: req.query.orgId ?? req.body?.orgId,
    });
}

function orgIdRequiredResponse(req, res) {
    return res.status(400).json({
        success: false,
        message: req.authContext?.role === 'super_admin'
            ? '请先选择要操作的机构'
            : '当前账号未关联机构，请联系管理员',
    });
}

const twinRouter = createInventoryTwinRouter({
    resolveTargetOrgId,
    orgIdRequiredResponse,
});

router.use('/twin', twinRouter);

router.get('/workbench/overview', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await workbenchService.getOverview(orgId, { surface: req.surface });
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/workbench/space', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const filters = parseWorkbenchSpaceFilters(req.query);
        const data = await workbenchService.getSpace(orgId, filters, { surface: req.surface });
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/workbench/control', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await workbenchService.getControl(orgId, { surface: req.surface });
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/workbench/analytics', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await workbenchService.getAnalytics(orgId, { surface: req.surface });
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/statistics', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await repo.getStatistics(orgId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/pre-inbound/summary', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await repo.getPreInboundSummary(orgId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/pre-inbound/items', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const filters = parseInventoryFilters('preInbound', req.query);
        const data = await repo.getPreInboundItems(orgId, filters);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/pre-inbound/items/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);

        const itemId = parseInventoryId(req.params.id);
        const item = await repo.getPreInboundItemById(orgId, itemId);
        if (!item) {
            return res.status(404).json({ success: false, message: '流程单不存在' });
        }

        const logs = await repo.getPreInboundLogs(orgId, itemId);
        res.json({ success: true, data: { item, logs } });
    } catch (err) {
        next(err);
    }
});

router.post('/pre-inbound/items', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const input = parsePreInboundPayload(req.body);
        const data = await repo.createPreInboundItem(
            orgId,
            input,
            req.authContext.userId
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.put('/pre-inbound/items/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const input = parsePreInboundPayload(req.body, { partial: true });
        const data = await repo.updatePreInboundItem(
            orgId,
            parseInventoryId(req.params.id),
            input,
            req.authContext.userId
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/pre-inbound/items/:id/notes', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const note = parseInventoryNote(req.body);
        const data = await repo.addPreInboundNote(
            orgId,
            parseInventoryId(req.params.id),
            note,
            req.authContext.userId
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/pre-inbound/items/:id/advance', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const input = parsePreInboundAdvance(req.body);
        const data = await repo.advancePreInboundStage(
            orgId,
            parseInventoryId(req.params.id),
            input.stage,
            input.note,
            req.authContext.userId
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/pre-inbound/items/:id/start-inbound', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await repo.startPreInboundInbound(
            orgId,
            parseInventoryId(req.params.id),
            req.authContext.userId
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/batches', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const filters = parseInventoryFilters('batches', req.query);
        const data = await repo.getBatches(orgId, filters);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/batches/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await repo.getBatchById(orgId, parseInventoryId(req.params.id));
        if (!data) {
            return res.status(404).json({ success: false, message: '批次不存在' });
        }
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/batches', async (req, res, next) => {
    try {
        const targetOrgId = resolveTargetOrgId(req);
        if (!targetOrgId) return orgIdRequiredResponse(req, res);

        const input = parseBatchPayload(req.body);
        const data = await repo.createBatch(targetOrgId, {
            ...input,
            createdBy: req.authContext.userId,
        });
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.put('/batches/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const input = parseBatchPayload(req.body, { partial: true });
        const data = await repo.updateBatch(
            orgId,
            parseInventoryId(req.params.id),
            input
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.delete('/batches/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        await repo.deleteBatch(orgId, parseInventoryId(req.params.id));
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

router.get('/units', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const filters = parseInventoryFilters('units', req.query);
        const data = await repo.getUnits(orgId, filters);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/units/:qr', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await repo.getUnitByQR(orgId, req.params.qr);
        if (!data) {
            return res.status(404).json({ success: false, message: '物资不存在' });
        }
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/units/batch', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const result = await inventoryWorkflow.createBatchUnits({
            orgId,
            userId: req.authContext?.userId,
            input: parseBatchUnitPayload(req.body),
        });

        res.json({
            success: true,
            count: result.units.length,
            units: result.units,
            twinObjectsCreated: result.twinSync.created.length,
            twinObjectsUpdated: result.twinSync.updated.length,
        });
    } catch (err) {
        next(err);
    }
});

router.post('/units/scan', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const result = await inventoryWorkflow.scanUnit({
            orgId,
            userId: req.authContext.userId,
            input: parseUnitScanPayload(req.body),
        });
        res.json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
});

router.put('/units/:id/status', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const { status, extra } = parseUnitStatusPayload(req.body);
        await repo.updateUnitStatus(orgId, parseInventoryId(req.params.id), status, extra);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

router.get('/warehouses', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await repo.getWarehouses(orgId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/warehouses', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const input = parseWarehousePayload(req.body);
        const data = await repo.createWarehouse(orgId, input);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.put('/warehouses/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const input = parseWarehousePayload(req.body, { partial: true });
        const data = await repo.updateWarehouse(
            orgId,
            parseInventoryId(req.params.id),
            input
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.delete('/warehouses/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        await repo.deleteWarehouse(orgId, parseInventoryId(req.params.id));
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

router.get('/locations', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const warehouseId = parseInventoryId(req.query.warehouseId, 'warehouseId');
        const data = await repo.getLocations(orgId, warehouseId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/locations', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const input = parseLocationPayload(req.body);
        const data = await repo.createLocation(orgId, input);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/locations/recommend', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const input = parseLocationRecommendation(req.body);
        const data = await repo.findAvailableLocations(orgId, input.warehouseId, input.itemType);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/requests', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const filters = parseMaterialRequestFilters(req.query);
        const data = await repo.getRequests(orgId, filters.raceId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/requests', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const input = parseMaterialRequestPayload(req.body);
        const data = await repo.createRequest(orgId, input);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.put('/requests/:id/approve', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const input = parseMaterialApprovalPayload(req.body);
        const data = await inventoryWorkflow.approveRequest({
            orgId,
            requestId: parseInventoryId(req.params.id),
            approvedQuantity: input.approvedQuantity,
            approverId: req.authContext.userId,
        });
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/requests/:id/allocate', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);

        const result = await inventoryWorkflow.allocateRequest({
            orgId,
            requestId: parseInventoryId(req.params.id),
        });
        res.json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
});

router.get('/transactions', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const filters = parseTransactionFilters(req.query);
        const data = await reportService.getTransactions(orgId, filters);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/alerts', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const filters = parseAlertFilters(req.query);
        const data = await alertService.getAlerts(orgId, filters);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/alerts/unread', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const count = await alertService.getUnreadCount(orgId);
        res.json({ success: true, data: { count } });
    } catch (err) {
        next(err);
    }
});

router.put('/alerts/:id/read', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        await alertService.markAsRead(orgId, parseInventoryId(req.params.id));
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

router.put('/alerts/:id/resolve', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        await alertService.markAsResolved(
            orgId,
            parseInventoryId(req.params.id),
            req.authContext.userId
        );
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

router.get('/alert-rules', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await alertService.getRules(orgId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/alert-rules', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const input = parseAlertRulePayload(req.body);
        const data = await alertService.createRule(orgId, input);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.put('/alert-rules/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const input = parseAlertRulePayload(req.body, { partial: true });
        const data = await alertService.updateRule(
            orgId,
            parseInventoryId(req.params.id),
            input
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/stocktaking/plans', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const filters = parseStocktakingFilters('plans', req.query);
        const data = await stocktakingService.getPlans(orgId, filters);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/stocktaking/plans/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await stocktakingService.getPlan(orgId, parseInventoryId(req.params.id));
        if (!data) {
            return res.status(404).json({ success: false, message: '盘点计划不存在' });
        }
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/stocktaking/plans', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const input = parseStocktakingPlanPayload(req.body);
        const data = await stocktakingService.createPlan(orgId, input, req.authContext.userId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/stocktaking/plans/:id/start', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await stocktakingWorkflow.startPlan(orgId, parseInventoryId(req.params.id));
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/stocktaking/plans/:id/complete', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await stocktakingWorkflow.completePlan(orgId, parseInventoryId(req.params.id));
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/stocktaking/scan', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const input = parseStocktakingScanPayload(req.body);
        const data = await stocktakingWorkflow.scanCount(
            orgId,
            input.planId,
            input,
            req.authContext.userId
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/stocktaking/records/:planId', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const filters = parseStocktakingFilters('records', req.query);
        const data = await stocktakingService.getRecords(
            orgId,
            parseInventoryId(req.params.planId, 'planId'),
            filters
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/reports/turnover', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const filters = parseTurnoverFilters(req.query);
        const data = await reportService.getTurnoverRate(
            orgId,
            filters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            filters.endDate || new Date()
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/reports/trend', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await reportService.getTrend(orgId, parseTrendDays(req.query.days));
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/reports/trace/:unitId', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await reportService.traceUnit(
            orgId,
            parseInventoryId(req.params.unitId, 'unitId')
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/reports/snapshot/:date', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await reportService.generateSnapshot(orgId, parseSnapshotDate(req.params.date));
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

export default router;

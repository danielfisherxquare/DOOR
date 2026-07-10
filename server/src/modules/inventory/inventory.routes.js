import { Router } from 'express';
import knex from '../../db/knex.js';
import * as repo from './inventory.repository.js';
import * as alertService from './inventory.alert.js';
import * as stocktakingService from './inventory.stocktaking.js';
import * as reportService from './inventory.report.js';
import * as workbenchService from './inventory.workbench.js';
import createInventoryTwinRouter from './inventory.twin.routes.js';
import * as twinService from './inventory.twin.service.js';

const router = Router();

function resolveTargetOrgId(req) {
    const paramOrgId = req.query.orgId || req.body?.orgId;

    if (paramOrgId) {
        if (req.authContext?.role !== 'super_admin') {
            return null;
        }
        return paramOrgId;
    }

    return req.authContext?.orgId;
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
        const data = await workbenchService.getSpace(orgId, req.query, { surface: req.surface });
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
        const data = await repo.getPreInboundItems(orgId, req.query);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/pre-inbound/items/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);

        const itemId = Number(req.params.id);
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
        const data = await repo.createPreInboundItem(orgId, req.body, req.authContext.userId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.put('/pre-inbound/items/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await repo.updatePreInboundItem(
            orgId,
            Number(req.params.id),
            req.body,
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
        const data = await repo.addPreInboundNote(
            orgId,
            Number(req.params.id),
            req.body.note,
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
        const data = await repo.advancePreInboundStage(
            orgId,
            Number(req.params.id),
            req.body.stage,
            req.body.note,
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
            Number(req.params.id),
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
        const data = await repo.getBatches(orgId, req.query);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/batches/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await repo.getBatchById(orgId, Number(req.params.id));
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

        const data = await repo.createBatch(targetOrgId, {
            ...req.body,
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
        const data = await repo.updateBatch(orgId, Number(req.params.id), req.body);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.delete('/batches/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        await repo.deleteBatch(orgId, Number(req.params.id));
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

router.get('/units', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await repo.getUnits(orgId, req.query);
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
        const { batchId, items } = req.body;
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);

        const requestedWarehouseId = req.body.warehouseId ? Number(req.body.warehouseId) : null;
        const result = await knex.transaction(async (trx) => {
            const batch = await trx('org_inventory_batches')
                .where({ org_id: orgId, id: batchId })
                .forUpdate()
                .first();

            if (!batch) {
                throw new Error('BATCH_NOT_FOUND');
            }

            const units = [];
            const orgCode = orgId.substring(0, 4).toUpperCase();
            const typeCode = getTypeCode(batch.batch_type);
            const batchCode = batchId.toString().padStart(4, '0');
            let seq = await repo.getMaxSequence(orgId, batchId, trx);

            for (const item of items) {
                for (let i = 0; i < item.quantity; i += 1) {
                    seq += 1;
                    const qrCode = `${orgCode}-${typeCode}-${batchCode}-${seq.toString().padStart(6, '0')}`;
                    units.push({
                        batchId,
                        qrCode,
                        itemType: item.itemType,
                        itemCategory: item.itemCategory,
                        itemSpec: item.itemSpec,
                        warehouseId: item.warehouseId || requestedWarehouseId,
                        locationId: item.locationId,
                    });
                }
            }

            const createdUnits = await repo.createUnits(orgId, units, trx);
            await repo.updateBatch(orgId, batchId, {
                total_quantity: batch.total_quantity + createdUnits.length,
            }, trx);

            const twinSync = await twinService.syncLegacyUnitsToTwinObjects(orgId, createdUnits, {
                currentWarehouseId: requestedWarehouseId || undefined,
                createdBy: req.authContext?.userId || null,
            }, trx);

            return { units: createdUnits, twinSync };
        });

        res.json({
            success: true,
            count: result.units.length,
            units: result.units,
            twinObjectsCreated: result.twinSync.created.length,
            twinObjectsUpdated: result.twinSync.updated.length,
        });
    } catch (err) {
        if (err.message === 'BATCH_NOT_FOUND') {
            return res.status(400).json({ success: false, message: '批次不存在' });
        }
        next(err);
    }
});

router.post('/units/scan', async (req, res, next) => {
    try {
        const { qrCode, action, raceId, runnerId } = req.body;
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const userId = req.authContext.userId;
        const normalizedRunnerId = String(runnerId || '').trim();

        const unit = await repo.getUnitByQR(orgId, qrCode);
        if (!unit) {
            return res.status(404).json({ success: false, message: '物资不存在' });
        }

        let result;

        if (action === 'pickup') {
            if (unit.status !== 'allocated') {
                return res.status(400).json({ success: false, message: '物资状态异常，无法领取' });
            }
            if (!normalizedRunnerId || normalizedRunnerId === 'current_runner_id') {
                return res.status(400).json({ success: false, message: '请提供真实领取人 ID' });
            }

            await repo.updateUnitStatus(orgId, unit.id, 'picked', {
                current_holder_type: 'runner',
                current_holder_id: normalizedRunnerId,
                picked_at: knex.fn.now(),
                picked_by: userId,
            });

            await repo.createTransaction(orgId, {
                unitId: unit.id,
                transactionType: 'pickup',
                fromHolderType: 'race',
                fromHolderId: raceId,
                toHolderType: 'runner',
                toHolderId: normalizedRunnerId,
                operatorId: userId,
                remarks: '扫码领取',
            });

            result = { success: true, action: 'pickup', unit };
        } else {
            result = { success: true, unit };
        }

        res.json(result);
    } catch (err) {
        next(err);
    }
});

router.put('/units/:id/status', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const { status, ...extra } = req.body;
        await repo.updateUnitStatus(orgId, Number(req.params.id), status, extra);
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
        const data = await repo.createWarehouse(orgId, req.body);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.put('/warehouses/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await repo.updateWarehouse(orgId, Number(req.params.id), req.body);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.delete('/warehouses/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        await repo.deleteWarehouse(orgId, Number(req.params.id));
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

router.get('/locations', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const { warehouseId } = req.query;
        const data = await repo.getLocations(orgId, Number(warehouseId));
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/locations', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await repo.createLocation(orgId, req.body);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/locations/recommend', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const { warehouseId, itemType } = req.body;
        const data = await repo.findAvailableLocations(orgId, warehouseId, itemType);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/requests', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const { raceId } = req.query;
        const data = await repo.getRequests(orgId, Number(raceId));
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/requests', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await repo.createRequest(orgId, req.body);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.put('/requests/:id/approve', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const { approvedQuantity } = req.body;
        const data = await repo.approveRequest(
            orgId,
            Number(req.params.id),
            approvedQuantity,
            req.authContext.userId
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/requests/:id/allocate', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);

        const request = await knex('race_material_requests')
            .where({ org_id: orgId, id: Number(req.params.id) })
            .first();

        if (!request || request.status !== 'approved') {
            return res.status(400).json({ success: false, message: '申请未审批通过' });
        }

        const units = await repo.getUnits(orgId, {
            itemType: request.item_type,
            status: 'in_stock',
            limit: request.approved_quantity,
        });

        if (units.length < request.approved_quantity) {
            return res.status(400).json({ success: false, message: '库存不足' });
        }

        const result = await repo.allocateToRace(orgId, Number(req.params.id), units);
        res.json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
});

router.get('/transactions', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await reportService.getTransactions(orgId, req.query);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/alerts', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await alertService.getAlerts(orgId, req.query);
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
        await alertService.markAsRead(orgId, Number(req.params.id));
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

router.put('/alerts/:id/resolve', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        await alertService.markAsResolved(orgId, Number(req.params.id), req.authContext.userId);
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
        const data = await alertService.createRule(orgId, req.body);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.put('/alert-rules/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await alertService.updateRule(orgId, Number(req.params.id), req.body);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/stocktaking/plans', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await stocktakingService.getPlans(orgId, req.query);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/stocktaking/plans/:id', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await stocktakingService.getPlan(orgId, Number(req.params.id));
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
        const data = await stocktakingService.createPlan(orgId, req.body, req.authContext.userId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/stocktaking/plans/:id/start', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await stocktakingService.startPlan(orgId, Number(req.params.id));
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/stocktaking/plans/:id/complete', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await stocktakingService.completePlan(orgId, Number(req.params.id));
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.post('/stocktaking/scan', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await stocktakingService.scanCount(
            orgId,
            req.body.planId,
            req.body,
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
        const data = await stocktakingService.getRecords(orgId, Number(req.params.planId), req.query);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/reports/turnover', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const { startDate, endDate } = req.query;
        const data = await reportService.getTurnoverRate(
            orgId,
            startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            endDate || new Date()
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
        const { days } = req.query;
        const data = await reportService.getTrend(orgId, Number(days) || 7);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/reports/trace/:unitId', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await reportService.traceUnit(orgId, Number(req.params.unitId));
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

router.get('/reports/snapshot/:date', async (req, res, next) => {
    try {
        const orgId = resolveTargetOrgId(req);
        if (!orgId) return orgIdRequiredResponse(req, res);
        const data = await reportService.generateSnapshot(orgId, req.params.date);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
});

function getTypeCode(type) {
    const codes = {
        clothing: 'CLOTH',
        medal: 'MEDAL',
        bag: 'BAG',
        bib: 'BIB',
    };

    return codes[type] || 'OTHER';
}

export default router;

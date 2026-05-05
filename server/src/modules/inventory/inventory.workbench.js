import knex from '../../db/knex.js';
import * as repo from './inventory.repository.js';
import * as alertService from './inventory.alert.js';
import * as stocktakingService from './inventory.stocktaking.js';
import * as reportService from './inventory.report.js';

function normalizeSurfacePath(surface, path) {
    if (surface !== 'ops') {
        return path;
    }

    const opsRouteMap = {
        '/inventory': '/warehouse',
        '/inventory/inbound': '/warehouse/inbound',
        '/inventory/outbound': '/warehouse/outbound',
        '/inventory/space': '/warehouse/binding',
        '/inventory/control': '/warehouse/count',
        '/inventory/analytics': '/warehouse/count',
    };

    return opsRouteMap[path] || path;
}

function buildHref(surface = 'admin', path, query = {}) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            params.set(key, String(value));
        }
    });
    const search = params.toString();
    const normalizedPath = normalizeSurfacePath(surface, path);
    return `/${surface}${normalizedPath}${search ? `?${search}` : ''}`;
}

function toCountMap(rows = [], keyName) {
    return rows.reduce((acc, row) => {
        acc[String(row[keyName])] = Number(row.count || 0);
        return acc;
    }, {});
}

function summarizeSeverity(alerts = []) {
    return alerts.reduce((acc, alert) => {
        const severity = String(alert.severity || 'info');
        acc[severity] = (acc[severity] || 0) + 1;
        return acc;
    }, { info: 0, warning: 0, critical: 0 });
}

function makeTask({
    id,
    type,
    title,
    status,
    warehouseId,
    warehouseName,
    locationCode = '',
    nextActionHref,
    updatedAt,
    meta = '',
}) {
    return {
        id,
        type,
        title,
        status,
        warehouseId: warehouseId || null,
        warehouseName: warehouseName || '未指定仓库',
        locationCode,
        nextActionHref,
        updatedAt,
        meta,
    };
}

function makeException({
    id,
    type,
    title,
    status,
    severity = 'info',
    warehouseId,
    warehouseName,
    locationCode = '',
    nextActionHref,
    updatedAt,
    meta = '',
}) {
    return {
        id,
        type,
        title,
        status,
        severity,
        warehouseId: warehouseId || null,
        warehouseName: warehouseName || '未指定仓库',
        locationCode,
        nextActionHref,
        updatedAt,
        meta,
    };
}

async function getWarehouseLookup(orgId) {
    const warehouses = await repo.getWarehouses(orgId);
    return {
        warehouses,
        warehouseById: new Map(warehouses.map((warehouse) => [Number(warehouse.id), warehouse])),
    };
}

export async function getOverview(orgId, options = {}) {
    const surface = options.surface || 'admin';
    const { warehouses, warehouseById } = await getWarehouseLookup(orgId);
    const [
        statistics,
        preInboundSummary,
        preInboundItems,
        alerts,
        unreadCount,
        transactions,
        trend,
        activePlans,
        pickupUnits,
        pendingObjects,
        locationRows,
    ] = await Promise.all([
        repo.getStatistics(orgId),
        repo.getPreInboundSummary(orgId),
        repo.getPreInboundItems(orgId, { onlyActive: true, limit: 8 }),
        alertService.getAlerts(orgId, { isResolved: false, limit: 8 }),
        alertService.getUnreadCount(orgId),
        reportService.getTransactions(orgId, { limit: 10 }),
        reportService.getTrend(orgId, 7),
        stocktakingService.getPlans(orgId, { status: 'in_progress', limit: 20 }),
        repo.getUnits(orgId, { status: 'allocated', limit: 8 }),
        knex('inventory_objects')
            .where({ org_id: orgId })
            .whereNull('current_location_id')
            .orderBy('updated_at', 'desc')
            .limit(8),
        knex('warehouse_locations')
            .where({ org_id: orgId })
            .select('warehouse_id')
            .count('* as count')
            .groupBy('warehouse_id'),
    ]);

    const capacitySummary = warehouses.map((warehouse) => ({
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        locationCount: Number(locationRows.find((row) => Number(row.warehouse_id) === Number(warehouse.id))?.count || 0),
    }));

    const inboundTasks = preInboundItems.slice(0, 4).map((item) => makeTask({
        id: `pre-${item.id}`,
        type: 'inbound',
        title: item.item_name,
        status: item.current_stage,
        warehouseId: null,
        warehouseName: '入库前流程',
        nextActionHref: buildHref(surface, '/inventory/inbound', { orgId, tab: 'pre', itemId: item.id }),
        updatedAt: item.updated_at,
        meta: `${item.reference_no} · ${item.confirmed_quantity || item.planned_quantity || 0} 件`,
    }));

    const putawayTasks = pendingObjects.slice(0, 4).map((item) => {
        const warehouse = warehouseById.get(Number(item.current_warehouse_id));
        return makeTask({
            id: `putaway-${item.id}`,
            type: 'putaway',
            title: item.object_code,
            status: 'pending_putaway',
            warehouseId: item.current_warehouse_id,
            warehouseName: warehouse?.name,
            nextActionHref: buildHref(surface, '/inventory/space', {
                orgId,
                warehouseId: item.current_warehouse_id,
                tab: 'bind',
                objectQr: item.object_code,
            }),
            updatedAt: item.updated_at,
            meta: item.object_level || 'unit',
        });
    });

    const pickupTasks = pickupUnits.slice(0, 4).map((unit) => {
        const warehouse = warehouseById.get(Number(unit.warehouse_id));
        return makeTask({
            id: `pickup-${unit.id}`,
            type: 'pickup',
            title: unit.qr_code,
            status: unit.status,
            warehouseId: unit.warehouse_id,
            warehouseName: warehouse?.name,
            locationCode: unit.location_id ? `#${unit.location_id}` : '',
            nextActionHref: buildHref(surface, '/inventory/outbound', { orgId, tab: 'pickup', qrCode: unit.qr_code }),
            updatedAt: unit.updated_at,
            meta: unit.item_type,
        });
    });

    const taskQueues = [
        { key: 'inbound', label: '待入库', items: inboundTasks },
        { key: 'putaway', label: '待上架', items: putawayTasks },
        { key: 'pickup', label: '待领取', items: pickupTasks },
    ];

    const exceptions = alerts.map((alert) => makeException({
        id: `alert-${alert.id}`,
        type: alert.alert_type,
        title: alert.title,
        status: alert.is_resolved ? 'resolved' : 'open',
        severity: alert.severity,
        warehouseName: '异常中心',
        nextActionHref: buildHref(surface, '/inventory/control', { orgId, tab: 'alerts', alertId: alert.id }),
        updatedAt: alert.created_at,
        meta: alert.content,
    }));

    return {
        metrics: {
            pendingInbound: Number(preInboundSummary.readyForInbound || 0),
            pendingPutaway: Number(pendingObjects.length || 0),
            pendingPickup: Number(statistics.byStatus?.allocated || 0),
            stocktakingInProgress: Number(activePlans.length || 0),
            openAlerts: Number(alerts.length || 0),
            unreadAlerts: Number(unreadCount || 0),
        },
        taskQueues,
        exceptions,
        activityFeed: transactions.map((item) => ({
            id: item.id,
            type: item.transaction_type,
            title: `${item.transaction_type} #${item.unit_id}`,
            status: item.transaction_type,
            warehouseId: null,
            warehouseName: '流转记录',
            locationCode: '',
            nextActionHref: buildHref(surface, '/inventory/analytics', { orgId }),
            updatedAt: item.created_at,
            meta: item.operator_name || item.remarks || '-',
        })),
        capacitySummary,
        forecast7d: trend,
        summaries: {
            statistics,
            preInboundSummary,
            severity: summarizeSeverity(alerts),
        },
    };
}

export async function getSpace(orgId, filters = {}, options = {}) {
    const surface = options.surface || 'admin';
    const { warehouses, warehouseById } = await getWarehouseLookup(orgId);
    const selectedWarehouseId = Number(filters.warehouseId || warehouses[0]?.id || 0) || null;

    const [
        locations,
        objects,
        unboundObjects,
        racks,
        events,
    ] = await Promise.all([
        selectedWarehouseId ? knex('warehouse_locations').where({ org_id: orgId, warehouse_id: selectedWarehouseId }).orderBy('code') : Promise.resolve([]),
        selectedWarehouseId ? knex('inventory_objects').where({ org_id: orgId, current_warehouse_id: selectedWarehouseId }).orderBy('updated_at', 'desc').limit(40) : Promise.resolve([]),
        knex('inventory_objects')
            .where({ org_id: orgId })
            .whereNull('current_location_id')
            .orderBy('updated_at', 'desc')
            .limit(12),
        selectedWarehouseId ? knex('rack_instances').where({ org_id: orgId, warehouse_id: selectedWarehouseId }).count('* as count').first() : Promise.resolve({ count: 0 }),
        selectedWarehouseId ? knex('twin_events').where({ org_id: orgId, warehouse_id: selectedWarehouseId }).orderBy('created_at', 'desc').limit(8) : Promise.resolve([]),
    ]);

    const locationStatusRows = selectedWarehouseId
        ? await knex('warehouse_locations')
            .where({ org_id: orgId, warehouse_id: selectedWarehouseId })
            .select('status')
            .count('* as count')
            .groupBy('status')
        : [];

    return {
        warehouses,
        selectedWarehouse: selectedWarehouseId ? warehouseById.get(selectedWarehouseId) || null : null,
        locationStats: {
            total: locations.length,
            byStatus: toCountMap(locationStatusRows, 'status'),
            occupied: locations.filter((location) => Number(location.used_capacity || 0) > 0).length,
        },
        twinSummary: {
            rackCount: Number(racks?.count || 0),
            locationCount: locations.length,
            objectCount: objects.length,
            eventCount: events.length,
        },
        unboundObjects: unboundObjects.map((item) => ({
            id: item.id,
            type: 'binding',
            title: item.object_code,
            status: 'pending_putaway',
            warehouseId: item.current_warehouse_id,
            warehouseName: warehouseById.get(Number(item.current_warehouse_id))?.name || '待分配仓库',
            locationCode: '',
            nextActionHref: buildHref(surface, '/inventory/space', {
                orgId,
                warehouseId: item.current_warehouse_id,
                tab: 'bind',
                objectQr: item.object_code,
            }),
            updatedAt: item.updated_at,
        })),
        sceneSummary: {
            locations: locations.slice(0, 20),
            objects: objects.slice(0, 20),
            events,
        },
    };
}

export async function getControl(orgId, options = {}) {
    const surface = options.surface || 'admin';
    const { warehouseById } = await getWarehouseLookup(orgId);
    const [plans, alerts, rules] = await Promise.all([
        stocktakingService.getPlans(orgId, { limit: 20 }),
        alertService.getAlerts(orgId, { limit: 20 }),
        alertService.getRules(orgId),
    ]);

    const planIds = plans.map((plan) => plan.id);
    const mismatchRows = planIds.length
        ? await knex('stocktaking_records')
            .where({ org_id: orgId })
            .whereIn('plan_id', planIds)
            .where('is_matched', false)
            .orderBy('counted_at', 'desc')
            .limit(20)
        : [];

    const mismatchItems = mismatchRows.map((row) => {
        const plan = plans.find((item) => Number(item.id) === Number(row.plan_id));
        const warehouse = warehouseById.get(Number(plan?.warehouse_id));
        return makeException({
            id: `mismatch-${row.id}`,
            type: 'mismatch',
            title: row.qr_code,
            status: 'unmatched',
            severity: 'warning',
            warehouseId: plan?.warehouse_id,
            warehouseName: warehouse?.name,
            locationCode: row.actual_location || row.expected_location || '',
            nextActionHref: buildHref(surface, '/inventory/control', { orgId, tab: 'count', planId: row.plan_id }),
            updatedAt: row.counted_at || row.created_at,
            meta: `盘点计划 ${plan?.plan_name || row.plan_id}`,
        });
    });

    return {
        stocktakingSummary: {
            total: plans.length,
            inProgress: plans.filter((plan) => plan.status === 'in_progress').length,
            completed: plans.filter((plan) => plan.status === 'completed').length,
            diffItems: plans.reduce((sum, plan) => sum + Number(plan.diff_items || 0), 0),
        },
        openPlans: plans,
        alertSummary: {
            total: alerts.length,
            unread: alerts.filter((alert) => !alert.is_read).length,
            unresolved: alerts.filter((alert) => !alert.is_resolved).length,
            rules: rules.length,
            bySeverity: summarizeSeverity(alerts),
        },
        exceptionList: [
            ...alerts.map((alert) => makeException({
                id: `alert-${alert.id}`,
                type: alert.alert_type,
                title: alert.title,
                status: alert.is_resolved ? 'resolved' : 'open',
                severity: alert.severity,
                warehouseName: '异常中心',
                locationCode: '',
                nextActionHref: buildHref(surface, '/inventory/control', { orgId, tab: 'alerts', alertId: alert.id }),
                updatedAt: alert.created_at,
                meta: alert.content,
            })),
            ...mismatchItems,
        ],
    };
}

export async function getAnalytics(orgId, _options = {}) {
    const [statistics, trend, transactions, typeDistribution, warehouseDistribution] = await Promise.all([
        reportService.getStatistics(orgId),
        reportService.getTrend(orgId, 7),
        reportService.getTransactions(orgId, { limit: 20 }),
        reportService.getTypeDistribution(orgId),
        reportService.getWarehouseDistribution(orgId),
    ]);

    const topMoverRows = await knex('inventory_transactions as t')
        .leftJoin('org_inventory_units as u', 't.unit_id', 'u.id')
        .where('t.org_id', orgId)
        .select('u.item_type')
        .count('t.id as count')
        .groupBy('u.item_type')
        .orderBy('count', 'desc')
        .limit(5);

    return {
        statistics,
        trend,
        transactions,
        typeDistribution,
        warehouseDistribution,
        statusDistribution: Object.entries(statistics.byStatus || {}).map(([status, count]) => ({ status, count })),
        topMovers: topMoverRows.map((row) => ({
            label: row.item_type || 'unknown',
            count: Number(row.count || 0),
        })),
    };
}

/**
 * Inventory Repository — 仓储管理数据访问层
 * 多租户隔离：所有查询必须带 org_id
 */
import knex from '../../db/knex.js';

export const PRE_INBOUND_STAGES = [
    'pending',
    'confirmed',
    'communication',
    'ordered',
    'sampling',
    'production',
    'shipped',
    'logistics',
    'arrived',
    'inbound',
];

const PRE_INBOUND_STAGE_SET = new Set(PRE_INBOUND_STAGES);

function dbOrKnex(db) {
    return db || knex;
}

function buildPreInboundReference() {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `PIB-${datePart}-${randomPart}`;
}

function normalizeInteger(value, fallback = 0) {
    const nextValue = Number(value);
    return Number.isFinite(nextValue) ? Math.max(0, Math.round(nextValue)) : fallback;
}

function pickPreInboundFields(data = {}) {
    const payload = {};

    if (data.referenceNo !== undefined) payload.reference_no = String(data.referenceNo || '').trim() || buildPreInboundReference();
    if (data.itemName !== undefined) payload.item_name = String(data.itemName || '').trim();
    if (data.itemType !== undefined) payload.item_type = String(data.itemType || 'other').trim() || 'other';
    if (data.itemCategory !== undefined) payload.item_category = String(data.itemCategory || '').trim() || null;
    if (data.itemSpec !== undefined) payload.item_spec = data.itemSpec || null;
    if (data.plannedQuantity !== undefined) payload.planned_quantity = normalizeInteger(data.plannedQuantity);
    if (data.confirmedQuantity !== undefined) payload.confirmed_quantity = normalizeInteger(data.confirmedQuantity);
    if (data.supplier !== undefined) payload.supplier = String(data.supplier || '').trim() || null;
    if (data.ownerName !== undefined) payload.owner_name = String(data.ownerName || '').trim() || null;
    if (data.contactName !== undefined) payload.contact_name = String(data.contactName || '').trim() || null;
    if (data.contactPhone !== undefined) payload.contact_phone = String(data.contactPhone || '').trim() || null;
    if (data.expectedArrivalDate !== undefined) payload.expected_arrival_date = data.expectedArrivalDate || null;
    if (data.priority !== undefined) payload.priority = String(data.priority || 'normal').trim() || 'normal';
    if (data.remarks !== undefined) payload.remarks = String(data.remarks || '').trim() || null;

    return payload;
}

async function createPreInboundLogRow(trx, orgId, orderId, actionType, options = {}) {
    const [result] = await trx('inventory_preinbound_logs')
        .insert({
            org_id: orgId,
            order_id: orderId,
            action_type: actionType,
            from_stage: options.fromStage || null,
            to_stage: options.toStage || null,
            note: options.note || null,
            metadata: options.metadata || null,
            operator_id: options.operatorId || null,
        })
        .returning('*');

    return result;
}

// ==================== 批次管理 ====================

export async function getBatches(orgId, filters = {}) {
    const query = knex('org_inventory_batches').where({ org_id: orgId });

    if (filters.batchType) {
        query.where('batch_type', filters.batchType);
    }
    if (filters.status) {
        query.where('status', filters.status);
    }

    return query.orderBy('created_at', 'desc');
}

export async function getBatchById(orgId, batchId, db) {
    return dbOrKnex(db)('org_inventory_batches')
        .where({ org_id: orgId, id: batchId })
        .first();
}

export async function createBatch(orgId, data) {
    const [result] = await knex('org_inventory_batches')
        .insert({
            org_id: orgId,
            batch_name: data.batchName,
            batch_type: data.batchType,
            supplier: data.supplier,
            purchase_date: data.purchaseDate,
            total_quantity: 0,
            status: data.status || 'draft',
            created_by: data.createdBy
        })
        .returning('*');
    return result;
}

export async function updateBatch(orgId, batchId, data, db) {
    const [result] = await dbOrKnex(db)('org_inventory_batches')
        .where({ org_id: orgId, id: batchId })
        .update({
            ...data,
            updated_at: dbOrKnex(db).fn.now()
        })
        .returning('*');
    return result;
}

export async function deleteBatch(orgId, batchId) {
    return knex('org_inventory_batches')
        .where({ org_id: orgId, id: batchId })
        .delete();
}

// ==================== 物资单元管理 ====================

export async function getUnits(orgId, filters = {}) {
    const query = knex('org_inventory_units').where({ org_id: orgId });

    if (filters.batchId) {
        query.where('batch_id', filters.batchId);
    }
    if (filters.itemType) {
        query.where('item_type', filters.itemType);
    }
    if (filters.status) {
        query.where('status', filters.status);
    }
    if (filters.warehouseId) {
        query.where('warehouse_id', filters.warehouseId);
    }

    return query.orderBy('created_at', 'desc').limit(filters.limit || 100);
}

export async function getUnitByQR(orgId, qrCode) {
    return knex('org_inventory_units')
        .where({ org_id: orgId, qr_code: qrCode })
        .first();
}

export async function getUnitById(orgId, unitId) {
    return knex('org_inventory_units')
        .where({ org_id: orgId, id: unitId })
        .first();
}

export async function createUnits(orgId, units, db) {
    const rows = units.map(u => ({
        org_id: orgId,
        batch_id: u.batchId,
        qr_code: u.qrCode,
        item_type: u.itemType,
        item_category: u.itemCategory,
        item_spec: u.itemSpec ? JSON.stringify(u.itemSpec) : null,
        status: 'in_stock',
        current_holder_type: 'org',
        current_holder_id: orgId,
        warehouse_id: u.warehouseId || null,
        location_id: u.locationId || null
    }));

    return dbOrKnex(db)('org_inventory_units').insert(rows).returning('*');
}

export async function updateUnitStatus(orgId, unitId, status, extra = {}) {
    return knex('org_inventory_units')
        .where({ org_id: orgId, id: unitId })
        .update({
            status,
            ...extra,
            updated_at: knex.fn.now()
        });
}

export async function getMaxSequence(orgId, batchId, db) {
    const result = await dbOrKnex(db)('org_inventory_units')
        .where({ org_id: orgId, batch_id: batchId })
        .max('id as max_id')
        .first();
    return result?.max_id || 0;
}

// ==================== 仓库管理 ====================

export async function getWarehouses(orgId) {
    return knex('warehouses')
        .where({ org_id: orgId })
        .orderBy('is_default', 'desc')
        .orderBy('created_at', 'desc');
}

export async function getWarehouseById(orgId, warehouseId) {
    return knex('warehouses')
        .where({ org_id: orgId, id: warehouseId })
        .first();
}

export async function createWarehouse(orgId, data) {
    const [result] = await knex('warehouses')
        .insert({
            org_id: orgId,
            code: data.code,
            name: data.name,
            address: data.address,
            contact: data.contact,
            is_default: data.isDefault || false,
            status: 'active'
        })
        .returning('*');
    return result;
}

export async function updateWarehouse(orgId, warehouseId, data) {
    const [result] = await knex('warehouses')
        .where({ org_id: orgId, id: warehouseId })
        .update({ ...data, updated_at: knex.fn.now() })
        .returning('*');
    return result;
}

export async function deleteWarehouse(orgId, warehouseId) {
    return knex('warehouses')
        .where({ org_id: orgId, id: warehouseId })
        .delete();
}

// ==================== 库位管理 ====================

export async function getLocations(orgId, warehouseId) {
    return knex('warehouse_locations')
        .where({ org_id: orgId, warehouse_id: warehouseId })
        .orderBy('code');
}

export async function getLocationById(orgId, locationId) {
    return knex('warehouse_locations')
        .where({ org_id: orgId, id: locationId })
        .first();
}

export async function createLocation(orgId, data) {
    const [result] = await knex('warehouse_locations')
        .insert({
            org_id: orgId,
            warehouse_id: data.warehouseId,
            code: data.code,
            zone: data.zone,
            aisle: data.aisle,
            shelf: data.shelf,
            position: data.position,
            qr_code: data.qrCode,
            capacity: data.capacity || 0,
            item_types: data.itemTypes ? JSON.stringify(data.itemTypes) : null,
            status: 'empty'
        })
        .returning('*');
    return result;
}

export async function updateLocation(orgId, locationId, data) {
    return knex('warehouse_locations')
        .where({ org_id: orgId, id: locationId })
        .update({ ...data, updated_at: knex.fn.now() });
}

export async function findAvailableLocations(orgId, warehouseId, itemType) {
    return knex('warehouse_locations')
        .where({ org_id: orgId, warehouse_id: warehouseId })
        .where('status', '!=', 'full')
        .where('status', '!=', 'locked')
        .whereRaw('used_capacity < capacity')
        .orderBy('used_capacity', 'asc')
        .limit(10);
}

// ==================== 赛事申请管理 ====================

export async function getRequests(orgId, raceId) {
    return knex('race_material_requests')
        .where({ org_id: orgId, race_id: raceId })
        .orderBy('created_at', 'desc');
}

export async function createRequest(orgId, data) {
    const [result] = await knex('race_material_requests')
        .insert({
            org_id: orgId,
            race_id: data.raceId,
            item_type: data.itemType,
            item_spec: JSON.stringify(data.itemSpec),
            requested_quantity: data.requestedQuantity,
            status: 'pending'
        })
        .returning('*');
    return result;
}

export async function approveRequest(orgId, requestId, approvedQuantity, approverId) {
    const [result] = await knex('race_material_requests')
        .where({ org_id: orgId, id: requestId })
        .update({
            approved_quantity: approvedQuantity,
            status: 'approved',
            approved_by: approverId,
            approved_at: knex.fn.now(),
            updated_at: knex.fn.now()
        })
        .returning('*');
    return result;
}

export async function allocateToRace(orgId, requestId, units) {
    return knex.transaction(async (trx) => {
        // 更新申请状态
        await trx('race_material_requests')
            .where({ org_id: orgId, id: requestId })
            .update({
                allocated_quantity: units.length,
                status: 'fulfilled',
                updated_at: trx.fn.now()
            });

        // 更新物资状态
        const unitIds = units.map(u => u.id);
        await trx('org_inventory_units')
            .whereIn('id', unitIds)
            .update({
                status: 'allocated',
                current_holder_type: 'race',
                allocated_at: trx.fn.now(),
                updated_at: trx.fn.now()
            });

        return { success: true, allocated: units.length };
    });
}

// ==================== 流转记录 ====================

export async function createTransaction(orgId, data) {
    const [result] = await knex('inventory_transactions')
        .insert({
            org_id: orgId,
            unit_id: data.unitId,
            transaction_type: data.transactionType,
            from_holder_type: data.fromHolderType,
            from_holder_id: data.fromHolderId,
            to_holder_type: data.toHolderType,
            to_holder_id: data.toHolderId,
            operator_id: data.operatorId,
            operator_name: data.operatorName,
            remarks: data.remarks
        })
        .returning('*');
    return result;
}

export async function getTransactions(orgId, filters = {}) {
    const query = knex('inventory_transactions').where({ org_id: orgId });

    if (filters.unitId) {
        query.where('unit_id', filters.unitId);
    }
    if (filters.transactionType) {
        query.where('transaction_type', filters.transactionType);
    }

    return query.orderBy('created_at', 'desc').limit(filters.limit || 100);
}

// ==================== 统计查询 ====================

export async function getStatistics(orgId) {
    const totalUnits = await knex('org_inventory_units')
        .where({ org_id: orgId })
        .count('* as count')
        .first();

    const byStatus = await knex('org_inventory_units')
        .where({ org_id: orgId })
        .select('status')
        .count('* as count')
        .groupBy('status');

    const byType = await knex('org_inventory_units')
        .where({ org_id: orgId })
        .select('item_type')
        .count('* as count')
        .groupBy('item_type');

    const totalBatches = await knex('org_inventory_batches')
        .where({ org_id: orgId })
        .count('* as count')
        .first();

    return {
        totalUnits: parseInt(totalUnits?.count || 0),
        totalBatches: parseInt(totalBatches?.count || 0),
        byStatus: byStatus.reduce((acc, row) => {
            acc[row.status] = parseInt(row.count);
            return acc;
        }, {}),
        byType: byType.reduce((acc, row) => {
            acc[row.item_type] = parseInt(row.count);
            return acc;
        }, {})
    };
}

// ==================== 入库前流程管理 ====================

export async function getPreInboundSummary(orgId) {
    const totalRow = await knex('inventory_preinbound_orders')
        .where({ org_id: orgId })
        .count('* as count')
        .first();

    const byStageRows = await knex('inventory_preinbound_orders')
        .where({ org_id: orgId })
        .select('current_stage')
        .count('* as count')
        .groupBy('current_stage');

    const stageCounts = PRE_INBOUND_STAGES.reduce((acc, stage) => {
        acc[stage] = 0;
        return acc;
    }, {});

    byStageRows.forEach((row) => {
        stageCounts[row.current_stage] = parseInt(row.count, 10);
    });

    const arrivingThisWeekRow = await knex('inventory_preinbound_orders')
        .where({ org_id: orgId })
        .whereNot('current_stage', 'inbound')
        .whereBetween('expected_arrival_date', [
            knex.raw('CURRENT_DATE'),
            knex.raw("CURRENT_DATE + INTERVAL '7 days'"),
        ])
        .count('* as count')
        .first();

    const overdueRow = await knex('inventory_preinbound_orders')
        .where({ org_id: orgId })
        .whereNotIn('current_stage', ['arrived', 'inbound'])
        .where('expected_arrival_date', '<', knex.raw('CURRENT_DATE'))
        .count('* as count')
        .first();

    return {
        total: parseInt(totalRow?.count || 0, 10),
        stageCounts,
        arrivingThisWeek: parseInt(arrivingThisWeekRow?.count || 0, 10),
        overdue: parseInt(overdueRow?.count || 0, 10),
        readyForInbound: stageCounts.arrived || 0,
        completedInbound: stageCounts.inbound || 0,
    };
}

export async function getPreInboundItems(orgId, filters = {}) {
    const query = knex('inventory_preinbound_orders as p')
        .leftJoin('org_inventory_batches as b', 'p.linked_batch_id', 'b.id')
        .where('p.org_id', orgId)
        .select('p.*', 'b.batch_name as linked_batch_name');

    if (filters.stage) {
        query.where('p.current_stage', filters.stage);
    }

    if (filters.priority) {
        query.where('p.priority', filters.priority);
    }

    if (filters.search) {
        const keyword = `%${String(filters.search).trim()}%`;
        query.where((builder) => {
            builder
                .whereILike('p.reference_no', keyword)
                .orWhereILike('p.item_name', keyword)
                .orWhereILike('p.item_category', keyword)
                .orWhereILike('p.supplier', keyword)
                .orWhereILike('p.contact_name', keyword);
        });
    }

    if (filters.onlyActive) {
        query.whereNot('p.current_stage', 'inbound');
    }

    return query
        .orderByRaw(`
            CASE p.current_stage
                WHEN 'pending' THEN 1
                WHEN 'confirmed' THEN 2
                WHEN 'communication' THEN 3
                WHEN 'ordered' THEN 4
                WHEN 'sampling' THEN 5
                WHEN 'production' THEN 6
                WHEN 'shipped' THEN 7
                WHEN 'logistics' THEN 8
                WHEN 'arrived' THEN 9
                WHEN 'inbound' THEN 10
                ELSE 99
            END
        `)
        .orderByRaw(`
            CASE p.priority
                WHEN 'urgent' THEN 1
                WHEN 'high' THEN 2
                WHEN 'normal' THEN 3
                ELSE 9
            END
        `)
        .orderBy('p.updated_at', 'desc')
        .limit(filters.limit || 200);
}

export async function getPreInboundItemById(orgId, id) {
    return knex('inventory_preinbound_orders as p')
        .leftJoin('org_inventory_batches as b', 'p.linked_batch_id', 'b.id')
        .where({ 'p.org_id': orgId, 'p.id': id })
        .select('p.*', 'b.batch_name as linked_batch_name')
        .first();
}

export async function getPreInboundLogs(orgId, orderId) {
    return knex('inventory_preinbound_logs')
        .where({ org_id: orgId, order_id: orderId })
        .orderBy('created_at', 'desc');
}

export async function createPreInboundItem(orgId, data, userId) {
    return knex.transaction(async (trx) => {
        const payload = pickPreInboundFields(data);

        if (!payload.reference_no) payload.reference_no = buildPreInboundReference();
        if (!payload.item_name) throw new Error('itemName is required');
        if (payload.planned_quantity === undefined) payload.planned_quantity = 0;
        if (payload.confirmed_quantity === undefined) {
            payload.confirmed_quantity = payload.planned_quantity;
        }

        const [result] = await trx('inventory_preinbound_orders')
            .insert({
                org_id: orgId,
                ...payload,
                current_stage: PRE_INBOUND_STAGE_SET.has(data.currentStage) ? data.currentStage : 'pending',
                created_by: userId || null,
            })
            .returning('*');

        await createPreInboundLogRow(trx, orgId, result.id, 'created', {
            toStage: result.current_stage,
            note: payload.remarks || null,
            operatorId: userId,
            metadata: {
                plannedQuantity: result.planned_quantity,
                confirmedQuantity: result.confirmed_quantity,
            },
        });

        return result;
    });
}

export async function updatePreInboundItem(orgId, id, data, userId) {
    return knex.transaction(async (trx) => {
        const existing = await trx('inventory_preinbound_orders')
            .where({ org_id: orgId, id })
            .first();

        if (!existing) {
            throw new Error('Pre-inbound item not found');
        }

        const payload = pickPreInboundFields(data);
        if (!Object.keys(payload).length) {
            return existing;
        }

        const [result] = await trx('inventory_preinbound_orders')
            .where({ org_id: orgId, id })
            .update({
                ...payload,
                updated_at: trx.fn.now(),
            })
            .returning('*');

        await createPreInboundLogRow(trx, orgId, id, 'updated', {
            fromStage: existing.current_stage,
            toStage: existing.current_stage,
            note: data.logNote || '更新了单据信息',
            operatorId: userId,
            metadata: payload,
        });

        return result;
    });
}

export async function addPreInboundNote(orgId, id, note, userId) {
    if (!String(note || '').trim()) {
        throw new Error('note is required');
    }

    return knex.transaction(async (trx) => {
        const existing = await trx('inventory_preinbound_orders')
            .where({ org_id: orgId, id })
            .first();

        if (!existing) {
            throw new Error('Pre-inbound item not found');
        }

        await trx('inventory_preinbound_orders')
            .where({ org_id: orgId, id })
            .update({ updated_at: trx.fn.now() });

        return createPreInboundLogRow(trx, orgId, id, 'note_added', {
            fromStage: existing.current_stage,
            toStage: existing.current_stage,
            note: String(note).trim(),
            operatorId: userId,
        });
    });
}

export async function advancePreInboundStage(orgId, id, targetStage, note, userId) {
    if (!PRE_INBOUND_STAGE_SET.has(targetStage)) {
        throw new Error('Invalid stage');
    }

    return knex.transaction(async (trx) => {
        const existing = await trx('inventory_preinbound_orders')
            .where({ org_id: orgId, id })
            .first();

        if (!existing) {
            throw new Error('Pre-inbound item not found');
        }

        const currentIndex = PRE_INBOUND_STAGES.indexOf(existing.current_stage);
        const nextIndex = PRE_INBOUND_STAGES.indexOf(targetStage);

        if (nextIndex < currentIndex) {
            throw new Error('Stage cannot move backwards');
        }

        const [result] = await trx('inventory_preinbound_orders')
            .where({ org_id: orgId, id })
            .update({
                current_stage: targetStage,
                updated_at: trx.fn.now(),
            })
            .returning('*');

        await createPreInboundLogRow(trx, orgId, id, 'stage_changed', {
            fromStage: existing.current_stage,
            toStage: targetStage,
            note: note || null,
            operatorId: userId,
        });

        return result;
    });
}

export async function startPreInboundInbound(orgId, id, userId) {
    return knex.transaction(async (trx) => {
        const existing = await trx('inventory_preinbound_orders')
            .where({ org_id: orgId, id })
            .first();

        if (!existing) {
            throw new Error('Pre-inbound item not found');
        }

        if (!['arrived', 'inbound'].includes(existing.current_stage)) {
            throw new Error('Only arrived items can start inbound');
        }

        let batch = null;

        if (existing.linked_batch_id) {
            batch = await trx('org_inventory_batches')
                .where({ org_id: orgId, id: existing.linked_batch_id })
                .first();
        }

        if (!batch) {
            const [createdBatch] = await trx('org_inventory_batches')
                .insert({
                    org_id: orgId,
                    batch_name: `${existing.item_name} ${existing.reference_no}`,
                    batch_type: existing.item_type || 'other',
                    supplier: existing.supplier,
                    total_quantity: 0,
                    status: 'draft',
                    created_by: userId || existing.created_by || null,
                })
                .returning('*');

            batch = createdBatch;
        }

        const [result] = await trx('inventory_preinbound_orders')
            .where({ org_id: orgId, id })
            .update({
                current_stage: 'inbound',
                linked_batch_id: batch.id,
                completed_at: trx.fn.now(),
                updated_at: trx.fn.now(),
            })
            .returning('*');

        await createPreInboundLogRow(trx, orgId, id, 'inbound_started', {
            fromStage: existing.current_stage,
            toStage: 'inbound',
            note: '已转入正式入库流程',
            operatorId: userId,
            metadata: {
                batchId: batch.id,
                batchName: batch.batch_name,
            },
        });

        return {
            order: result,
            batch,
            suggestedInbound: {
                batchId: batch.id,
                itemType: existing.item_type || 'other',
                itemCategory: existing.item_category || existing.item_name,
                quantity: existing.confirmed_quantity || existing.planned_quantity || 1,
            },
        };
    });
}

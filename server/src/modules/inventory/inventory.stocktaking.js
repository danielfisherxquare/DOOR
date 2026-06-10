/**
 * Inventory Stocktaking Service — 盘点服务
 */
import knex from '../../db/knex.js';
import * as repo from './inventory.repository.js';

// 盘点状态
const PLAN_STATUS = {
    DRAFT: 'draft',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
};

// 盘点类型
const PLAN_TYPE = {
    FULL: 'full',
    PARTIAL: 'partial',
    DYNAMIC: 'dynamic'
};

/**
 * 获取盘点计划列表
 */
export async function getPlans(orgId, filters = {}) {
    const query = knex('stocktaking_plans')
        .where({ org_id: orgId });

    if (filters.status) {
        query.where('status', filters.status);
    }
    if (filters.planType) {
        query.where('plan_type', filters.planType);
    }

    return query.orderBy('created_at', 'desc').limit(filters.limit || 100);
}

/**
 * 获取盘点计划详情
 */
export async function getPlan(orgId, planId) {
    return knex('stocktaking_plans')
        .where({ org_id: orgId, id: planId })
        .first();
}

/**
 * 创建盘点计划
 */
export async function createPlan(orgId, data, createdBy) {
    const [plan] = await knex('stocktaking_plans')
        .insert({
            org_id: orgId,
            warehouse_id: data.warehouseId,
            plan_name: data.planName,
            plan_type: data.planType || PLAN_TYPE.FULL,
            scope: data.scope ? JSON.stringify(data.scope) : null,
            status: PLAN_STATUS.DRAFT,
            total_items: 0,
            counted_items: 0,
            diff_items: 0,
            created_by: createdBy
        })
        .returning('*');

    return plan;
}

/**
 * 开始盘点
 */
export async function startPlan(orgId, planId) {
    const plan = await getPlan(orgId, planId);
    if (!plan) {
        throw new Error('盘点计划不存在');
    }
    if (plan.status !== PLAN_STATUS.DRAFT) {
        throw new Error('只有草稿状态的计划才能开始');
    }

    // 获取盘点范围内的物资
    let unitsQuery = knex('org_inventory_units')
        .where({ org_id: orgId })
        .whereIn('status', ['in_stock', 'allocated']);

    // 根据仓库筛选
    if (plan.warehouse_id) {
        unitsQuery = unitsQuery.where('warehouse_id', plan.warehouse_id);
    }

    // 根据范围筛选
    if (plan.scope) {
        const scope = JSON.parse(plan.scope);
        if (scope.item_types && scope.item_types.length > 0) {
            unitsQuery = unitsQuery.whereIn('item_type', scope.item_types);
        }
    }

    const units = await unitsQuery;

    // 创建盘点记录
    const records = units.map(unit => ({
        plan_id: planId,
        org_id: orgId,
        unit_id: unit.id,
        qr_code: unit.qr_code,
        expected_location: unit.location_id ? String(unit.location_id) : null,
        expected_status: unit.status,
        system_quantity: 1,
        actual_quantity: null,
        is_matched: null,
        counted_by: null,
        counted_at: null
    }));

    if (records.length > 0) {
        await knex('stocktaking_records').insert(records);
    }

    // 更新计划状态
    const [updatedPlan] = await knex('stocktaking_plans')
        .where({ org_id: orgId, id: planId })
        .update({
            status: PLAN_STATUS.IN_PROGRESS,
            total_items: records.length,
            started_at: knex.fn.now()
        })
        .returning('*');

    return updatedPlan;
}

/**
 * 扫码盘点
 */
export async function scanCount(orgId, planId, data, countedBy) {
    const { qrCode, actualLocation, actualStatus, actualQuantity } = data;

    // 查找盘点记录
    const record = await knex('stocktaking_records')
        .where({
            plan_id: planId,
            org_id: orgId,
            qr_code: qrCode
        })
        .first();

    if (!record) {
        throw new Error('该物资不在盘点范围内');
    }

    if (record.actual_quantity !== null) {
        throw new Error('该物资已盘点');
    }

    // 判断是否匹配
    const isMatched =
        record.expected_status === (actualStatus || 'in_stock') &&
        (record.expected_location === actualLocation || !actualLocation);

    // 更新盘点记录
    await knex('stocktaking_records')
        .where({ id: record.id })
        .update({
            actual_location: actualLocation,
            actual_status: actualStatus || 'in_stock',
            actual_quantity: actualQuantity || 1,
            is_matched: isMatched,
            counted_by: countedBy,
            counted_at: knex.fn.now()
        });

    // 更新计划进度
    await knex('stocktaking_plans')
        .where({ org_id: orgId, id: planId })
        .increment('counted_items', 1);

    // 如果不匹配，增加差异数
    if (!isMatched) {
        await knex('stocktaking_plans')
            .where({ org_id: orgId, id: planId })
            .increment('diff_items', 1);
    }

    return {
        success: true,
        matched: isMatched,
        record: {
            ...record,
            actual_location: actualLocation,
            actual_status: actualStatus,
            actual_quantity: actualQuantity,
            is_matched: isMatched
        }
    };
}

/**
 * 完成盘点
 */
export async function completePlan(orgId, planId) {
    const plan = await getPlan(orgId, planId);
    if (!plan) {
        throw new Error('盘点计划不存在');
    }
    if (plan.status !== PLAN_STATUS.IN_PROGRESS) {
        throw new Error('只有进行中的计划才能完成');
    }

    // 统计最终结果
    const stats = await knex('stocktaking_records')
        .where({ plan_id: planId })
        .select(
            knex.raw('COUNT(*) as total'),
            knex.raw('COUNT(CASE WHEN actual_quantity IS NOT NULL THEN 1 END) as counted'),
            knex.raw('COUNT(CASE WHEN is_matched = false THEN 1 END) as diff')
        )
        .first();

    // 更新计划状态
    const [updatedPlan] = await knex('stocktaking_plans')
        .where({ org_id: orgId, id: planId })
        .update({
            status: PLAN_STATUS.COMPLETED,
            counted_items: stats.counted,
            diff_items: stats.diff,
            completed_at: knex.fn.now()
        })
        .returning('*');

    return updatedPlan;
}

/**
 * 取消盘点
 */
export async function cancelPlan(orgId, planId) {
    const plan = await getPlan(orgId, planId);
    if (!plan) {
        throw new Error('盘点计划不存在');
    }
    if (plan.status === PLAN_STATUS.COMPLETED) {
        throw new Error('已完成的计划不能取消');
    }

    // 删除盘点记录
    await knex('stocktaking_records')
        .where({ plan_id: planId })
        .delete();

    // 更新计划状态
    const [updatedPlan] = await knex('stocktaking_plans')
        .where({ org_id: orgId, id: planId })
        .update({
            status: PLAN_STATUS.CANCELLED,
            total_items: 0,
            counted_items: 0,
            diff_items: 0
        })
        .returning('*');

    return updatedPlan;
}

/**
 * 获取盘点记录
 */
export async function getRecords(orgId, planId, filters = {}) {
    const query = knex('stocktaking_records')
        .where({ org_id: orgId, plan_id: planId });

    if (filters.isMatched !== undefined) {
        query.where('is_matched', filters.isMatched);
    }

    return query.orderBy('counted_at', 'desc');
}

/**
 * 获取盘点统计
 */
export async function getStatistics(orgId, planId) {
    const plan = await getPlan(orgId, planId);
    if (!plan) {
        throw new Error('盘点计划不存在');
    }

    const records = await knex('stocktaking_records')
        .where({ plan_id: planId });

    const total = records.length;
    const counted = records.filter(r => r.actual_quantity !== null).length;
    const matched = records.filter(r => r.is_matched === true).length;
    const unmatched = records.filter(r => r.is_matched === false).length;
    const pending = records.filter(r => r.actual_quantity === null).length;

    return {
        plan,
        total,
        counted,
        matched,
        unmatched,
        pending,
        progress: total > 0 ? Math.round((counted / total) * 100) : 0
    };
}

export default {
    getPlans,
    getPlan,
    createPlan,
    startPlan,
    scanCount,
    completePlan,
    cancelPlan,
    getRecords,
    getStatistics
};
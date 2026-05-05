/**
 * Inventory Report Service — 报表服务
 */
import knex from '../../db/knex.js';

/**
 * 获取库存统计
 */
export async function getStatistics(orgId) {
    // 总库存数
    const totalUnits = await knex('org_inventory_units')
        .where({ org_id: orgId })
        .count('* as count')
        .first();

    // 按状态统计
    const byStatus = await knex('org_inventory_units')
        .where({ org_id: orgId })
        .select('status')
        .count('* as count')
        .groupBy('status');

    // 按类型统计
    const byType = await knex('org_inventory_units')
        .where({ org_id: orgId })
        .select('item_type')
        .count('* as count')
        .groupBy('item_type');

    // 批次总数
    const totalBatches = await knex('org_inventory_batches')
        .where({ org_id: orgId })
        .count('* as count')
        .first();

    // 仓库总数
    const totalWarehouses = await knex('warehouses')
        .where({ org_id: orgId })
        .count('* as count')
        .first();

    return {
        totalUnits: parseInt(totalUnits.count),
        totalBatches: parseInt(totalBatches.count),
        totalWarehouses: parseInt(totalWarehouses.count),
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

/**
 * 获取流转记录
 */
export async function getTransactions(orgId, filters = {}) {
    const query = knex('inventory_transactions')
        .where({ org_id: orgId });

    if (filters.transactionType) {
        query.where('transaction_type', filters.transactionType);
    }
    if (filters.unitId) {
        query.where('unit_id', filters.unitId);
    }
    if (filters.startDate) {
        query.where('created_at', '>=', filters.startDate);
    }
    if (filters.endDate) {
        query.where('created_at', '<=', filters.endDate);
    }

    return query.orderBy('created_at', 'desc').limit(filters.limit || 100);
}

/**
 * 获取出入库趋势
 */
export async function getTrend(orgId, days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const transactions = await knex('inventory_transactions')
        .where({ org_id: orgId })
        .where('created_at', '>=', startDate)
        .select(
            knex.raw("DATE(created_at) as date"),
            'transaction_type'
        )
        .count('* as count')
        .groupByRaw("DATE(created_at), transaction_type")
        .orderBy('date');

    // 按日期聚合
    const trendMap = {};
    for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - (days - 1 - i));
        const dateStr = date.toISOString().split('T')[0];
        trendMap[dateStr] = { date: dateStr.slice(5), inbound: 0, outbound: 0 };
    }

    for (const trans of transactions) {
        const dateStr = trans.date;
        if (trendMap[dateStr]) {
            if (trans.transaction_type === 'inbound') {
                trendMap[dateStr].inbound = parseInt(trans.count);
            } else if (trans.transaction_type === 'pickup' || trans.transaction_type === 'allocate') {
                trendMap[dateStr].outbound += parseInt(trans.count);
            }
        }
    }

    return Object.values(trendMap);
}

/**
 * 获取库存周转率
 */
export async function getTurnoverRate(orgId, startDate, endDate) {
    // 期间出库数量
    const outbound = await knex('inventory_transactions')
        .where({ org_id: orgId })
        .whereIn('transaction_type', ['pickup', 'allocate', 'outbound'])
        .whereBetween('created_at', [startDate, endDate])
        .count('* as count')
        .first();

    // 平均库存（简化计算：当前库存）
    const avgStock = await knex('org_inventory_units')
        .where({ org_id: orgId })
        .count('* as count')
        .first();

    const outboundCount = parseInt(outbound.count);
    const avgStockCount = parseInt(avgStock.count);

    return {
        outboundCount,
        avgStockCount,
        turnoverRate: avgStockCount > 0 ? (outboundCount / avgStockCount).toFixed(2) : 0
    };
}

/**
 * 物资追溯
 */
export async function traceUnit(orgId, unitId) {
    // 获取物资信息
    const unit = await knex('org_inventory_units')
        .where({ org_id: orgId, id: unitId })
        .first();

    if (!unit) {
        throw new Error('物资不存在');
    }

    // 获取流转历史
    const transactions = await knex('inventory_transactions')
        .where({ org_id: orgId, unit_id: unitId })
        .orderBy('created_at', 'desc');

    // 获取批次信息
    const batch = await knex('org_inventory_batches')
        .where({ id: unit.batch_id })
        .first();

    return {
        unit,
        batch,
        transactions
    };
}

/**
 * 获取类型分布
 */
export async function getTypeDistribution(orgId) {
    const distribution = await knex('org_inventory_units')
        .where({ org_id: orgId })
        .select('item_type')
        .count('* as count')
        .groupBy('item_type')
        .orderBy('count', 'desc');

    const total = distribution.reduce((sum, item) => sum + parseInt(item.count), 0);

    return distribution.map(item => ({
        type: item.item_type,
        count: parseInt(item.count),
        percentage: total > 0 ? Math.round((parseInt(item.count) / total) * 100) : 0
    }));
}

/**
 * 获取仓库分布
 */
export async function getWarehouseDistribution(orgId) {
    const distribution = await knex('org_inventory_units as u')
        .leftJoin('warehouses as w', 'u.warehouse_id', 'w.id')
        .where('u.org_id', orgId)
        .select(knex.raw('COALESCE(w.name, \'未分配\') as warehouse_name'))
        .count('u.id as count')
        .groupBy('w.name')
        .orderBy('count', 'desc');

    return distribution.map(item => ({
        warehouse: item.warehouse_name,
        count: parseInt(item.count)
    }));
}

/**
 * 生成库存快照
 */
export async function generateSnapshot(orgId, date) {
    const snapshot = {
        date,
        org_id: orgId
    };

    // 当前库存统计
    snapshot.statistics = await getStatistics(orgId);

    // 类型分布
    snapshot.typeDistribution = await getTypeDistribution(orgId);

    // 仓库分布
    snapshot.warehouseDistribution = await getWarehouseDistribution(orgId);

    return snapshot;
}

export default {
    getStatistics,
    getTransactions,
    getTrend,
    getTurnoverRate,
    traceUnit,
    getTypeDistribution,
    getWarehouseDistribution,
    generateSnapshot
};
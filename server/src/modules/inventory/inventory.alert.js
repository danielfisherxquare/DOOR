/**
 * Inventory Alert Service — 库存预警服务
 */
import knex from '../../db/knex.js';
import * as repo from './inventory.repository.js';

// 预警类型
const ALERT_TYPES = {
    LOW_STOCK: 'low_stock',
    EXPIRING: 'expiring',
    SLOW_MOVING: 'slow_moving',
    ABNORMAL_LOSS: 'abnormal_loss'
};

// 严重程度
const SEVERITY = {
    INFO: 'info',
    WARNING: 'warning',
    CRITICAL: 'critical'
};

/**
 * 检查库存预警
 */
export async function checkAlerts(orgId) {
    const alerts = [];

    // 获取预警规则
    const rules = await knex('inventory_alert_rules')
        .where({ org_id: orgId, is_enabled: true });

    for (const rule of rules) {
        switch (rule.rule_type) {
            case ALERT_TYPES.LOW_STOCK:
                const lowStockAlerts = await checkLowStock(orgId, rule);
                alerts.push(...lowStockAlerts);
                break;
            case ALERT_TYPES.EXPIRING:
                const expiringAlerts = await checkExpiring(orgId, rule);
                alerts.push(...expiringAlerts);
                break;
            case ALERT_TYPES.SLOW_MOVING:
                const slowMovingAlerts = await checkSlowMoving(orgId, rule);
                alerts.push(...slowMovingAlerts);
                break;
            case ALERT_TYPES.ABNORMAL_LOSS:
                const lossAlerts = await checkAbnormalLoss(orgId, rule);
                alerts.push(...lossAlerts);
                break;
        }
    }

    // 保存预警记录
    if (alerts.length > 0) {
        await knex('inventory_alerts').insert(alerts);
    }

    return alerts;
}

/**
 * 检查低库存
 */
async function checkLowStock(orgId, rule) {
    const alerts = [];

    // 按类型统计库存
    const stats = await knex('org_inventory_units')
        .where({ org_id: orgId, status: 'in_stock' })
        .select('item_type')
        .count('* as count')
        .groupBy('item_type');

    for (const stat of stats) {
        const count = parseInt(stat.count);
        if (count <= rule.threshold_value) {
            alerts.push({
                org_id: orgId,
                rule_id: rule.id,
                alert_type: ALERT_TYPES.LOW_STOCK,
                severity: count === 0 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
                title: `${stat.item_type}库存不足`,
                content: `${stat.item_type}当前库存${count}件，低于阈值${rule.threshold_value}件`,
                is_read: false,
                is_resolved: false
            });
        }
    }

    return alerts;
}

/**
 * 检查即将过期（示例：基于批次创建时间）
 */
async function checkExpiring(orgId, rule) {
    const alerts = [];
    const days = parseInt(rule.threshold_value, 10);
    if (!Number.isFinite(days) || days <= 0) return alerts;

    // 使用 JOIN 一次性获取过期批次及其在库数量（消除 N+1）
    const expiringBatches = await knex('org_inventory_batches as b')
        .leftJoin('org_inventory_units as u', function () {
            this.on('b.id', '=', 'u.batch_id')
                .andOn('u.status', '=', knex.raw("'in_stock'"));
        })
        .where({ 'b.org_id': orgId, 'b.status': 'active' })
        .whereRaw('b.created_at < NOW() - ? * INTERVAL \'1 day\'', [days])
        .select('b.*')
        .count('u.id as unit_count')
        .groupBy('b.id')
        .having(knex.raw('count(u.id) > 0'));

    for (const batch of expiringBatches) {
        alerts.push({
            org_id: orgId,
            rule_id: rule.id,
            alert_type: ALERT_TYPES.EXPIRING,
            severity: SEVERITY.WARNING,
            title: `批次${batch.batch_name}可能过期`,
            content: `批次${batch.batch_name}创建于${batch.created_at}，当前仍有${batch.unit_count}件在库`,
            related_batch_id: batch.id,
            is_read: false,
            is_resolved: false
        });
    }

    return alerts;
}

/**
 * 检查滞销物资
 */
async function checkSlowMoving(orgId, rule) {
    const alerts = [];
    const days = parseInt(rule.threshold_value, 10);
    if (!Number.isFinite(days) || days <= 0) return alerts;

    // 获取长时间未流转的物资（参数化 INTERVAL，防止 SQL 注入）
    const slowUnits = await knex('org_inventory_units as u')
        .leftJoin('inventory_transactions as t', function () {
            this.on('u.id', '=', 't.unit_id')
                .andOn('t.created_at', '>', knex.raw('NOW() - ? * INTERVAL \'1 day\'', [days]));
        })
        .where({ 'u.org_id': orgId, 'u.status': 'in_stock' })
        .whereNull('t.id')
        .count('u.id as count')
        .first();

    if (slowUnits.count > 0) {
        alerts.push({
            org_id: orgId,
            rule_id: rule.id,
            alert_type: ALERT_TYPES.SLOW_MOVING,
            severity: SEVERITY.INFO,
            title: '存在滞销物资',
            content: `有${slowUnits.count}件物资超过${days}天未流转`,
            is_read: false,
            is_resolved: false
        });
    }

    return alerts;
}

/**
 * 检查异常损耗
 */
async function checkAbnormalLoss(orgId, rule) {
    const alerts = [];
    const threshold = parseFloat(rule.threshold_value);

    // 统计近7天的损耗率
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const totalUnits = await knex('org_inventory_units')
        .where({ org_id: orgId })
        .count('* as count')
        .first();

    const damagedUnits = await knex('org_inventory_units')
        .where({ org_id: orgId, status: 'damaged' })
        .where('updated_at', '>=', weekAgo)
        .count('* as count')
        .first();

    const lossRate = totalUnits.count > 0
        ? (damagedUnits.count / totalUnits.count) * 100
        : 0;

    if (lossRate > threshold) {
        alerts.push({
            org_id: orgId,
            rule_id: rule.id,
            alert_type: ALERT_TYPES.ABNORMAL_LOSS,
            severity: SEVERITY.WARNING,
            title: '异常损耗预警',
            content: `近7天损耗率${lossRate.toFixed(1)}%，超过阈值${threshold}%`,
            is_read: false,
            is_resolved: false
        });
    }

    return alerts;
}

/**
 * 获取预警列表
 */
export async function getAlerts(orgId, filters = {}) {
    const query = knex('inventory_alerts')
        .where({ org_id: orgId });

    if (filters.isRead !== undefined) {
        query.where('is_read', filters.isRead);
    }
    if (filters.isResolved !== undefined) {
        query.where('is_resolved', filters.isResolved);
    }
    if (filters.severity) {
        query.where('severity', filters.severity);
    }

    return query.orderBy('created_at', 'desc').limit(filters.limit || 100);
}

/**
 * 获取未读预警数
 */
export async function getUnreadCount(orgId) {
    const result = await knex('inventory_alerts')
        .where({ org_id: orgId, is_read: false })
        .count('* as count')
        .first();
    return parseInt(result.count);
}

/**
 * 标记预警已读
 */
export async function markAsRead(orgId, alertId) {
    return knex('inventory_alerts')
        .where({ org_id: orgId, id: alertId })
        .update({ is_read: true });
}

/**
 * 标记预警已解决
 */
export async function markAsResolved(orgId, alertId, resolvedBy) {
    return knex('inventory_alerts')
        .where({ org_id: orgId, id: alertId })
        .update({
            is_resolved: true,
            is_read: true,
            resolved_by: resolvedBy,
            resolved_at: knex.fn.now()
        });
}

/**
 * 获取预警规则
 */
export async function getRules(orgId) {
    return knex('inventory_alert_rules')
        .where({ org_id: orgId })
        .orderBy('created_at', 'desc');
}

/**
 * 创建预警规则
 */
export async function createRule(orgId, data) {
    const [result] = await knex('inventory_alert_rules')
        .insert({
            org_id: orgId,
            rule_type: data.ruleType,
            item_type: data.itemType,
            item_category: data.itemCategory,
            threshold_value: data.thresholdValue,
            threshold_type: data.thresholdType,
            notify_channels: JSON.stringify(data.notifyChannels || ['in_app']),
            notify_users: data.notifyUsers ? JSON.stringify(data.notifyUsers) : null,
            is_enabled: true
        })
        .returning('*');
    return result;
}

/**
 * 更新预警规则
 */
export async function updateRule(orgId, ruleId, data) {
    const [result] = await knex('inventory_alert_rules')
        .where({ org_id: orgId, id: ruleId })
        .update({
            ...data,
            updated_at: knex.fn.now()
        })
        .returning('*');
    return result;
}

export default {
    checkAlerts,
    getAlerts,
    getUnreadCount,
    markAsRead,
    markAsResolved,
    getRules,
    createRule,
    updateRule
};
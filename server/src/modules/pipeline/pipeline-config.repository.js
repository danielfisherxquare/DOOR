/**
 * Pipeline Config Repository — 出发区 + 成绩规则 数据访问层
 * 多租户隔离：所有查询必须带 org_id
 */
import knex from '../../db/knex.js';
import { isHalfEvent } from '../../utils/event-normalizer.js';
import { startZoneMapper, performanceRuleMapper } from '../../db/mappers/pipeline.js';
import { raceCapacityMapper } from '../../db/mappers/lottery.js';

// ═══════════════════════════════════════════════════════════════════════
//  start_zones
// ═══════════════════════════════════════════════════════════════════════

export async function getStartZones(orgId, raceId) {
    const rows = await knex('start_zones')
        .where({ org_id: orgId, race_id: raceId })
        .orderBy('sort_order');
    return rows.map(startZoneMapper.fromDbRow);
}

export async function saveStartZone(orgId, data) {
    const row = startZoneMapper.toDbInsert(data, orgId);

    if (data.id) {
        // 更新已有记录
        const updateRow = startZoneMapper.toDbUpdate(data);
        const [updated] = await knex('start_zones')
            .where({ org_id: orgId, id: data.id })
            .update(updateRow)
            .returning('*');
        return startZoneMapper.fromDbRow(updated);
    }

    // 新建：UPSERT on (org_id, race_id, zone_name)
    const [result] = await knex('start_zones')
        .insert(row)
        .onConflict(['org_id', 'race_id', 'zone_name'])
        .merge({
            width: row.width,
            length: row.length,
            density: row.density,
            calculated_capacity: row.calculated_capacity,
            color: row.color,
            sort_order: row.sort_order,
            gap_distance: row.gap_distance,
            event: row.event,
            capacity_ratio: row.capacity_ratio,
            score_upper_seconds: row.score_upper_seconds,
        })
        .returning('*');
    return startZoneMapper.fromDbRow(result);
}

export async function deleteStartZone(orgId, id) {
    return (await knex('start_zones').where({ org_id: orgId, id }).delete()) > 0;
}

// ═══════════════════════════════════════════════════════════════════════
//  performance_rules
// ═══════════════════════════════════════════════════════════════════════

export async function getPerformanceRules(orgId, raceId) {
    const rows = await knex('performance_rules')
        .where({ org_id: orgId, race_id: raceId })
        .orderBy('event');
    return rows.map(performanceRuleMapper.fromDbRow);
}

export async function savePerformanceRule(orgId, data) {
    const row = performanceRuleMapper.toDbInsert(data, orgId);

    if (data.id) {
        const updateRow = performanceRuleMapper.toDbUpdate(data);
        const [updated] = await knex('performance_rules')
            .where({ org_id: orgId, id: data.id })
            .update(updateRow)
            .returning('*');
        return performanceRuleMapper.fromDbRow(updated);
    }

    const [result] = await knex('performance_rules')
        .insert(row)
        .onConflict(['org_id', 'race_id', 'event'])
        .merge({
            min_time: row.min_time,
            max_time: row.max_time,
            priority_ratio: row.priority_ratio,
        })
        .returning('*');
    return performanceRuleMapper.fromDbRow(result);
}

export async function deletePerformanceRule(orgId, id) {
    return (await knex('performance_rules').where({ org_id: orgId, id }).delete()) > 0;
}

// ═══════════════════════════════════════════════════════════════════════
//  preview
// ═══════════════════════════════════════════════════════════════════════

export async function getPreview(orgId, raceId) {
    const [capsRows, zoneRows, perfRuleRows, inventorySummary, recordSummary] = await Promise.all([
        knex('race_capacity')
            .where({ org_id: orgId, race_id: raceId })
            .orderBy('event'),
        knex('start_zones')
            .where({ org_id: orgId, race_id: raceId })
            .orderBy([{ column: 'sort_order', order: 'asc' }, { column: 'zone_name', order: 'asc' }]),
        knex('performance_rules')
            .where({ org_id: orgId, race_id: raceId })
            .orderBy('event'),
        knex('clothing_limits')
            .where({ org_id: orgId, race_id: raceId })
            .select(
                knex.raw('COALESCE(SUM(total_inventory), 0)::int AS total_inventory'),
                knex.raw('COALESCE(SUM(used_count), 0)::int AS used_inventory'),
            )
            .first(),
        knex('records')
            .where({ org_id: orgId, race_id: raceId })
            .select(
                knex.raw('COUNT(*)::int AS total'),
                knex.raw("COUNT(*) FILTER (WHERE audit_status IN ('pass', 'qualified_time'))::int AS passed"),
                knex.raw("COUNT(*) FILTER (WHERE audit_status = 'qualified_time')::int AS qualified"),
                knex.raw("COUNT(*) FILTER (WHERE is_locked = 1)::int AS locked"),
                knex.raw("COUNT(*) FILTER (WHERE lottery_status = '中签')::int AS won"),
                knex.raw("COUNT(*) FILTER (WHERE lottery_status = '未中签')::int AS lost"),
            )
            .first(),
    ]);

    const caps = capsRows.map(raceCapacityMapper.fromDbRow);
    const zones = zoneRows.map(startZoneMapper.fromDbRow);
    const perfRules = perfRuleRows.map(performanceRuleMapper.fromDbRow);

    const totalTarget = caps.reduce((sum, row) => sum + Number(row.targetCount || 0), 0);
    const totalZoneCap = zones
        .filter((zone) => zone.zoneName !== 'S')
        .reduce((sum, zone) => sum + Math.floor(Number(zone.calculatedCapacity || 0) * Number(zone.capacityRatio ?? 1)), 0);
    const qualifiedCount = Number(recordSummary?.qualified || 0);
    const totalInventory = Number(inventorySummary?.total_inventory || 0);
    const usedInventory = Number(inventorySummary?.used_inventory || 0);

    return {
        step1: { totalTarget, caps },
        step2: { totalZoneCap, zones, gap: totalTarget - totalZoneCap },
        step3: { qualifiedCount, perfRules },
        step4: { totalInventory, usedInventory, remainingInventory: totalInventory - usedInventory },
        records: {
            total: Number(recordSummary?.total || 0),
            passed: Number(recordSummary?.passed || 0),
            qualified: qualifiedCount,
            locked: Number(recordSummary?.locked || 0),
            won: Number(recordSummary?.won || 0),
            lost: Number(recordSummary?.lost || 0),
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════
//  stepFilterPerformance — 成绩筛选执行
//  源自 sqliteService.cjs:2916-2974
// ═══════════════════════════════════════════════════════════════════════

/**
 * 将 HH:MM:SS 或 H:MM:SS 格式的时间字符串转为秒数
 */
function timeToSeconds(str) {
    if (!str || typeof str !== 'string') return 0;
    const parts = str.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
}



/**
 * 执行成绩筛选
 * 1) 清除之前的 qualified_time 标记 → 重置为 pass
 * 2) 遍历 performance_rules → 匹配项目 → 解析 personalBest JSON → 比较时间
 * 3) 返回 { qualifiedCount, unqualifiedCount, noTimeCount }
 */
export async function stepFilterPerformance(orgId, raceId) {
    return knex.transaction(async (trx) => {
        // 获取规则
        const rules = await trx('performance_rules')
            .where({ org_id: orgId, race_id: raceId });

        // 清除之前的 qualified_time 标记
        await trx('records')
            .where({ org_id: orgId, race_id: raceId, audit_status: 'qualified_time' })
            .update({ audit_status: 'pass' });

        let qualifiedCount = 0;
        let unqualifiedCount = 0;
        let noTimeCount = 0;

        for (const rule of rules) {
            if (!rule.max_time) continue;
            const maxSec = timeToSeconds(rule.max_time);
            const minSec = rule.min_time ? timeToSeconds(rule.min_time) : 0;
            const ruleIsHalf = isHalfEvent(rule.event);

            // 查找所有 pass 且未锁定的选手
            const candidates = await trx('records')
                .where({ org_id: orgId, race_id: raceId, audit_status: 'pass', is_locked: 0 })
                .select('id', 'personal_best_full', 'personal_best_half', 'event');

            for (const c of candidates) {
                // 判断项目匹配
                const candidateIsHalf = isHalfEvent(c.event);
                if (candidateIsHalf !== ruleIsHalf) continue;

                // 获取最佳成绩：从 JSON 中解析 netTime
                const pbJson = candidateIsHalf ? c.personal_best_half : c.personal_best_full;
                let timeStr = '';
                if (pbJson && typeof pbJson === 'string') {
                    try {
                        const parsed = JSON.parse(pbJson);
                        timeStr = parsed.netTime || '';
                    } catch {
                        // 兼容旧数据：直接当字符串
                        timeStr = pbJson;
                    }
                } else if (pbJson && typeof pbJson === 'object') {
                    // PG JSONB 自动解析为对象
                    timeStr = pbJson.netTime || '';
                }

                if (!timeStr || timeStr.trim() === '') {
                    noTimeCount++;
                    continue;
                }

                const sec = timeToSeconds(timeStr);
                if (sec >= minSec && sec <= maxSec) {
                    await trx('records')
                        .where({ id: c.id })
                        .update({ audit_status: 'qualified_time' });
                    qualifiedCount++;
                } else {
                    unqualifiedCount++;
                }
            }
        }

        return { qualifiedCount, unqualifiedCount, noTimeCount };
    });
}

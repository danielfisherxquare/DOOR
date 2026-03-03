/**
 * Lottery Repository — 抽签配置、名单、规则、权重 数据访问层
 * 多租户隔离：所有查询必须带 org_id
 */
import knex from '../../db/knex.js';
import {
    raceCapacityMapper,
    lotteryConfigMapper,
    lotteryListMapper,
    lotteryRuleMapper,
    lotteryWeightMapper,
} from '../../db/mappers/lottery.js';

// ═══════════════════════════════════════════════════════════════════════
//  race_capacity
// ═══════════════════════════════════════════════════════════════════════

export async function getRaceCapacity(orgId, raceId) {
    const rows = await knex('race_capacity')
        .where({ org_id: orgId, race_id: raceId })
        .orderBy('event');
    return rows.map(raceCapacityMapper.fromDbRow);
}

export async function saveRaceCapacity(orgId, raceId, data) {
    const row = raceCapacityMapper.toDbInsert({ ...data, raceId }, orgId);
    const [result] = await knex('race_capacity')
        .insert(row)
        .onConflict(['org_id', 'race_id', 'event'])
        .merge({
            target_count: row.target_count,
            draw_ratio: row.draw_ratio,
            reserved_ratio: row.reserved_ratio,
            updated_at: knex.fn.now(),
        })
        .returning('*');
    return raceCapacityMapper.fromDbRow(result);
}

export async function deleteRaceCapacity(orgId, id) {
    const deleted = await knex('race_capacity')
        .where({ org_id: orgId, id })
        .delete();
    return deleted > 0;
}

// ═══════════════════════════════════════════════════════════════════════
//  lottery_configs
// ═══════════════════════════════════════════════════════════════════════

export async function getConfigs(orgId, raceId) {
    const rows = await knex('lottery_configs')
        .where({ org_id: orgId, race_id: raceId })
        .orderBy('id');
    return rows.map(lotteryConfigMapper.fromDbRow);
}

export async function saveConfig(orgId, raceId, data) {
    const row = lotteryConfigMapper.toDbInsert({ ...data, raceId }, orgId);
    const [result] = await knex('lottery_configs')
        .insert(row)
        .returning('*');
    return lotteryConfigMapper.fromDbRow(result);
}

export async function updateConfig(orgId, id, data) {
    const row = lotteryConfigMapper.toDbUpdate(data);
    const [updated] = await knex('lottery_configs')
        .where({ org_id: orgId, id })
        .update(row)
        .returning('*');
    return lotteryConfigMapper.fromDbRow(updated);
}

export async function deleteConfig(orgId, id) {
    const deleted = await knex('lottery_configs')
        .where({ org_id: orgId, id })
        .delete();
    return deleted > 0;
}

// ═══════════════════════════════════════════════════════════════════════
//  lottery_lists
// ═══════════════════════════════════════════════════════════════════════

export async function getLists(orgId, raceId, listType) {
    const query = knex('lottery_lists')
        .where({ org_id: orgId, race_id: raceId });
    if (listType) query.andWhere({ list_type: listType });
    const rows = await query.orderBy('id');
    return rows.map(lotteryListMapper.fromDbRow);
}

export async function saveLists(orgId, entries) {
    if (!entries.length) return [];
    const rows = entries.map(e => lotteryListMapper.toDbInsert(e, orgId));
    const results = await knex('lottery_lists')
        .insert(rows)
        .onConflict(['org_id', 'race_id', 'list_type', 'id_number'])
        .merge()
        .returning('*');
    return results.map(lotteryListMapper.fromDbRow);
}

export async function deleteList(orgId, id) {
    return (await knex('lottery_lists').where({ org_id: orgId, id }).delete()) > 0;
}

export async function deleteLists(orgId, raceId, listType) {
    return knex('lottery_lists')
        .where({ org_id: orgId, race_id: raceId, list_type: listType })
        .delete();
}

export async function bulkAddLists(orgId, entries) {
    if (!entries.length) return { inserted: 0 };
    const rows = entries.map(e => lotteryListMapper.toDbInsert(e, orgId));
    const results = await knex('lottery_lists').insert(rows).returning('id');
    return { inserted: results.length };
}

export async function bulkPutLists(orgId, entries) {
    if (!entries.length) return { upserted: 0 };
    const rows = entries.map(e => lotteryListMapper.toDbInsert(e, orgId));
    const results = await knex('lottery_lists')
        .insert(rows)
        .onConflict(['org_id', 'race_id', 'list_type', 'id_number'])
        .merge()
        .returning('id');
    return { upserted: results.length };
}

export async function bulkDeleteLists(orgId, ids) {
    if (!ids.length) return { deleted: 0 };
    const deleted = await knex('lottery_lists')
        .where({ org_id: orgId })
        .whereIn('id', ids)
        .delete();
    return { deleted };
}

export async function updateList(orgId, id, data) {
    const row = lotteryListMapper.toDbUpdate(data);
    const [updated] = await knex('lottery_lists')
        .where({ org_id: orgId, id })
        .update(row)
        .returning('*');
    return lotteryListMapper.fromDbRow(updated);
}

export async function getConflicts(orgId, raceId) {
    // 在 whitelist 和 blacklist 中同时出现的 id_number
    const rows = await knex('lottery_lists as w')
        .join('lottery_lists as b', function () {
            this.on('w.org_id', '=', 'b.org_id')
                .andOn('w.race_id', '=', 'b.race_id')
                .andOn('w.id_number', '=', 'b.id_number');
        })
        .where({
            'w.org_id': orgId,
            'w.race_id': raceId,
            'w.list_type': 'whitelist',
            'b.list_type': 'blacklist',
        })
        .select('w.id_number', 'w.name');
    return rows;
}

// ═══════════════════════════════════════════════════════════════════════
//  lottery_rules
// ═══════════════════════════════════════════════════════════════════════

export async function getRules(orgId, raceId) {
    const rows = await knex('lottery_rules')
        .where({ org_id: orgId, race_id: raceId })
        .orderBy('id');
    return rows.map(lotteryRuleMapper.fromDbRow);
}

export async function saveRule(orgId, data) {
    const row = lotteryRuleMapper.toDbInsert(data, orgId);
    const [result] = await knex('lottery_rules')
        .insert(row)
        .onConflict(['org_id', 'race_id', 'target_group'])
        .merge({
            target_count: row.target_count,
            draw_ratio: row.draw_ratio,
            reserved_ratio: row.reserved_ratio,
            gender_ratio: row.gender_ratio,
            region_ratio: row.region_ratio,
            updated_at: knex.fn.now(),
        })
        .returning('*');
    return lotteryRuleMapper.fromDbRow(result);
}

// ═══════════════════════════════════════════════════════════════════════
//  lottery_weights
// ═══════════════════════════════════════════════════════════════════════

export async function getWeights(orgId, raceId) {
    const rows = await knex('lottery_weights')
        .where({ org_id: orgId, race_id: raceId })
        .orderBy('priority', 'desc');
    return rows.map(lotteryWeightMapper.fromDbRow);
}

export async function saveWeight(orgId, data) {
    const row = lotteryWeightMapper.toDbInsert(data, orgId);
    const [result] = await knex('lottery_weights')
        .insert(row)
        .onConflict(['org_id', 'race_id', 'target_group', 'weight_type'])
        .merge({
            enabled: row.enabled,
            weight_config: row.weight_config,
            priority: row.priority,
            updated_at: knex.fn.now(),
        })
        .returning('*');
    return lotteryWeightMapper.fromDbRow(result);
}

export async function deleteWeight(orgId, id) {
    return (await knex('lottery_weights').where({ org_id: orgId, id }).delete()) > 0;
}

export async function deleteAllWeights(orgId, raceId) {
    return knex('lottery_weights')
        .where({ org_id: orgId, race_id: raceId })
        .delete();
}

// ═══════════════════════════════════════════════════════════════════════
//  lottery_results（Phase 6）— 聚合统计，非明细行
// ═══════════════════════════════════════════════════════════════════════

export async function getLotteryResults(orgId, raceId) {
    // 总计
    const summary = await knex('lottery_results')
        .where({ org_id: orgId, race_id: raceId })
        .select(
            knex.raw("COUNT(*) FILTER (WHERE result_status = 'winner')::int AS winners"),
            knex.raw("COUNT(*) FILTER (WHERE result_status = 'loser')::int AS losers"),
            knex.raw("COUNT(*) FILTER (WHERE result_status = 'waitlist')::int AS waitlisted"),
            knex.raw('COUNT(*)::int AS total')
        )
        .first();

    // 按 bucket 分组
    const buckets = await knex('lottery_results')
        .where({ org_id: orgId, race_id: raceId })
        .groupBy('bucket_name', 'result_status')
        .select(
            'bucket_name',
            'result_status',
            knex.raw('COUNT(*)::int AS count')
        )
        .orderBy('bucket_name');

    // 整理 bucket breakdown
    const bucketMap = {};
    for (const row of buckets) {
        const b = row.bucket_name || '(未分组)';
        if (!bucketMap[b]) bucketMap[b] = { winners: 0, losers: 0, waitlisted: 0 };
        if (row.result_status === 'winner') bucketMap[b].winners = row.count;
        else if (row.result_status === 'loser') bucketMap[b].losers = row.count;
        else bucketMap[b].waitlisted = row.count;
    }

    return {
        winners: summary?.winners || 0,
        losers: summary?.losers || 0,
        waitlisted: summary?.waitlisted || 0,
        total: summary?.total || 0,
        bucketBreakdown: bucketMap,
    };
}


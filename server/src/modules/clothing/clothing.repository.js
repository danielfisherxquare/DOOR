/**
 * Clothing Repository — 服装库存 数据访问层
 * 多租户隔离：所有查询必须带 org_id
 */
import knex from '../../db/knex.js';
import { clothingLimitMapper } from '../../db/mappers/clothing.js';

export async function getLimits(orgId, raceId) {
    const rows = await knex('clothing_limits')
        .where({ org_id: orgId, race_id: raceId })
        .orderBy(['event', 'gender', 'size']);
    return rows.map(clothingLimitMapper.fromDbRow);
}

export async function saveLimits(orgId, items) {
    if (!items.length) return [];
    const rows = items.map(item => clothingLimitMapper.toDbInsert(item, orgId));

    const results = [];
    for (const row of rows) {
        const [result] = await knex('clothing_limits')
            .insert(row)
            .onConflict(['org_id', 'race_id', 'event', 'gender', 'size'])
            .merge({
                total_inventory: row.total_inventory,
                used_count: row.used_count,
                updated_at: knex.fn.now(),
            })
            .returning('*');
        results.push(clothingLimitMapper.fromDbRow(result));
    }
    return results;
}

export async function saveLimit(orgId, data) {
    const row = clothingLimitMapper.toDbInsert(data, orgId);
    const [result] = await knex('clothing_limits')
        .insert(row)
        .onConflict(['org_id', 'race_id', 'event', 'gender', 'size'])
        .merge({
            total_inventory: row.total_inventory,
            used_count: row.used_count,
            updated_at: knex.fn.now(),
        })
        .returning('*');
    return clothingLimitMapper.fromDbRow(result);
}

/**
 * 增减已用量 — 支持 4 步降级链回退
 * ⚠️ 允许超扣（used_count > total_inventory），不抛异常，记日志警告
 *
 * @param {string} orgId
 * @param {number} raceId
 * @param {string} event
 * @param {string} gender
 * @param {string} size
 * @param {number} delta - 增减量（正数扣减，负数回退）
 * @returns {{ matched: boolean, overstock: boolean }}
 */
export async function incrementUsed(orgId, raceId, event, gender, size, delta = 1) {
    const updated = await knex('clothing_limits')
        .where({ org_id: orgId, race_id: raceId, event, gender, size })
        .increment('used_count', delta);

    if (updated > 0) {
        // 检查是否超扣
        const row = await knex('clothing_limits')
            .where({ org_id: orgId, race_id: raceId, event, gender, size })
            .first();
        const overstock = row && row.used_count > row.total_inventory;
        return { matched: true, overstock };
    }
    return { matched: false, overstock: false };
}

/**
 * 4 步降级链库存扣减（给单个选手）
 * 依次尝试: event:gender:size → event:U:size → ALL:gender:size → ALL:U:size
 *
 * @returns {{ matched: boolean, matchedKey: string|null, overstock: boolean }}
 */
export async function reserveClothingForRunner(orgId, raceId, eventKey, genderKey, sizeKey) {
    const tryKeys = [
        { event: eventKey, gender: genderKey },       // 1. event:gender:size
        { event: eventKey, gender: 'U' },             // 2. event:U:size（男女同款）
        { event: 'ALL', gender: genderKey },       // 3. ALL:gender:size
        { event: 'ALL', gender: 'U' },             // 4. ALL:U:size（全通用）
    ];

    for (const k of tryKeys) {
        const result = await incrementUsed(orgId, raceId, k.event, k.gender, sizeKey);
        if (result.matched) {
            return {
                matched: true,
                matchedKey: `${k.event}:${k.gender}:${sizeKey}`,
                overstock: result.overstock,
            };
        }
    }

    return { matched: false, matchedKey: null, overstock: false };
}

export async function getStatistics(orgId, raceId) {
    const rows = await knex('clothing_limits')
        .where({ org_id: orgId, race_id: raceId })
        .select(
            'event',
            'gender',
            'size',
            'total_inventory',
            'used_count',
            knex.raw('(total_inventory - used_count) AS remaining'),
            knex.raw(`CASE WHEN total_inventory > 0 
                THEN ROUND((used_count::numeric / total_inventory) * 100, 1)
                ELSE 0 END AS usage_pct`)
        )
        .orderBy(['event', 'gender', 'size']);

    const summary = await knex('clothing_limits')
        .where({ org_id: orgId, race_id: raceId })
        .select(
            knex.raw('SUM(total_inventory)::int AS total_inventory'),
            knex.raw('SUM(used_count)::int AS total_used'),
            knex.raw('SUM(total_inventory - used_count)::int AS total_remaining')
        )
        .first();

    return {
        items: rows,
        summary: {
            totalInventory: summary?.total_inventory || 0,
            totalUsed: summary?.total_used || 0,
            totalRemaining: summary?.total_remaining || 0,
        },
    };
}

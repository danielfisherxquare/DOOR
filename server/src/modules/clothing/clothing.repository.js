/**
 * Clothing Repository 鈥?鏈嶈搴撳瓨 鏁版嵁璁块棶灞? * 澶氱鎴烽殧绂伙細鎵€鏈夋煡璇㈠繀椤诲甫 org_id
 */
import knex from '../../db/knex.js';
import { clothingLimitMapper } from '../../db/mappers/clothing.js';
import { normalizeEvent } from '../../utils/event-normalizer.js';

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
 * 澧炲噺宸茬敤閲?鈥?鏀寔 4 姝ラ檷绾ч摼鍥為€€
 * 鈿狅笍 鍏佽瓒呮墸锛坲sed_count > total_inventory锛夛紝涓嶆姏寮傚父锛岃鏃ュ織璀﹀憡
 *
 * @param {string} orgId
 * @param {number} raceId
 * @param {string} event
 * @param {string} gender
 * @param {string} size
 * @param {number} delta - 澧炲噺閲忥紙姝ｆ暟鎵ｅ噺锛岃礋鏁板洖閫€锛? * @returns {{ matched: boolean, overstock: boolean }}
 */
export async function incrementUsed(orgId, raceId, event, gender, size, delta = 1, database = knex) {
    const updated = await database('clothing_limits')
        .where({ org_id: orgId, race_id: raceId, event, gender, size })
        .increment('used_count', delta);

    if (updated > 0) {
        // 妫€鏌ユ槸鍚﹁秴鎵?
        const row = await database('clothing_limits')
            .where({ org_id: orgId, race_id: raceId, event, gender, size })
            .first();
        const overstock = row && row.used_count > row.total_inventory;
        return { matched: true, overstock };
    }
    return { matched: false, overstock: false };
}

/**
 * 4 姝ラ檷绾ч摼搴撳瓨鎵ｅ噺锛堢粰鍗曚釜閫夋墜锛? * 渚濇灏濊瘯: event:gender:size 鈫?event:U:size 鈫?ALL:gender:size 鈫?ALL:U:size
 *
 * @returns {{ matched: boolean, matchedKey: string|null, overstock: boolean }}
 */
export async function reserveClothingForRunner(
    orgId,
    raceId,
    eventKey,
    genderKey,
    sizeKey,
    database = knex,
) {
    const eventCandidates = [...new Set([
        eventKey || 'ALL',
        normalizeEvent(eventKey || '') || eventKey || 'ALL',
    ])];
    const tryKeys = [];

    for (const event of eventCandidates) {
        if (!event || event === 'ALL') continue;
        tryKeys.push(
            { event, gender: genderKey },
            { event, gender: 'U' },
        );
    }

    tryKeys.push(
        { event: 'ALL', gender: genderKey },
        { event: 'ALL', gender: 'U' },
    );

    for (const k of tryKeys) {
        const result = await incrementUsed(orgId, raceId, k.event, k.gender, sizeKey, 1, database);
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
                ELSE 0 END AS usage_pct`),
        )
        .orderBy(['event', 'gender', 'size']);

    const summary = await knex('clothing_limits')
        .where({ org_id: orgId, race_id: raceId })
        .select(
            knex.raw('SUM(total_inventory)::int AS total_inventory'),
            knex.raw('SUM(used_count)::int AS total_used'),
            knex.raw('SUM(total_inventory - used_count)::int AS total_remaining'),
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

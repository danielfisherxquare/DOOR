/**
 * Bib Repository — 排号配置、数据集、批量分配、清空
 *
 * 多租户隔离：所有查询必须带 org_id
 *
 * ⚠️ bulk-assign 分批处理绕过 PG 65535 参数限制
 */
import knex from '../../db/knex.js';
import { bibConfigMapper, bibAssignmentMapper } from '../../db/mappers/bib.js';
import * as snapshotRepo from '../pipeline/snapshot.repository.js';

const BATCH_SIZE = 1000;

// ═══════════════════════════════════════════════════════════════════════
//  Overview
// ═══════════════════════════════════════════════════════════════════════

export async function getOverview(orgId, raceId) {
    const stats = await knex('records')
        .where({ org_id: orgId, race_id: raceId })
        .select(
            knex.raw('COUNT(*)::int AS total'),
            knex.raw("COUNT(*) FILTER (WHERE lottery_status = '中签' OR is_locked = 1)::int AS eligible"),
            knex.raw("COUNT(*) FILTER (WHERE bib_number IS NOT NULL AND bib_number <> '')::int AS assigned")
        )
        .first();

    const byEvent = await knex('records')
        .where({ org_id: orgId, race_id: raceId })
        .whereRaw("(lottery_status = '中签' OR is_locked = 1)")
        .groupBy('event')
        .select(
            'event',
            knex.raw('COUNT(*)::int AS eligible'),
            knex.raw("COUNT(*) FILTER (WHERE bib_number IS NOT NULL AND bib_number <> '')::int AS assigned")
        )
        .orderBy('event');

    return {
        total: stats?.total || 0,
        eligible: stats?.eligible || 0,
        assigned: stats?.assigned || 0,
        byEvent,
    };
}

// ═══════════════════════════════════════════════════════════════════════
//  bib_numbering_configs CRUD
// ═══════════════════════════════════════════════════════════════════════

export async function getTemplates(orgId, raceId) {
    const rows = await knex('bib_numbering_configs')
        .where({ org_id: orgId, race_id: raceId })
        .orderBy('event');
    return rows.map(bibConfigMapper.fromDbRow);
}

export async function upsertTemplate(orgId, data) {
    const row = bibConfigMapper.toDbInsert(data, orgId);
    const [result] = await knex('bib_numbering_configs')
        .insert(row)
        .onConflict(['org_id', 'race_id', 'event'])
        .merge({
            prefix: row.prefix,
            start_number: row.start_number,
            end_number: row.end_number,
            padding: row.padding,
            updated_at: knex.fn.now(),
        })
        .returning('*');
    return bibConfigMapper.fromDbRow(result);
}

export async function deleteTemplate(orgId, templateId) {
    return knex('bib_numbering_configs')
        .where({ id: templateId, org_id: orgId })
        .del();
}

// ═══════════════════════════════════════════════════════════════════════
//  Dataset
// ═══════════════════════════════════════════════════════════════════════

export async function getDataset(orgId, raceId) {
    return knex('records')
        .where({ org_id: orgId, race_id: raceId })
        .whereRaw("(lottery_status = '中签' OR is_locked = 1)")
        .select(
            'id', 'name', 'event', 'gender',
            'bib_number', 'bag_window_no', 'bag_no',
            'expo_window_no', 'bib_color',
            'clothing_size', 'runner_category'
        )
        .orderBy('id');
}

export async function getExecutionDataset(orgId, raceId) {
    // 1. 查询可参与排号的记录，必须包含排号引擎所需的全部驼峰命名关键字段
    const eligibleRecords = await knex('records')
        .where({ org_id: orgId, race_id: raceId })
        .whereRaw("(lottery_status = '中签' OR is_locked = 1)")
        .select(
            'id', 'name', 'event', 'gender',
            'bib_number AS bibNumber',
            'bag_window_no AS bagWindowNo',
            'bag_no AS bagNo',
            'expo_window_no AS expoWindowNo',
            'bib_color AS bibColor',
            'runner_category AS runnerCategory',
            'lottery_status AS lotteryStatus',
            'lottery_zone AS lotteryZone',
            'personal_best_full AS personalBestFull',
            'personal_best_half AS personalBestHalf',
            'id_number AS idNumber',
            '_imported_at AS _importedAt'
        )
        .orderBy('id', 'asc');

    // 2. 查询不参与排号的记录 ID（用于清理原有已被排号的数据）
    const skippedRows = await knex('records')
        .where({ org_id: orgId, race_id: raceId })
        .whereRaw("NOT (lottery_status = '中签' OR is_locked = 1)")
        .whereRaw("(bib_number IS NOT NULL AND bib_number <> '')")
        .select('id');
    const skippedIds = skippedRows.map(r => r.id);

    // 3. 统计各 lottery_status 的数量分布（用于前端展示汇总信息）
    const statusSummary = await knex('records')
        .where({ org_id: orgId, race_id: raceId })
        .select(knex.raw("COALESCE(NULLIF(lottery_status, ''), '空状态') AS status"))
        .count('* as count')
        .groupBy(knex.raw("COALESCE(NULLIF(lottery_status, ''), '空状态')"))
        .orderBy('count', 'desc');

    return {
        eligibleRecords,
        skippedIds,
        eligibleCount: eligibleRecords.length,
        statusSummary: statusSummary.map(r => ({
            status: r.status,
            count: Number(r.count),
        })),
    };
}

// ═══════════════════════════════════════════════════════════════════════
//  Snapshot
// ═══════════════════════════════════════════════════════════════════════

export async function createBibSnapshot(orgId, raceId) {
    // 防重检查
    const running = await knex('pipeline_executions')
        .where({ org_id: orgId, race_id: raceId, execution_type: 'bib_numbering', status: 'running' })
        .first();
    if (running) {
        throw Object.assign(
            new Error(`存在正在执行的 bib_numbering 任务 (id=${running.id})`),
            { code: 'CONCURRENT_EXECUTION', statusCode: 409 }
        );
    }

    return snapshotRepo.createSnapshot(orgId, raceId, 'pre_bib', {
        createdBy: 'bib:snapshot',
    });
}

export async function hasBibSnapshot(orgId, raceId) {
    return snapshotRepo.hasSnapshot(orgId, raceId, 'pre_bib');
}

// ═══════════════════════════════════════════════════════════════════════
//  Bulk Assign — 分批处理
// ═══════════════════════════════════════════════════════════════════════

/**
 * 批量写入排号结果
 * @param {string} orgId
 * @param {number} raceId
 * @param {Array<{recordId, bibNumber, bagWindowNo?, bagNo?, expoWindowNo?, bibColor?}>} assignments
 */
export async function bulkAssign(orgId, raceId, assignments) {
    if (!assignments.length) return { updated: 0 };

    // 防重检查
    const running = await knex('pipeline_executions')
        .where({ org_id: orgId, race_id: raceId, execution_type: 'bib_numbering', status: 'running' })
        .first();
    if (running) {
        throw Object.assign(
            new Error(`存在正在执行的 bib_numbering 任务 (id=${running.id})`),
            { code: 'CONCURRENT_EXECUTION', statusCode: 409 }
        );
    }

    // 写执行日志
    const [exec] = await knex('pipeline_executions')
        .insert({
            org_id: orgId,
            race_id: raceId,
            execution_type: 'bib_numbering',
            status: 'running',
        })
        .returning('id');
    const execId = typeof exec === 'object' ? exec.id : exec;

    try {
        let updated = 0;

        // 分批更新 records
        for (let i = 0; i < assignments.length; i += BATCH_SIZE) {
            const batch = assignments.slice(i, i + BATCH_SIZE);

            // 构建 VALUES 列表，用 UPDATE FROM 方案绕过参数限制
            const values = batch.map((a) =>
                `(${a.recordId}, '${(a.bibNumber || '').replace(/'/g, "''")}', '${(a.bagWindowNo || '').replace(/'/g, "''")}', '${(a.bagNo || '').replace(/'/g, "''")}', '${(a.expoWindowNo || '').replace(/'/g, "''")}', '${(a.bibColor || '').replace(/'/g, "''")}')`
            ).join(',\n');

            const result = await knex.raw(`
                UPDATE records AS r
                SET bib_number = v.bib_number,
                    bag_window_no = v.bag_window_no,
                    bag_no = v.bag_no,
                    expo_window_no = v.expo_window_no,
                    bib_color = v.bib_color
                FROM (VALUES ${values})
                    AS v(record_id, bib_number, bag_window_no, bag_no, expo_window_no, bib_color)
                WHERE r.id = v.record_id::int
                  AND r.org_id = ?
                  AND r.race_id = ?
            `, [orgId, raceId]);

            updated += result.rowCount || batch.length;
        }

        // 分批 UPSERT bib_assignments
        for (let i = 0; i < assignments.length; i += BATCH_SIZE) {
            const batch = assignments.slice(i, i + BATCH_SIZE)
                .filter(a => a.bibNumber)
                .map(a => ({
                    org_id: orgId,
                    race_id: raceId,
                    record_id: a.recordId,
                    bib_number: a.bibNumber,
                }));

            if (batch.length > 0) {
                await knex('bib_assignments')
                    .insert(batch)
                    .onConflict(['org_id', 'race_id', 'record_id'])
                    .merge({ bib_number: knex.raw('EXCLUDED.bib_number') });
            }
        }

        // 更新执行日志
        await knex('pipeline_executions')
            .where({ id: execId })
            .update({
                status: 'succeeded',
                result: JSON.stringify({ updated }),
                completed_at: new Date(),
            });

        return { updated };

    } catch (err) {
        await knex('pipeline_executions')
            .where({ id: execId })
            .update({
                status: 'failed',
                error: err.message,
                completed_at: new Date(),
            });
        throw err;
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  Clear — 一键清空
// ═══════════════════════════════════════════════════════════════════════

export async function clearBib(orgId, raceId) {
    return knex.transaction(async (trx) => {
        const updated = await trx('records')
            .where({ org_id: orgId, race_id: raceId })
            .update({
                bib_number: null,
                bag_window_no: null,
                bag_no: null,
                expo_window_no: null,
                bib_color: null,
            });

        const deleted = await trx('bib_assignments')
            .where({ org_id: orgId, race_id: raceId })
            .del();

        return { cleared: updated, assignmentsDeleted: deleted };
    });
}

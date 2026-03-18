import knex from '../../db/knex.js';
import { bibConfigMapper, bibAssignmentMapper } from '../../db/mappers/bib.js';
import * as snapshotRepo from '../pipeline/snapshot.repository.js';
import { decryptField } from '../../utils/crypto.js';

const BATCH_SIZE = 1000;
const DEFAULT_EVENT_LABEL = '\u672a\u5206\u9879\u76ee';
const EMPTY_STATUS_LABEL = '\u7a7a\u72b6\u6001';
const BIB_ELIGIBLE_STATUS_LIST = [
    '\u4e2d\u7b7e',
    '\u5df2\u4e2d\u7b7e',
    '\u76f4\u901a\u540d\u989d',
    '\u76f4\u901a',
];
const BIB_ELIGIBLE_CONDITION = `(lottery_status IN (${BIB_ELIGIBLE_STATUS_LIST.map(status => `'${status}'`).join(', ')}) OR is_locked = 1)`;
const NON_S_ZONE_CONDITION = "UPPER(TRIM(COALESCE(lottery_zone, ''))) <> 'S'";
const EVENT_LABEL_SQL = `COALESCE(NULLIF(TRIM(event), ''), '${DEFAULT_EVENT_LABEL}')`;

function recordsForRace(orgId, raceId) {
    return knex('records').where({ org_id: orgId, race_id: raceId });
}

export async function getOverview(orgId, raceId) {
    const [
        totalRow,
        eligibleRow,
        assignedRow,
        eligibleByEventRows,
        eligibleByEventExcludingSRows,
        latestAssignedRows,
    ] = await Promise.all([
        recordsForRace(orgId, raceId).count('* as total').first(),
        recordsForRace(orgId, raceId).whereRaw(BIB_ELIGIBLE_CONDITION).count('* as eligible').first(),
        recordsForRace(orgId, raceId).whereRaw("TRIM(COALESCE(bib_number, '')) <> ''").count('* as assigned').first(),
        recordsForRace(orgId, raceId)
            .whereRaw(BIB_ELIGIBLE_CONDITION)
            .select(knex.raw(`${EVENT_LABEL_SQL} AS event`))
            .count('* as count')
            .groupByRaw(EVENT_LABEL_SQL)
            .orderBy([{ column: 'count', order: 'desc' }, { column: 'event', order: 'asc' }]),
        recordsForRace(orgId, raceId)
            .whereRaw(BIB_ELIGIBLE_CONDITION)
            .whereRaw(NON_S_ZONE_CONDITION)
            .select(knex.raw(`${EVENT_LABEL_SQL} AS event`))
            .count('* as count')
            .groupByRaw(EVENT_LABEL_SQL)
            .orderBy([{ column: 'count', order: 'desc' }, { column: 'event', order: 'asc' }]),
        recordsForRace(orgId, raceId)
            .whereRaw("TRIM(COALESCE(bib_number, '')) <> ''")
            .select('id', 'name', knex.raw('bib_number AS "bibNumber"'))
            .orderBy('id', 'desc')
            .limit(8),
    ]);

    return {
        total: Number(totalRow?.total || 0),
        eligible: Number(eligibleRow?.eligible || 0),
        assigned: Number(assignedRow?.assigned || 0),
        eligibleByEvent: eligibleByEventRows.map(row => ({
            event: String(row.event || DEFAULT_EVENT_LABEL),
            count: Number(row.count || 0),
        })),
        eligibleByEventExcludingS: eligibleByEventExcludingSRows.map(row => ({
            event: String(row.event || DEFAULT_EVENT_LABEL),
            count: Number(row.count || 0),
        })),
        latestAssigned: latestAssignedRows.map(row => ({
            id: Number(row.id || 0),
            name: String(row.name || ''),
            bibNumber: String(row.bibNumber || ''),
        })),
    };
}

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

export async function getDataset(orgId, raceId) {
    return recordsForRace(orgId, raceId)
        .whereRaw(BIB_ELIGIBLE_CONDITION)
        .select(
            'id', 'name', 'event', 'gender',
            'bib_number', 'bag_window_no', 'bag_no',
            'expo_window_no', 'bib_color',
            'clothing_size', 'runner_category',
        )
        .orderBy('id');
}

export async function getExecutionDataset(orgId, raceId) {
    const eligibleRecords = await recordsForRace(orgId, raceId)
        .whereRaw(BIB_ELIGIBLE_CONDITION)
        .whereRaw(NON_S_ZONE_CONDITION)
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
            '_imported_at AS _importedAt',
        )
        .orderBy('id', 'asc');

    const skippedRows = await recordsForRace(orgId, raceId)
        .whereRaw(`(NOT ${BIB_ELIGIBLE_CONDITION} OR NOT (${NON_S_ZONE_CONDITION}))`)
        .whereNotNull('id')
        .select('id');

    // 🔐 解密 id_number 字段
    for (const record of eligibleRecords) {
        if (record.idNumber) {
            record.idNumber = decryptField(record.idNumber, {
                tableName: 'records',
                columnName: 'id_number',
            }) || '';
        }
    }

    const statusSummary = await recordsForRace(orgId, raceId)
        .select(knex.raw(`COALESCE(NULLIF(TRIM(lottery_status), ''), '${EMPTY_STATUS_LABEL}') AS status`))
        .count('* as count')
        .groupBy(knex.raw(`COALESCE(NULLIF(TRIM(lottery_status), ''), '${EMPTY_STATUS_LABEL}')`))
        .orderBy([{ column: 'count', order: 'desc' }, { column: 'status', order: 'asc' }]);

    return {
        eligibleRecords,
        skippedIds: skippedRows.map(row => row.id),
        eligibleCount: eligibleRecords.length,
        statusSummary: statusSummary.map(row => ({
            status: row.status,
            count: Number(row.count),
        })),
    };
}

export async function createBibSnapshot(orgId, raceId) {
    const running = await knex('pipeline_executions')
        .where({ org_id: orgId, race_id: raceId, execution_type: 'bib_numbering', status: 'running' })
        .first();
    if (running) {
        throw Object.assign(
            new Error(`existing bib_numbering execution is running (id=${running.id})`),
            { code: 'CONCURRENT_EXECUTION', statusCode: 409 },
        );
    }

    return snapshotRepo.createSnapshot(orgId, raceId, 'pre_bib', {
        createdBy: 'bib:snapshot',
    });
}

export async function hasBibSnapshot(orgId, raceId) {
    return snapshotRepo.hasSnapshot(orgId, raceId, 'pre_bib');
}

/**
 * @param {string} orgId
 * @param {number} raceId
 * @param {Array<{recordId, bibNumber, bagWindowNo?, bagNo?, expoWindowNo?, bibColor?}>} assignments
 */
export async function bulkAssign(orgId, raceId, assignments) {
    if (!assignments.length) return { updated: 0 };

    const normalizedAssignments = assignments.map((assignment) => ({
        recordId: Number(assignment.recordId),
        bibNumber: String(assignment.bibNumber || '').trim(),
        bagWindowNo: String(assignment.bagWindowNo || '').trim(),
        bagNo: String(assignment.bagNo || '').trim(),
        expoWindowNo: String(assignment.expoWindowNo || '').trim(),
        bibColor: String(assignment.bibColor || '').trim(),
    })).filter((assignment) => Number.isFinite(assignment.recordId) && assignment.recordId > 0);
    if (!normalizedAssignments.length) return { updated: 0 };

    const duplicateBibMap = new Map();
    for (const assignment of normalizedAssignments) {
        if (!assignment.bibNumber) continue;
        const owners = duplicateBibMap.get(assignment.bibNumber) || [];
        owners.push(assignment.recordId);
        duplicateBibMap.set(assignment.bibNumber, owners);
    }
    const duplicateBibEntry = Array.from(duplicateBibMap.entries()).find(([, owners]) => owners.length > 1);
    if (duplicateBibEntry) {
        const [bibNumber, owners] = duplicateBibEntry;
        throw Object.assign(
            new Error(`排号结果存在重复 bib 号: ${bibNumber}（records: ${owners.join(', ')}）`),
            { status: 400, expose: true },
        );
    }

    const running = await knex('pipeline_executions')
        .where({ org_id: orgId, race_id: raceId, execution_type: 'bib_numbering', status: 'running' })
        .first();
    if (running) {
        throw Object.assign(
            new Error(`existing bib_numbering execution is running (id=${running.id})`),
            { code: 'CONCURRENT_EXECUTION', statusCode: 409 },
        );
    }

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
        const updated = await knex.transaction(async (trx) => {
            let updatedCount = 0;

            for (let i = 0; i < normalizedAssignments.length; i += BATCH_SIZE) {
                const batch = normalizedAssignments.slice(i, i + BATCH_SIZE);

                // Use UNNEST with parameterized arrays for safe bulk update
                const recordIds = batch.map(a => a.recordId);
                const bibNumbers = batch.map(a => a.bibNumber);
                const bagWindowNos = batch.map(a => a.bagWindowNo);
                const bagNos = batch.map(a => a.bagNo);
                const expoWindowNos = batch.map(a => a.expoWindowNo);
                const bibColors = batch.map(a => a.bibColor);

                const result = await trx.raw(`
                    UPDATE records AS r
                    SET bib_number = v.bib_number,
                        bag_window_no = v.bag_window_no,
                        bag_no = v.bag_no,
                        expo_window_no = v.expo_window_no,
                        bib_color = v.bib_color
                    FROM UNNEST(
                        ?::int[],
                        ?::text[],
                        ?::text[],
                        ?::text[],
                        ?::text[],
                        ?::text[]
                    ) AS v(record_id, bib_number, bag_window_no, bag_no, expo_window_no, bib_color)
                    WHERE r.id = v.record_id
                      AND r.org_id = ?
                      AND r.race_id = ?
                `, [recordIds, bibNumbers, bagWindowNos, bagNos, expoWindowNos, bibColors, orgId, raceId]);

                updatedCount += result.rowCount || batch.length;
            }

            for (let i = 0; i < normalizedAssignments.length; i += BATCH_SIZE) {
                const recordIds = normalizedAssignments
                    .slice(i, i + BATCH_SIZE)
                    .map((assignment) => assignment.recordId);
                await trx('bib_assignments')
                    .where({ org_id: orgId, race_id: raceId })
                    .whereIn('record_id', recordIds)
                    .del();
            }

            for (let i = 0; i < normalizedAssignments.length; i += BATCH_SIZE) {
                const batch = normalizedAssignments.slice(i, i + BATCH_SIZE)
                    .filter((assignment) => assignment.bibNumber)
                    .map((assignment) => ({
                        org_id: orgId,
                        race_id: raceId,
                        record_id: assignment.recordId,
                        bib_number: assignment.bibNumber,
                    }));

                if (batch.length > 0) {
                    await trx('bib_assignments').insert(batch);
                }
            }

            return updatedCount;
        });

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

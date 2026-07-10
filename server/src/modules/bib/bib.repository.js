import knex from '../../db/knex.js';
import { bibConfigMapper } from '../../db/mappers/bib.js';
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

function recordsForRace(orgId, raceId, database = knex) {
    return database('records').where({ org_id: orgId, race_id: raceId });
}

export async function lockRaceScope(orgId, raceId, database) {
    const row = await database('races')
        .where({ id: raceId, org_id: orgId })
        .forUpdate()
        .first('id');
    if (!row) {
        throw Object.assign(new Error('赛事不存在或不可访问'), {
            status: 404,
            code: 'BIB_RACE_NOT_FOUND',
            expose: true,
        });
    }
    return { id: Number(row.id) };
}

export async function assertNoActiveExecution(orgId, raceId, database = knex) {
    const running = await database('pipeline_executions')
        .where({ org_id: orgId, race_id: raceId, status: 'running' })
        .whereIn('execution_type', ['bib_numbering', 'rollback_bib'])
        .first('id', 'execution_type');
    if (running) {
        throw Object.assign(
            new Error(`存在正在执行的 ${running.execution_type} 任务 (id=${running.id})`),
            { status: 409, code: 'CONCURRENT_EXECUTION', expose: true },
        );
    }
}

export async function findTemplateScope(authenticatedOrgId, templateId, database = knex) {
    const query = database('bib_numbering_configs').where({ id: templateId });
    if (authenticatedOrgId) query.andWhere({ org_id: authenticatedOrgId });
    const row = await query.first('id', 'race_id');
    return row ? { id: Number(row.id), raceId: Number(row.race_id) } : null;
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

export async function upsertTemplate(orgId, data, database = knex) {
    const row = bibConfigMapper.toDbInsert(data, orgId);
    const [result] = await database('bib_numbering_configs')
        .insert(row)
        .onConflict(['org_id', 'race_id', 'event'])
        .merge({
            prefix: row.prefix,
            start_number: row.start_number,
            end_number: row.end_number,
            padding: row.padding,
            updated_at: database.fn.now(),
        })
        .returning('*');
    return bibConfigMapper.fromDbRow(result);
}

export async function deleteTemplate(orgId, templateId, database = knex) {
    return database('bib_numbering_configs')
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

    // 🔐 解密 id_number 字段（需要传入 orgId 和 raceId 作为 AAD 上下文）
    for (const record of eligibleRecords) {
        if (record.idNumber) {
            record.idNumber = decryptField(record.idNumber, {
                tableName: 'records',
                columnName: 'id_number',
                orgId,
                raceId,
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

export async function lockAssignmentRecords(orgId, raceId, recordIds, database = knex) {
    const rows = await database('records')
        .where({ org_id: orgId, race_id: raceId })
        .whereIn('id', recordIds)
        .forUpdate()
        .select('id');
    return rows.map((row) => Number(row.id));
}

export async function createExecution(orgId, raceId, database = knex) {
    const [exec] = await database('pipeline_executions')
        .insert({
            org_id: orgId,
            race_id: raceId,
            execution_type: 'bib_numbering',
            status: 'running',
        })
        .returning('id');
    return typeof exec === 'object' ? exec.id : exec;
}

export async function applyAssignments(orgId, raceId, assignments, database = knex) {
    let updatedCount = 0;
    for (let i = 0; i < assignments.length; i += BATCH_SIZE) {
        const batch = assignments.slice(i, i + BATCH_SIZE);
        const recordIds = batch.map((assignment) => assignment.recordId);
        const bibNumbers = batch.map((assignment) => assignment.bibNumber);
        const bagWindowNos = batch.map((assignment) => assignment.bagWindowNo);
        const bagNos = batch.map((assignment) => assignment.bagNo);
        const expoWindowNos = batch.map((assignment) => assignment.expoWindowNo);
        const bibColors = batch.map((assignment) => assignment.bibColor);

        const result = await database.raw(`
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
        updatedCount += Number(result.rowCount ?? 0);
    }

    for (let i = 0; i < assignments.length; i += BATCH_SIZE) {
        const recordIds = assignments.slice(i, i + BATCH_SIZE).map((assignment) => assignment.recordId);
        await database('bib_assignments')
            .where({ org_id: orgId, race_id: raceId })
            .whereIn('record_id', recordIds)
            .del();
    }

    for (let i = 0; i < assignments.length; i += BATCH_SIZE) {
        const batch = assignments.slice(i, i + BATCH_SIZE)
            .filter((assignment) => assignment.bibNumber)
            .map((assignment) => ({
                org_id: orgId,
                race_id: raceId,
                record_id: assignment.recordId,
                bib_number: assignment.bibNumber,
            }));
        if (batch.length > 0) await database('bib_assignments').insert(batch);
    }

    return updatedCount;
}

export async function completeExecution(orgId, raceId, executionId, updated, database = knex) {
    return database('pipeline_executions')
        .where({ id: executionId, org_id: orgId, race_id: raceId })
        .update({
            status: 'succeeded',
            result: JSON.stringify({ updated }),
            completed_at: new Date(),
        });
}

export async function clearBib(orgId, raceId, database = knex) {
    const updated = await database('records')
        .where({ org_id: orgId, race_id: raceId })
        .update({
            bib_number: null,
            bag_window_no: null,
            bag_no: null,
            expo_window_no: null,
            bib_color: null,
        });

    const deleted = await database('bib_assignments')
        .where({ org_id: orgId, race_id: raceId })
        .del();

    return { cleared: updated, assignmentsDeleted: deleted };
}

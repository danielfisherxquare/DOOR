import knex from '../../db/knex.js';

function isMissingUpdatedAtColumnError(err) {
    return err?.code === '42703' && String(err.message || '').includes('updated_at');
}

function isMissingLatestStatusAtColumnError(err) {
    return err?.code === '42703' && String(err.message || '').includes('latest_status_at');
}

function stripCompatibilityColumns(payload, err) {
    const fallbackPayload = { ...payload };

    if (isMissingUpdatedAtColumnError(err)) {
        delete fallbackPayload.updated_at;
    }
    if (isMissingLatestStatusAtColumnError(err)) {
        delete fallbackPayload.latest_status_at;
    }

    return fallbackPayload;
}

function latestStatusAtFallback(alias = 'bti') {
    return knex.raw(`
        COALESCE(
            ${alias}.latest_status_at,
            GREATEST(
                COALESCE(${alias}.receipt_printed_at, ${alias}.created_at),
                COALESCE(${alias}.picked_up_at, ${alias}.created_at),
                COALESCE(${alias}.checked_in_at, ${alias}.created_at),
                COALESCE(${alias}.finished_at, ${alias}.created_at),
                COALESCE(${alias}.last_scan_at, ${alias}.created_at),
                ${alias}.created_at
            )
        )
    `);
}

function baseItemScope(orgId) {
    return knex('bib_tracking_items as bti')
        .modify((qb) => {
            if (orgId) qb.where('bti.org_id', orgId);
        });
}

function activeItemScope(orgId) {
    return baseItemScope(orgId).whereNull('bti.invalidated_at');
}

function applyKeywordFilter(base, keyword, useStoredSearchDocument = true) {
    if (!keyword?.trim()) {
        return;
    }

    const term = keyword.trim();
    const likeTerm = `%${term}%`;
    base.andWhere((qb) => {
        qb.whereILike('bti.bib_number', likeTerm);
        if (useStoredSearchDocument) {
            qb.orWhereRaw(
                `
                    r.search_document @@ plainto_tsquery('simple', ?)
                `,
                [term],
            );
            return;
        }

        qb.orWhereRaw(
            `
                to_tsvector(
                    'simple',
                    coalesce(r.name, '') || ' ' || coalesce(r.id_number, '') || ' ' || coalesce(r.phone, '')
                ) @@ plainto_tsquery('simple', ?)
            `,
            [term],
        );
    });
}

function buildListItemsBase(orgId, raceId, status, keyword, useStoredSearchDocument = true) {
    const base = activeItemScope(orgId)
        .leftJoin('records as r', 'r.id', 'bti.record_id')
        .where('bti.race_id', raceId);

    if (status) {
        base.where('bti.status', status);
    }

    applyKeywordFilter(base, keyword, useStoredSearchDocument);
    return base;
}

export async function findByRecordIds(knexOrTrx, { orgId, raceId, recordIds }) {
    if (!Array.isArray(recordIds) || recordIds.length === 0) return [];

    return knexOrTrx('bib_tracking_items')
        .where({
            org_id: orgId,
            race_id: raceId,
        })
        .whereIn('record_id', recordIds)
        .select('*');
}

export async function findByBibNumbers(knexOrTrx, { orgId, raceId, bibNumbers }) {
    if (!Array.isArray(bibNumbers) || bibNumbers.length === 0) return [];

    return knexOrTrx('bib_tracking_items')
        .where({
            org_id: orgId,
            race_id: raceId,
        })
        .whereIn('bib_number', bibNumbers)
        .select('*');
}

export async function findActiveByRecord(trx, { orgId, raceId, recordId }) {
    return trx('bib_tracking_items')
        .where({
            org_id: orgId,
            race_id: raceId,
            record_id: recordId,
        })
        .whereNull('invalidated_at')
        .first();
}

export async function findByRecordForUpdate(trx, { orgId, raceId, recordId }) {
    return trx('bib_tracking_items')
        .where({
            org_id: orgId,
            race_id: raceId,
            record_id: recordId,
        })
        .forUpdate()
        .first();
}

export async function findByBibNumberForUpdate(trx, { orgId, raceId, bibNumber }) {
    return trx('bib_tracking_items')
        .where({
            org_id: orgId,
            race_id: raceId,
            bib_number: bibNumber,
        })
        .forUpdate()
        .first();
}

export async function insertItem(trx, payload) {
    try {
        const [row] = await trx('bib_tracking_items').insert(payload).returning('*');
        return row;
    } catch (err) {
        if (!isMissingLatestStatusAtColumnError(err)) {
            throw err;
        }

        const fallbackPayload = stripCompatibilityColumns(payload, err);
        const [row] = await trx('bib_tracking_items').insert(fallbackPayload).returning('*');
        return row;
    }
}

export async function updateItemById(trx, id, patch) {
    const payload = {
        ...patch,
        updated_at: trx.fn.now(),
    };

    try {
        const [row] = await trx('bib_tracking_items')
            .where({ id })
            .update(payload)
            .returning('*');
        return row;
    } catch (err) {
        // Compatibility fallback for environments where old bib_tracking tables
        // were created without the audit column. A repair migration will add it.
        if (!isMissingUpdatedAtColumnError(err) && !isMissingLatestStatusAtColumnError(err)) {
            throw err;
        }

        const fallbackPayload = stripCompatibilityColumns(payload, err);
        const [row] = await trx('bib_tracking_items')
            .where({ id })
            .update(fallbackPayload)
            .returning('*');
        return row;
    }
}

export async function insertEvent(trx, payload) {
    const [row] = await trx('bib_tracking_events').insert(payload).returning('*');
    return row;
}

export async function findActiveByToken(qrToken) {
    return activeItemScope(null)
        .leftJoin('records as r', 'r.id', 'bti.record_id')
        .select(
            'bti.*',
            'r.name',
        )
        .where('bti.qr_token', qrToken)
        .first();
}

export async function findByToken(qrToken) {
    return baseItemScope(null)
        .leftJoin('records as r', 'r.id', 'bti.record_id')
        .select(
            'bti.*',
            'r.name',
        )
        .where('bti.qr_token', qrToken)
        .first();
}

export async function findTokenSummary(qrToken) {
    return knex('bib_tracking_items as bti')
        .select(
            'bti.id',
            'bti.org_id',
            'bti.race_id',
            'bti.record_id',
            'bti.bib_number',
            'bti.status',
            'bti.invalidated_at',
        )
        .where('bti.qr_token', qrToken)
        .first();
}

export async function findActiveByTokenForUpdate(trx, qrToken) {
    return trx('bib_tracking_items as bti')
        .select('bti.*')
        .where('bti.qr_token', qrToken)
        .whereNull('bti.invalidated_at')
        .forUpdate()
        .first();
}

export async function findActiveByBibNumberForUpdate(trx, { orgId, raceId, bibNumber }) {
    return trx('bib_tracking_items')
        .where({
            org_id: orgId,
            race_id: raceId,
            bib_number: bibNumber,
        })
        .whereNull('invalidated_at')
        .forUpdate()
        .first();
}

export async function listItems(orgId, raceId, { status, keyword, page = 1, limit = 50 } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));

    async function runListQuery(useStoredSearchDocument) {
        const base = buildListItemsBase(orgId, raceId, status, keyword, useStoredSearchDocument);
        const [{ count }] = await base.clone().count('* as count');
        const rows = await base
            .select(
                'bti.id as item_id',
                'bti.record_id',
                'r.name',
                'r.phone',
                'r.id_number',
                'bti.bib_number',
                'bti.status',
                'bti.qr_version',
                'bti.invalidated_at',
                'bti.receipt_printed_at',
                'bti.picked_up_at',
                'bti.checked_in_at',
                'bti.finished_at',
                'bti.last_scan_at',
                { latest_status_at: latestStatusAtFallback('bti') },
            )
            .orderBy('latest_status_at', 'desc')
            .orderBy('bti.id', 'desc')
            .offset((safePage - 1) * safeLimit)
            .limit(safeLimit);

        return {
            total: Number(count || 0),
            page: safePage,
            limit: safeLimit,
            items: rows,
        };
    }

    try {
        return await runListQuery(true);
    } catch (err) {
        if (!(err?.code === '42703' && String(err.message || '').includes('search_document'))) {
            throw err;
        }
        return runListQuery(false);
    }
}

export async function getItemDetail(orgId, raceId, itemId) {
    return activeItemScope(orgId)
        .leftJoin('records as r', 'r.id', 'bti.record_id')
        .leftJoin('races as race', 'race.id', 'bti.race_id')
        .leftJoin('users as scanner', 'scanner.id', 'bti.last_scan_by')
        .where('bti.race_id', raceId)
        .andWhere('bti.id', itemId)
        .select(
            'bti.id as item_id',
            'bti.race_id',
            'race.name as race_name',
            'bti.record_id',
            'r.name',
            'r.phone',
            'r.id_number',
            'bti.bib_number',
            'bti.status',
            'bti.qr_version',
            'bti.invalidated_at',
            'bti.receipt_printed_at',
            'bti.picked_up_at',
            'bti.checked_in_at',
            'bti.finished_at',
            'bti.last_scan_at',
            'bti.last_scan_by',
            'scanner.username as last_scan_by_name',
            { latest_status_at: latestStatusAtFallback('bti') },
        )
        .first();
}

export async function listItemTimeline(itemId) {
    return knex('bib_tracking_events as bte')
        .leftJoin('users as u', 'u.id', 'bte.operator_user_id')
        .where('bte.tracking_item_id', itemId)
        .select(
            'bte.id',
            'bte.event_type',
            'bte.from_status',
            'bte.to_status',
            'bte.source',
            'bte.created_at',
            'bte.operator_user_id',
            'u.username as operator_name',
        )
        .orderBy('bte.created_at', 'desc')
        .orderBy('bte.id', 'desc');
}

export async function getStats(orgId, raceId) {
    const tracked = await activeItemScope(orgId)
        .where('bti.race_id', raceId)
        .select('bti.status')
        .count('* as count')
        .groupBy('bti.status');

    const counts = {
        receiptPrinted: 0,
        pickedUp: 0,
        checkedIn: 0,
        finished: 0,
        totalTracked: 0,
    };

    for (const row of tracked) {
        const count = Number(row.count || 0);
        counts.totalTracked += count;
        if (row.status === 'receipt_printed') counts.receiptPrinted = count;
        if (row.status === 'picked_up') counts.pickedUp = count;
        if (row.status === 'checked_in') counts.checkedIn = count;
        if (row.status === 'finished') counts.finished = count;
    }

    return counts;
}

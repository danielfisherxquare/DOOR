import knex from '../../db/knex.js';

function baseItemScope(orgId) {
    return knex('bib_tracking_items as bti')
        .modify((qb) => {
            if (orgId) qb.where('bti.org_id', orgId);
        });
}

function activeItemScope(orgId) {
    return baseItemScope(orgId).whereNull('bti.invalidated_at');
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

export async function insertItem(trx, payload) {
    const [row] = await trx('bib_tracking_items').insert(payload).returning('*');
    return row;
}

export async function updateItemById(trx, id, patch) {
    const [row] = await trx('bib_tracking_items')
        .where({ id })
        .update({
            ...patch,
            updated_at: trx.fn.now(),
        })
        .returning('*');
    return row;
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

export async function findActiveByTokenForUpdate(trx, qrToken) {
    return trx('bib_tracking_items as bti')
        .leftJoin('records as r', 'r.id', 'bti.record_id')
        .select(
            'bti.*',
            'r.name',
        )
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

    const base = activeItemScope(orgId)
        .leftJoin('records as r', 'r.id', 'bti.record_id')
        .where('bti.race_id', raceId);

    if (status) {
        base.where('bti.status', status);
    }

    if (keyword?.trim()) {
        const term = `%${keyword.trim()}%`;
        base.andWhere((qb) => {
            qb.whereILike('r.name', term).orWhereILike('bti.bib_number', term);
        });
    }

    const [{ count }] = await base.clone().count('* as count');
    const rows = await base
        .select(
            'bti.id as item_id',
            'bti.record_id',
            'r.name',
            'bti.bib_number',
            'bti.status',
            'bti.qr_version',
            'bti.invalidated_at',
            'bti.receipt_printed_at',
            'bti.picked_up_at',
            'bti.checked_in_at',
            'bti.finished_at',
            'bti.last_scan_at',
        )
        .orderBy('bti.id', 'asc')
        .offset((safePage - 1) * safeLimit)
        .limit(safeLimit);

    return {
        total: Number(count || 0),
        page: safePage,
        limit: safeLimit,
        items: rows,
    };
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

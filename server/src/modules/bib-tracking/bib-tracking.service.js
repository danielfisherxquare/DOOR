import crypto from 'node:crypto';
import knex from '../../db/knex.js';
import { resolveRaceAccess } from '../races/race-access.service.js';
import * as repo from './bib-tracking.repository.js';

const STATUS_ORDER = {
    receipt_printed: 1,
    picked_up: 2,
    checked_in: 3,
    finished: 4,
};

const STATUS_LABELS = {
    receipt_printed: '已出回执',
    picked_up: '已领取',
    checked_in: '已检录',
    finished: '已完赛',
};

function badRequest(message) {
    return Object.assign(new Error(message), { status: 400, expose: true });
}

function notFound(message) {
    return Object.assign(new Error(message), { status: 404, expose: true });
}

function normalizeRaceId(rawRaceId) {
    const raceId = Number(rawRaceId);
    if (!Number.isFinite(raceId) || raceId <= 0) {
        throw badRequest('Invalid raceId');
    }
    return raceId;
}

function normalizeRecordId(rawRecordId) {
    const recordId = Number(rawRecordId);
    if (!Number.isFinite(recordId) || recordId <= 0) {
        throw badRequest('Invalid recordId');
    }
    return recordId;
}

function normalizeItemId(rawItemId) {
    const itemId = Number(rawItemId);
    if (!Number.isFinite(itemId) || itemId <= 0) {
        throw badRequest('Invalid itemId');
    }
    return itemId;
}

function ensureEditorAccess(access) {
    if (access?.effectiveAccessLevel === 'viewer') {
        throw Object.assign(new Error('Read-only race access cannot perform write operations'), {
            status: 403,
            expose: true,
        });
    }
}

function maskPhone(value) {
    const input = String(value || '').trim();
    if (!input) return '';
    if (/^\d{11}$/.test(input)) {
        return `${input.slice(0, 3)}****${input.slice(-4)}`;
    }
    if (input.length <= 5) {
        return `${input.slice(0, 1)}*${input.slice(-1)}`;
    }
    return `${input.slice(0, 3)}${'*'.repeat(Math.max(1, input.length - 5))}${input.slice(-2)}`;
}

function maskIdNumber(value) {
    const input = String(value || '').trim();
    if (!input) return '';
    if (input.length >= 8) {
        return `${input.slice(0, 4)}${'*'.repeat(Math.max(1, input.length - 8))}${input.slice(-4)}`;
    }
    if (input.length <= 4) {
        return `${input.slice(0, 1)}*${input.slice(-1)}`;
    }
    return `${input.slice(0, 2)}${'*'.repeat(Math.max(1, input.length - 4))}${input.slice(-2)}`;
}

function serializeItem(item) {
    return {
        recordId: Number(item.record_id),
        bibNumber: item.bib_number,
        qrToken: item.qr_token,
        qrVersion: Number(item.qr_version),
        status: item.status,
        invalidatedAt: item.invalidated_at,
    };
}

function serializeResolveItem(item) {
    return {
        itemId: Number(item.id),
        raceId: Number(item.race_id),
        recordId: Number(item.record_id),
        name: item.name || '',
        bibNumber: item.bib_number,
        status: item.status,
        invalidatedAt: item.invalidated_at,
        allowedAction: item.status === 'receipt_printed' ? 'pickup' : 'none',
    };
}

function serializeListItem(item) {
    return {
        itemId: Number(item.item_id),
        recordId: Number(item.record_id),
        name: item.name || '',
        bibNumber: item.bib_number,
        phoneMasked: maskPhone(item.phone),
        idNumberMasked: maskIdNumber(item.id_number),
        status: item.status,
        statusLabel: STATUS_LABELS[item.status] || item.status,
        qrVersion: Number(item.qr_version),
        invalidatedAt: item.invalidated_at,
        receiptPrintedAt: item.receipt_printed_at,
        pickedUpAt: item.picked_up_at,
        checkedInAt: item.checked_in_at,
        finishedAt: item.finished_at,
        lastScanAt: item.last_scan_at,
        latestStatusAt: item.latest_status_at,
    };
}

function serializeDetailItem(item) {
    return {
        itemId: Number(item.item_id),
        raceId: Number(item.race_id),
        raceName: item.race_name || '',
        recordId: Number(item.record_id),
        name: item.name || '',
        bibNumber: item.bib_number,
        phone: item.phone || '',
        phoneMasked: maskPhone(item.phone),
        idNumber: item.id_number || '',
        idNumberMasked: maskIdNumber(item.id_number),
        status: item.status,
        statusLabel: STATUS_LABELS[item.status] || item.status,
        receiptPrintedAt: item.receipt_printed_at,
        pickedUpAt: item.picked_up_at,
        checkedInAt: item.checked_in_at,
        finishedAt: item.finished_at,
        lastScanAt: item.last_scan_at,
        latestStatusAt: item.latest_status_at,
        lastScanBy: item.last_scan_by,
        lastScanByName: item.last_scan_by_name || '',
    };
}

function findLatestTimelineEvent(events, status) {
    if (status === 'receipt_printed') {
        return events.find((event) => event.event_type === 'registered_for_export') || null;
    }
    if (status === 'picked_up') {
        return events.find((event) => event.event_type === 'picked_up_by_scan') || null;
    }
    return events.find((event) => event.event_type === status) || null;
}

function buildTimeline(item, events) {
    const definitions = [
        { status: 'receipt_printed', occurredAt: item.receipt_printed_at },
        { status: 'picked_up', occurredAt: item.picked_up_at },
        { status: 'checked_in', occurredAt: item.checked_in_at },
        { status: 'finished', occurredAt: item.finished_at },
    ];

    return definitions
        .filter((entry) => entry.occurredAt)
        .map((entry) => {
            const event = findLatestTimelineEvent(events, entry.status);
            return {
                status: entry.status,
                label: STATUS_LABELS[entry.status] || entry.status,
                occurredAt: entry.occurredAt,
                operatorName: event?.operator_name || '',
                source: event?.source || '',
            };
        });
}

async function ensureBibNumberAvailable(trx, { orgId, raceId, bibNumber, currentItemId = null }) {
    const existing = await repo.findByBibNumberForUpdate(trx, {
        orgId,
        raceId,
        bibNumber,
    });
    if (existing && Number(existing.id) !== Number(currentItemId)) {
        throw badRequest(`bibNumber ${bibNumber} already registered for another record`);
    }
}

async function requireRecordBelongsToRace(orgId, raceId, recordId, bibNumber, trx = knex) {
    const row = await trx('records')
        .where({
            org_id: orgId,
            race_id: raceId,
            id: recordId,
        })
        .first('id', 'bib_number');

    if (!row) {
        throw badRequest(`Record ${recordId} does not belong to race ${raceId}`);
    }

    if (bibNumber && String(row.bib_number || '') && String(row.bib_number) !== String(bibNumber)) {
        throw badRequest(`bibNumber mismatch for record ${recordId}`);
    }
}

export async function registerTrackingItems(authContext, rawRaceId, body) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);

    const records = Array.isArray(body?.records) ? body.records : [];
    if (records.length === 0) {
        throw badRequest('records is required');
    }

    const items = [];

    await knex.transaction(async (trx) => {
        for (const record of records) {
            const recordId = normalizeRecordId(record?.recordId);
            const bibNumber = String(record?.bibNumber || '').trim();
            if (!bibNumber) throw badRequest(`bibNumber is required for record ${recordId}`);

            await requireRecordBelongsToRace(access.operatorOrgId, raceId, recordId, bibNumber, trx);

            let item = await repo.findByRecordForUpdate(trx, {
                orgId: access.operatorOrgId,
                raceId,
                recordId,
            });

            if (!item) {
                await ensureBibNumberAvailable(trx, {
                    orgId: access.operatorOrgId,
                    raceId,
                    bibNumber,
                });

                item = await repo.insertItem(trx, {
                    org_id: access.operatorOrgId,
                    race_id: raceId,
                    record_id: recordId,
                    bib_number: bibNumber,
                    qr_token: crypto.randomUUID(),
                    qr_version: 1,
                    status: 'receipt_printed',
                    receipt_printed_at: trx.fn.now(),
                    external_sync_payload: {},
                });
            } else if (item.invalidated_at) {
                await ensureBibNumberAvailable(trx, {
                    orgId: access.operatorOrgId,
                    raceId,
                    bibNumber,
                    currentItemId: item.id,
                });

                item = await repo.updateItemById(trx, item.id, {
                    bib_number: bibNumber,
                    qr_token: crypto.randomUUID(),
                    qr_version: Number(item.qr_version || 1) + 1,
                    status: 'receipt_printed',
                    receipt_printed_at: trx.fn.now(),
                    picked_up_at: null,
                    checked_in_at: null,
                    finished_at: null,
                    last_scan_at: null,
                    last_scan_by: null,
                    invalidated_at: null,
                    external_sync_payload: {},
                });
            } else if (String(item.bib_number || '') !== bibNumber) {
                await ensureBibNumberAvailable(trx, {
                    orgId: access.operatorOrgId,
                    raceId,
                    bibNumber,
                    currentItemId: item.id,
                });

                item = await repo.updateItemById(trx, item.id, {
                    bib_number: bibNumber,
                });
            }

            await repo.insertEvent(trx, {
                tracking_item_id: item.id,
                org_id: access.operatorOrgId,
                race_id: raceId,
                record_id: recordId,
                event_type: 'registered_for_export',
                from_status: item.status,
                to_status: item.status,
                operator_user_id: authContext.userId,
                source: 'tool_export',
                payload: {
                    qrVersion: Number(item.qr_version),
                    bibNumber,
                },
            });

            items.push(serializeItem(item));
        }
    });

    return { items };
}

export async function resolveTrackingItem(authContext, qrToken) {
    const token = String(qrToken || '').trim();
    if (!token) throw badRequest('qrToken is required');

    const item = await repo.findActiveByToken(token);
    if (!item) throw notFound('Tracking item not found');

    await resolveRaceAccess(authContext, item.race_id, 'GET');

    return serializeResolveItem(item);
}

export async function pickupTrackingItem(authContext, qrToken) {
    const token = String(qrToken || '').trim();
    if (!token) throw badRequest('qrToken is required');

    return knex.transaction(async (trx) => {
        const item = await repo.findActiveByTokenForUpdate(trx, token);
        if (!item) throw notFound('Tracking item not found');

        const access = await resolveRaceAccess(authContext, item.race_id, 'POST');
        ensureEditorAccess(access);

        let nextItem = item;
        if (item.status === 'receipt_printed') {
            nextItem = await repo.updateItemById(trx, item.id, {
                status: 'picked_up',
                picked_up_at: trx.fn.now(),
                last_scan_at: trx.fn.now(),
                last_scan_by: authContext.userId,
            });

            await repo.insertEvent(trx, {
                tracking_item_id: item.id,
                org_id: item.org_id,
                race_id: item.race_id,
                record_id: item.record_id,
                event_type: 'picked_up_by_scan',
                from_status: item.status,
                to_status: 'picked_up',
                operator_user_id: authContext.userId,
                source: 'door_scan',
                payload: { qrToken: token },
            });
        }

        return {
            itemId: Number(nextItem.id),
            raceId: Number(nextItem.race_id),
            recordId: Number(nextItem.record_id),
            bibNumber: nextItem.bib_number,
            status: nextItem.status,
            pickedUpAt: nextItem.picked_up_at,
            lastScanAt: nextItem.last_scan_at,
            lastScanBy: nextItem.last_scan_by,
        };
    });
}

export async function listTrackingItems(authContext, rawRaceId, query) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');

    const data = await repo.listItems(access.operatorOrgId, raceId, query);
    return {
        ...data,
        items: data.items.map(serializeListItem),
    };
}

export async function getTrackingStats(authContext, rawRaceId) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');
    return repo.getStats(access.operatorOrgId, raceId);
}

export async function getTrackingItemDetail(authContext, rawRaceId, rawItemId) {
    const raceId = normalizeRaceId(rawRaceId);
    const itemId = normalizeItemId(rawItemId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');

    const item = await repo.getItemDetail(access.operatorOrgId, raceId, itemId);
    if (!item) throw notFound('Tracking item not found');

    const events = await repo.listItemTimeline(itemId);

    return {
        item: serializeDetailItem(item),
        timeline: buildTimeline(item, events),
    };
}

export async function syncTrackingStatuses(authContext, rawRaceId, body) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);

    const source = String(body?.source || '').trim();
    const events = Array.isArray(body?.events) ? body.events : [];
    if (!source) throw badRequest('source is required');
    if (events.length === 0) throw badRequest('events is required');

    const result = {
        processed: 0,
        updated: 0,
        ignored: 0,
        missing: 0,
    };

    await knex.transaction(async (trx) => {
        for (const event of events) {
            result.processed += 1;
            const bibNumber = String(event?.bibNumber || '').trim();
            const targetStatus = String(event?.type || '').trim();
            if (!bibNumber || !STATUS_ORDER[targetStatus] || targetStatus === 'receipt_printed' || targetStatus === 'picked_up') {
                throw badRequest('sync events must include bibNumber and type checked_in|finished');
            }

            const item = await repo.findActiveByBibNumberForUpdate(trx, {
                orgId: access.operatorOrgId,
                raceId,
                bibNumber,
            });

            if (!item) {
                result.missing += 1;
                continue;
            }

            if (STATUS_ORDER[item.status] >= STATUS_ORDER[targetStatus]) {
                result.ignored += 1;
                continue;
            }

            const occurredAt = event?.occurredAt || trx.fn.now();
            const patch = {
                status: targetStatus,
                external_sync_source: source,
                external_sync_payload: event?.payload || {},
            };

            if (targetStatus === 'checked_in') {
                patch.checked_in_at = occurredAt;
            }
            if (targetStatus === 'finished') {
                patch.finished_at = occurredAt;
            }

            await repo.updateItemById(trx, item.id, patch);
            await repo.insertEvent(trx, {
                tracking_item_id: item.id,
                org_id: item.org_id,
                race_id: item.race_id,
                record_id: item.record_id,
                event_type: targetStatus,
                from_status: item.status,
                to_status: targetStatus,
                operator_user_id: authContext.userId,
                source: 'timing_sync',
                payload: event?.payload || {},
            });
            result.updated += 1;
        }
    });

    return result;
}

import crypto from 'node:crypto';
import knex from '../../db/knex.js';
import { resolveRaceAccess } from '../races/race-access.service.js';
import * as repo from './bib-tracking.repository.js';

const REGISTER_CHUNK_SIZE = 200;
const PICKUP_WARN_DURATION_MS = 300;
const PICKUP_WARN_LOCK_WAIT_MS = 150;
const RESOLVE_WARN_DURATION_MS = 120;
const LIST_WARN_DURATION_MS = 300;

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

const ROLLBACK_CONFIG = {
    picked_up: {
        targetStatus: 'receipt_printed',
        actionLabel: '撤回到已出回执',
        clearFields: ['picked_up_at', 'checked_in_at', 'finished_at', 'last_scan_at', 'last_scan_by'],
    },
    checked_in: {
        targetStatus: 'picked_up',
        actionLabel: '撤回到已领取',
        clearFields: ['checked_in_at', 'finished_at'],
    },
    finished: {
        targetStatus: 'checked_in',
        actionLabel: '撤回到已检录',
        clearFields: ['finished_at'],
    },
};

const ACTION_REASON_BY_STATUS = {
    receipt_printed: 'ready_for_pickup',
    picked_up: 'already_picked_up',
    checked_in: 'already_checked_in',
    finished: 'already_finished',
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

function resolveActionReason(item) {
    if (!item) return 'not_found';
    if (item.invalidated_at) return 'invalidated';
    return ACTION_REASON_BY_STATUS[item.status] || 'not_found';
}

function resolveNextAction(item) {
    if (!item || item.invalidated_at) return null;
    return item.status === 'receipt_printed' ? 'pickup' : null;
}

function serializeResolveItem(item) {
    const nextAction = resolveNextAction(item);
    return {
        itemId: Number(item.id),
        raceId: Number(item.race_id),
        recordId: Number(item.record_id),
        name: item.name || '',
        bibNumber: item.bib_number,
        status: item.status,
        invalidatedAt: item.invalidated_at,
        nextAction,
        actionReason: resolveActionReason(item),
        allowedAction: nextAction || 'none',
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

function serializeRollbackAction(item) {
    const config = item ? ROLLBACK_CONFIG[item.status] : null;
    if (!config) {
        return {
            canRollback: false,
            fromStatus: item?.status || null,
            fromStatusLabel: item ? (STATUS_LABELS[item.status] || item.status) : '',
            targetStatus: null,
            targetStatusLabel: '',
            actionLabel: '',
        };
    }

    return {
        canRollback: true,
        fromStatus: item.status,
        fromStatusLabel: STATUS_LABELS[item.status] || item.status,
        targetStatus: config.targetStatus,
        targetStatusLabel: STATUS_LABELS[config.targetStatus] || config.targetStatus,
        actionLabel: config.actionLabel,
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

function buildRollbackHistory(events) {
    return events
        .filter((event) => event.event_type === 'status_rollback')
        .map((event) => ({
            id: Number(event.id),
            occurredAt: event.created_at,
            operatorUserId: event.operator_user_id ? Number(event.operator_user_id) : null,
            operatorName: event.operator_name || '',
            source: event.source || '',
            fromStatus: event.from_status || '',
            fromStatusLabel: STATUS_LABELS[event.from_status] || event.from_status || '',
            toStatus: event.to_status || '',
            toStatusLabel: STATUS_LABELS[event.to_status] || event.to_status || '',
            reason: String(event.payload?.reason || '').trim(),
        }));
}

async function buildTrackingItemDetail(orgId, raceId, itemId) {
    const item = await repo.getItemDetail(orgId, raceId, itemId);
    if (!item) throw notFound('Tracking item not found');

    const events = await repo.listItemTimeline(itemId);
    const rollbackHistory = buildRollbackHistory(events);

    return {
        item: serializeDetailItem(item),
        timeline: buildTimeline(item, events),
        rollbackAction: serializeRollbackAction(item),
        rollbackHistory,
        lastRollback: rollbackHistory[0] || null,
    };
}

function chunk(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

function maybeLogTiming(level, event, payload) {
    console[level](JSON.stringify({ event, ...payload }));
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

function normalizeRollbackReason(rawReason) {
    const reason = String(rawReason || '').trim();
    if (!reason) return '';
    if (reason.length > 200) {
        throw badRequest('rollback reason must be 200 characters or fewer');
    }
    return reason;
}

export async function registerTrackingItems(authContext, rawRaceId, body) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);

    const inputRecords = Array.isArray(body?.records) ? body.records : [];
    if (inputRecords.length === 0) {
        throw badRequest('records is required');
    }

    const records = inputRecords.map((record) => {
        const recordId = normalizeRecordId(record?.recordId);
        const bibNumber = String(record?.bibNumber || '').trim();
        if (!bibNumber) throw badRequest(`bibNumber is required for record ${recordId}`);
        return { recordId, bibNumber };
    });

    const duplicateBibOwners = new Map();
    for (const record of records) {
        const owners = duplicateBibOwners.get(record.bibNumber) || [];
        owners.push(record.recordId);
        duplicateBibOwners.set(record.bibNumber, owners);
    }
    const duplicateBibEntry = Array.from(duplicateBibOwners.entries()).find(([, owners]) => owners.length > 1);
    if (duplicateBibEntry) {
        const [bibNumber, owners] = duplicateBibEntry;
        throw badRequest(`bibNumber ${bibNumber} appears multiple times in this batch (${owners.join(', ')})`);
    }

    const uniqueRecordIds = Array.from(new Set(records.map((record) => record.recordId)));
    const uniqueBibNumbers = Array.from(new Set(records.map((record) => record.bibNumber)));
    const recordRows = await knex('records')
        .where({
            org_id: access.operatorOrgId,
            race_id: raceId,
        })
        .whereIn('id', uniqueRecordIds)
        .select('id', 'bib_number');
    const recordMap = new Map(recordRows.map((row) => [Number(row.id), row]));
    for (const record of records) {
        const row = recordMap.get(record.recordId);
        if (!row) {
            throw badRequest(`Record ${record.recordId} does not belong to race ${raceId}`);
        }
        if (String(row.bib_number || '').trim() && String(row.bib_number).trim() !== record.bibNumber) {
            throw badRequest(`bibNumber mismatch for record ${record.recordId}`);
        }
    }

    const existingItems = await repo.findByRecordIds(knex, {
        orgId: access.operatorOrgId,
        raceId,
        recordIds: uniqueRecordIds,
    });
    const conflictingItems = await repo.findByBibNumbers(knex, {
        orgId: access.operatorOrgId,
        raceId,
        bibNumbers: uniqueBibNumbers,
    });
    const itemsByRecordId = new Map(existingItems.map((item) => [Number(item.record_id), item]));
    const itemsByBibNumber = new Map(conflictingItems.map((item) => [String(item.bib_number), item]));

    const items = [];
    for (const batch of chunk(records, REGISTER_CHUNK_SIZE)) {
        const startedAt = Date.now();
        let inserted = 0;
        let updated = 0;
        let eventsInserted = 0;

        await knex.transaction(async (trx) => {
            for (const record of batch) {
                const { recordId, bibNumber } = record;
                const existingItem = itemsByRecordId.get(recordId) || null;
                const occupiedItem = itemsByBibNumber.get(bibNumber) || null;
                if (occupiedItem && Number(occupiedItem.id) !== Number(existingItem?.id)) {
                    throw badRequest(`bibNumber ${bibNumber} already registered for another record`);
                }

                let nextItem = existingItem;
                let shouldInsertEvent = false;

                if (!existingItem) {
                    nextItem = await repo.insertItem(trx, {
                        org_id: access.operatorOrgId,
                        race_id: raceId,
                        record_id: recordId,
                        bib_number: bibNumber,
                        qr_token: crypto.randomUUID(),
                        qr_version: 1,
                        status: 'receipt_printed',
                        receipt_printed_at: trx.fn.now(),
                        latest_status_at: trx.fn.now(),
                        external_sync_payload: {},
                    });
                    inserted += 1;
                    shouldInsertEvent = true;
                } else if (existingItem.invalidated_at) {
                    nextItem = await repo.updateItemById(trx, existingItem.id, {
                        bib_number: bibNumber,
                        qr_token: crypto.randomUUID(),
                        qr_version: Number(existingItem.qr_version || 1) + 1,
                        status: 'receipt_printed',
                        receipt_printed_at: trx.fn.now(),
                        picked_up_at: null,
                        checked_in_at: null,
                        finished_at: null,
                        last_scan_at: null,
                        last_scan_by: null,
                        invalidated_at: null,
                        latest_status_at: trx.fn.now(),
                        external_sync_payload: {},
                    });
                    updated += 1;
                    shouldInsertEvent = true;
                } else if (String(existingItem.bib_number || '') !== bibNumber) {
                    nextItem = await repo.updateItemById(trx, existingItem.id, {
                        bib_number: bibNumber,
                    });
                    updated += 1;
                    shouldInsertEvent = true;
                }

                if (shouldInsertEvent) {
                    await repo.insertEvent(trx, {
                        tracking_item_id: nextItem.id,
                        org_id: access.operatorOrgId,
                        race_id: raceId,
                        record_id: recordId,
                        event_type: 'registered_for_export',
                        from_status: nextItem.status,
                        to_status: nextItem.status,
                        operator_user_id: authContext.userId,
                        source: 'tool_export',
                        payload: {
                            qrVersion: Number(nextItem.qr_version),
                            bibNumber,
                        },
                    });
                    eventsInserted += 1;
                }

                if (existingItem && String(existingItem.bib_number || '') && String(existingItem.bib_number) !== bibNumber) {
                    itemsByBibNumber.delete(String(existingItem.bib_number));
                }
                itemsByRecordId.set(recordId, nextItem);
                itemsByBibNumber.set(bibNumber, nextItem);
                items.push(serializeItem(nextItem));
            }
        });

        maybeLogTiming('info', 'bib.register.batch', {
            raceId,
            batchSize: batch.length,
            inserted,
            updated,
            eventsInserted,
            durationMs: Date.now() - startedAt,
        });
    }

    return { items };
}

export async function resolveTrackingItem(authContext, qrToken) {
    const token = String(qrToken || '').trim();
    if (!token) throw badRequest('qrToken is required');

    const startedAt = Date.now();
    const item = await repo.findByToken(token);
    if (!item) throw notFound('Tracking item not found');

    await resolveRaceAccess(authContext, item.race_id, 'GET');

    const data = serializeResolveItem(item);
    const durationMs = Date.now() - startedAt;
    maybeLogTiming(durationMs > RESOLVE_WARN_DURATION_MS ? 'warn' : 'info', 'scan.resolve', {
        requestId: authContext?.requestId || null,
        userId: authContext?.userId || null,
        raceId: Number(item.race_id),
        itemId: Number(item.id),
        status: item.status,
        actionReason: data.actionReason,
        durationMs,
    });

    return data;
}

export async function pickupTrackingItem(authContext, qrToken) {
    const token = String(qrToken || '').trim();
    if (!token) throw badRequest('qrToken is required');

    const startedAt = Date.now();
    const summary = await repo.findTokenSummary(token);
    if (!summary || summary.invalidated_at) {
        throw notFound('Tracking item not found');
    }

    const access = await resolveRaceAccess(authContext, summary.race_id, 'POST');
    ensureEditorAccess(access);

    let lockWaitMs = 0;
    const data = await knex.transaction(async (trx) => {
        const lockStartedAt = Date.now();
        const item = await repo.findActiveByTokenForUpdate(trx, token);
        lockWaitMs = Date.now() - lockStartedAt;
        if (!item) throw notFound('Tracking item not found');

        let nextItem = item;
        let result = 'already_picked_up';
        if (item.status === 'receipt_printed') {
            nextItem = await repo.updateItemById(trx, item.id, {
                status: 'picked_up',
                picked_up_at: trx.fn.now(),
                last_scan_at: trx.fn.now(),
                last_scan_by: authContext.userId,
                latest_status_at: trx.fn.now(),
            });
            result = 'picked_up_now';

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
        } else if (item.status !== 'picked_up') {
            result = 'not_pickup_eligible';
        }

        return {
            itemId: Number(nextItem.id),
            raceId: Number(nextItem.race_id),
            recordId: Number(nextItem.record_id),
            bibNumber: nextItem.bib_number,
            status: nextItem.status,
            result,
            nextAction: null,
            actionReason: resolveActionReason(nextItem),
            pickedUpAt: nextItem.picked_up_at,
            lastScanAt: nextItem.last_scan_at,
            lastScanBy: nextItem.last_scan_by,
        };
    });

    const durationMs = Date.now() - startedAt;
    const level = durationMs > PICKUP_WARN_DURATION_MS || lockWaitMs > PICKUP_WARN_LOCK_WAIT_MS ? 'warn' : 'info';
    maybeLogTiming(level, 'scan.pickup', {
        requestId: authContext?.requestId || null,
        userId: authContext?.userId || null,
        raceId: Number(data.raceId),
        itemId: Number(data.itemId),
        result: data.result,
        durationMs,
        lockWaitMs,
    });

    return data;
}

export async function listTrackingItems(authContext, rawRaceId, query) {
    const raceId = normalizeRaceId(rawRaceId);
    const access = await resolveRaceAccess(authContext, raceId, 'GET');

    const startedAt = Date.now();
    const data = await repo.listItems(access.operatorOrgId, raceId, query);
    const durationMs = Date.now() - startedAt;
    if (durationMs > LIST_WARN_DURATION_MS) {
        maybeLogTiming('warn', 'bib.listItems', {
            requestId: authContext?.requestId || null,
            userId: authContext?.userId || null,
            raceId,
            status: query?.status || null,
            keyword: query?.keyword || null,
            total: Number(data.total || 0),
            durationMs,
        });
    }
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
    return buildTrackingItemDetail(access.operatorOrgId, raceId, itemId);
}

export async function rollbackTrackingItem(authContext, rawRaceId, rawItemId, body) {
    const raceId = normalizeRaceId(rawRaceId);
    const itemId = normalizeItemId(rawItemId);
    const access = await resolveRaceAccess(authContext, raceId, 'POST');
    ensureEditorAccess(access);

    const reason = normalizeRollbackReason(body?.reason);

    await knex.transaction(async (trx) => {
        const item = await repo.findActiveByIdForUpdate(trx, {
            orgId: access.operatorOrgId,
            raceId,
            itemId,
        });
        if (!item) {
            throw notFound('Tracking item not found');
        }

        const rollback = serializeRollbackAction(item);
        if (!rollback.canRollback) {
            throw badRequest('Current status does not support rollback');
        }

        const patch = {
            status: rollback.targetStatus,
            latest_status_at: trx.fn.now(),
        };

        for (const field of ROLLBACK_CONFIG[item.status].clearFields) {
            patch[field] = null;
        }

        await repo.updateItemById(trx, item.id, patch);
        await repo.insertEvent(trx, {
            tracking_item_id: item.id,
            org_id: item.org_id,
            race_id: item.race_id,
            record_id: item.record_id,
            event_type: 'status_rollback',
            from_status: item.status,
            to_status: rollback.targetStatus,
            operator_user_id: authContext.userId,
            source: 'admin_console',
            payload: {
                reason: reason || null,
                rollbackFrom: item.status,
                rollbackTo: rollback.targetStatus,
            },
        });
    });

    return buildTrackingItemDetail(access.operatorOrgId, raceId, itemId);
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
                latest_status_at: occurredAt,
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

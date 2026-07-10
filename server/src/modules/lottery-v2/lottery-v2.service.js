import { createHash } from 'node:crypto';
import knex from '../../db/knex.js';
import { normalizeEvent } from '../../utils/event-normalizer.js';
import {
    assertNoActiveLotteryJob,
    assertNoActivePipelineExecution,
    assertNoFinalizedLotteryV2,
    assertNoLotteryV1Snapshot,
    lockLotteryRace,
} from '../lottery/lottery-execution.repository.js';

const DIRECT_STATUSES = new Set(['直通名额', '直通', '强制保签']);
const BLOCKING_LOTTERY_STATUSES = new Set(['通道错误', '精英资质存疑', '模糊剔除', '强制剔除', '不予通过']);
const SPECIAL_CATEGORIES = new Set(['Elite', 'Permanent', 'Pacer', 'Medic', 'Sponsor']);
const BATCH_SIZE = 1000;

async function lockLotteryMutation(orgId, raceId, trx) {
    await lockLotteryRace(orgId, raceId, trx);
    await assertNoActivePipelineExecution(
        orgId,
        raceId,
        ['lottery', 'rollback_lottery'],
        trx,
    );
}

const DEFAULT_CONFIG = {
    apparelScopeMode: 'gender_size',
    sizeMatchPolicy: 'exact',
    performanceRatio: 0.3,
    genderRatio: { M: 0.6, F: 0.4 },
    regionDimension: 'province',
    regionRatios: {},
    seed: '',
    fallbackStrategy: 'same_pool',
};

function clamp01(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, 0), 1);
}

function deserializeJson(value, fallback) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
        return fallback;
    }
}

function toDbConfig(data, orgId, raceId) {
    const genderRatio = data.genderRatio || data.gender_ratio || DEFAULT_CONFIG.genderRatio;
    const regionRatios = data.regionRatios || data.region_ratios || DEFAULT_CONFIG.regionRatios;
    return {
        org_id: orgId,
        race_id: raceId,
        apparel_scope_mode: data.apparelScopeMode || data.apparel_scope_mode || DEFAULT_CONFIG.apparelScopeMode,
        size_match_policy: 'exact',
        performance_ratio: clamp01(data.performanceRatio ?? data.performance_ratio, DEFAULT_CONFIG.performanceRatio),
        gender_ratio: JSON.stringify(genderRatio),
        region_dimension: data.regionDimension || data.region_dimension || DEFAULT_CONFIG.regionDimension,
        region_ratios: JSON.stringify(regionRatios),
        seed: String(data.seed ?? DEFAULT_CONFIG.seed),
        fallback_strategy: data.fallbackStrategy || data.fallback_strategy || DEFAULT_CONFIG.fallbackStrategy,
        updated_at: knex.fn.now(),
    };
}

function fromDbConfig(row) {
    if (!row) return { ...DEFAULT_CONFIG };
    return {
        id: Number(row.id),
        orgId: row.org_id,
        raceId: Number(row.race_id),
        apparelScopeMode: row.apparel_scope_mode || DEFAULT_CONFIG.apparelScopeMode,
        sizeMatchPolicy: row.size_match_policy || DEFAULT_CONFIG.sizeMatchPolicy,
        performanceRatio: clamp01(row.performance_ratio, DEFAULT_CONFIG.performanceRatio),
        genderRatio: deserializeJson(row.gender_ratio, DEFAULT_CONFIG.genderRatio),
        regionDimension: row.region_dimension || DEFAULT_CONFIG.regionDimension,
        regionRatios: deserializeJson(row.region_ratios, DEFAULT_CONFIG.regionRatios),
        seed: row.seed || '',
        fallbackStrategy: row.fallback_strategy || DEFAULT_CONFIG.fallbackStrategy,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function stableHash(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function compareByString(a, b) {
    return String(a || '').localeCompare(String(b || ''));
}

function compareByNumber(a, b) {
    return Number(a || 0) - Number(b || 0);
}

function normalizeGender(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'M' || raw === 'MALE' || raw === '男') return 'M';
    if (raw === 'F' || raw === 'FEMALE' || raw === '女') return 'F';
    return 'U';
}

function normalizeSize(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return '';
    return raw
        .replace(/\s+/g, '')
        .replace(/^尺码[:：]?/u, '')
        .replace(/码$/u, '');
}

function eventKey(value) {
    return normalizeEvent(value || '') || String(value || '').trim() || 'ALL';
}

function regionValue(record, dimension) {
    const value = record?.[dimension] ?? '';
    const normalized = String(value || '').trim();
    return normalized || 'UNKNOWN';
}

function apparelBucketFor(input, config) {
    const size = normalizeSize(input.clothing_size || input.clothingSize || input.size);
    if (!size) return '';
    const gender = normalizeGender(input.gender);
    const event = eventKey(input.event);
    if (config.apparelScopeMode === 'unisex_size') return `U|${size}`;
    if (config.apparelScopeMode === 'event_gender_size') return `${event}|${gender}|${size}`;
    return `${gender}|${size}`;
}

function seededRandomScore(seed, recordId, phase = '') {
    const digest = createHash('sha256')
        .update(`${seed || 'lottery-v2'}:${phase}:${recordId}`)
        .digest();
    return digest.readUInt32BE(0) / 0xffffffff;
}

function isDirectRecord(record) {
    if (Number(record.is_locked || 0) === 1) return true;
    if (DIRECT_STATUSES.has(String(record.lottery_status || '').trim())) return true;
    return SPECIAL_CATEGORIES.has(String(record.runner_category || '').trim());
}

function isMassCandidate(record) {
    const category = String(record.runner_category || 'Mass').trim() || 'Mass';
    return !SPECIAL_CATEGORIES.has(category);
}

function hasBlockingReview(record) {
    if (record.audit_status === 'review') return true;
    return BLOCKING_LOTTERY_STATUSES.has(String(record.lottery_status || '').trim());
}

function consumeInventory(inventory, apparelBucket) {
    const current = Number(inventory.get(apparelBucket) || 0);
    if (current <= 0) return false;
    inventory.set(apparelBucket, current - 1);
    return true;
}

function buildInventoryBuckets(limits, config) {
    const buckets = new Map();
    const details = [];
    for (const row of limits) {
        const size = normalizeSize(row.size);
        if (!size) continue;
        const gender = normalizeGender(row.gender);
        const event = eventKey(row.event || 'ALL');
        let key;
        if (config.apparelScopeMode === 'unisex_size') key = `U|${size}`;
        else if (config.apparelScopeMode === 'event_gender_size') key = `${event}|${gender}|${size}`;
        else key = `${gender}|${size}`;

        const total = Number(row.total_inventory || 0);
        const used = Number(row.used_count || 0);
        const available = Math.max(total - used, 0);
        buckets.set(key, Number(buckets.get(key) || 0) + available);
        details.push({ key, event, gender, size, total, used, available });
    }
    return { buckets, details };
}

function allocateRatio(total, ratios, keys) {
    if (total <= 0) return new Map(keys.map((key) => [key, 0]));
    const safeRatios = keys.map((key) => Math.max(Number(ratios?.[key] || 0), 0));
    const sum = safeRatios.reduce((acc, value) => acc + value, 0);
    if (sum <= 0) {
        return new Map([[keys[0] || 'ALL', total]]);
    }

    const raw = keys.map((key, index) => ({
        key,
        value: total * (safeRatios[index] / sum),
    }));
    const result = new Map();
    let assigned = 0;
    for (const item of raw) {
        const floor = Math.floor(item.value);
        result.set(item.key, floor);
        assigned += floor;
    }
    raw
        .sort((a, b) => (b.value - Math.floor(b.value)) - (a.value - Math.floor(a.value)))
        .slice(0, total - assigned)
        .forEach((item) => result.set(item.key, Number(result.get(item.key) || 0) + 1));
    return result;
}

function parsePbSeconds(value) {
    const raw = typeof value === 'string'
        ? value
        : value && typeof value === 'object'
            ? value.netTime
            : '';
    const str = String(raw || '').trim();
    const parts = str.split(':').map((part) => Number(part));
    if (parts.length === 3 && parts.every(Number.isFinite)) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2 && parts.every(Number.isFinite)) return parts[0] * 60 + parts[1];
    return Number.POSITIVE_INFINITY;
}

function getBestSeconds(record) {
    const full = parsePbSeconds(record.personal_best_full);
    const half = parsePbSeconds(record.personal_best_half);
    return Math.min(full, half);
}

function sortCandidates(candidates) {
    return [...candidates].sort((a, b) => {
        if (a.randomScore !== b.randomScore) return a.randomScore - b.randomScore;
        if (a.bestSeconds !== b.bestSeconds) return a.bestSeconds - b.bestSeconds;
        return Number(a.id) - Number(b.id);
    });
}

async function markReadySnapshotsStale(orgId, raceId, trx = knex) {
    await trx('lottery_v2_snapshots')
        .where({ org_id: orgId, race_id: raceId, status: 'ready' })
        .update({ status: 'stale', updated_at: trx.fn.now() });
}

export async function getConfig(orgId, raceId, trx = knex) {
    const row = await trx('lottery_v2_configs').where({ org_id: orgId, race_id: raceId }).first();
    return fromDbConfig(row);
}

export async function saveConfig(orgId, raceId, data, database = knex) {
    return database.transaction(async (trx) => {
        await lockLotteryMutation(orgId, raceId, trx);
        await assertNoLotteryV1Snapshot(orgId, raceId, trx);
        const row = toDbConfig(data, orgId, raceId);
        const [saved] = await trx('lottery_v2_configs')
            .insert(row)
            .onConflict(['org_id', 'race_id'])
            .merge({
                apparel_scope_mode: row.apparel_scope_mode,
                size_match_policy: row.size_match_policy,
                performance_ratio: row.performance_ratio,
                gender_ratio: row.gender_ratio,
                region_dimension: row.region_dimension,
                region_ratios: row.region_ratios,
                seed: row.seed,
                fallback_strategy: row.fallback_strategy,
                updated_at: trx.fn.now(),
            })
            .returning('*');
        await markReadySnapshotsStale(orgId, raceId, trx);
        return fromDbConfig(saved);
    });
}

async function readBaseData(orgId, raceId, trx = knex) {
    const [config, capacities, limits, lists, records] = await Promise.all([
        getConfig(orgId, raceId, trx),
        trx('race_capacity').where({ org_id: orgId, race_id: raceId }).orderBy('event'),
        trx('clothing_limits').where({ org_id: orgId, race_id: raceId }),
        trx('lottery_lists')
            .where({ org_id: orgId, race_id: raceId })
            .select('id', 'list_type', 'name', 'id_number', 'phone', 'matched_record_id', 'match_type', 'created_at'),
        trx('records')
            .where({ org_id: orgId, race_id: raceId })
            .select(
                'id', 'name', 'event', 'gender', 'province', 'city', 'district',
                'clothing_size', 'audit_status', 'lottery_status', 'is_locked',
                'runner_category', 'personal_best_full', 'personal_best_half',
                '_imported_at', 'updated_at',
            ),
    ]);
    return { config, capacities, limits, lists, records };
}

function buildSourceFingerprint({ capacities, limits, lists, records }) {
    const normalized = {
        capacities: capacities
            .map((row) => ({
                event: eventKey(row.event),
                targetCount: Number(row.target_count || 0),
                drawRatio: Number(row.draw_ratio || 0),
                reservedRatio: Number(row.reserved_ratio || 0),
                mode: String(row.lottery_mode_override || ''),
                updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
            }))
            .sort((a, b) => compareByString(a.event, b.event)),
        limits: limits
            .map((row) => ({
                event: eventKey(row.event),
                gender: normalizeGender(row.gender),
                size: normalizeSize(row.size),
                totalInventory: Number(row.total_inventory || 0),
                usedCount: Number(row.used_count || 0),
                updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
            }))
            .sort((a, b) => (
                compareByString(a.event, b.event)
                || compareByString(a.gender, b.gender)
                || compareByString(a.size, b.size)
            )),
        lists: lists
            .map((row) => ({
                id: Number(row.id),
                listType: String(row.list_type || ''),
                name: String(row.name || ''),
                idNumber: String(row.id_number || ''),
                phone: String(row.phone || ''),
                matchedRecordId: Number(row.matched_record_id || 0),
                matchType: String(row.match_type || ''),
                createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
            }))
            .sort((a, b) => compareByNumber(a.id, b.id)),
        records: records
            .map((row) => ({
                id: Number(row.id),
                event: eventKey(row.event),
                gender: normalizeGender(row.gender),
                province: String(row.province || ''),
                city: String(row.city || ''),
                district: String(row.district || ''),
                clothingSize: normalizeSize(row.clothing_size),
                auditStatus: String(row.audit_status || ''),
                lotteryStatus: String(row.lottery_status || ''),
                isLocked: Number(row.is_locked || 0),
                runnerCategory: String(row.runner_category || ''),
                personalBestFull: row.personal_best_full || null,
                personalBestHalf: row.personal_best_half || null,
                importedAt: row._imported_at ? new Date(row._imported_at).toISOString() : '',
                updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : '',
            }))
            .sort((a, b) => compareByNumber(a.id, b.id)),
    };
    return stableHash(normalized);
}

function buildDirectReservations(directRecords, inventory, config) {
    const reservations = [];
    const errors = [];
    for (const record of directRecords) {
        const apparelBucket = apparelBucketFor(record, config);
        const size = normalizeSize(record.clothing_size);
        const genderBucket = normalizeGender(record.gender);
        if (!apparelBucket || genderBucket === 'U') {
            errors.push(`直通记录 ${record.id} 缺少可识别性别或尺码，无法锁定参赛服。`);
            continue;
        }
        if (!consumeInventory(inventory, apparelBucket)) {
            errors.push(`直通记录 ${record.id} 无可用服装库存 bucket=${apparelBucket}。`);
            continue;
        }
        reservations.push({
            recordId: Number(record.id),
            reservationType: 'direct',
            event: eventKey(record.event),
            genderBucket,
            size,
            apparelBucket,
            source: 'lottery_v2_direct',
        });
    }
    return { reservations, errors };
}

function buildCandidateRows(records, inventory, config) {
    const candidates = [];
    const waitlist = [];
    const blockers = [];
    for (const record of records) {
        if (hasBlockingReview(record)) {
            blockers.push({ recordId: Number(record.id), reason: 'review_or_blocked_status' });
            continue;
        }
        if (isDirectRecord(record)) continue;
        if (!isMassCandidate(record)) continue;
        if (!['pass', 'qualified_time'].includes(String(record.audit_status || ''))) continue;
        if (String(record.lottery_status || '').trim() !== '参与抽签') continue;
        if (Number(record.is_locked || 0) !== 0) continue;

        const apparelBucket = apparelBucketFor(record, config);
        const genderBucket = normalizeGender(record.gender);
        const size = normalizeSize(record.clothing_size);
        if (!apparelBucket || genderBucket === 'U' || !size) {
            waitlist.push({ recordId: Number(record.id), reason: 'missing_gender_or_size' });
            continue;
        }
        if (!inventory.has(apparelBucket)) {
            waitlist.push({ recordId: Number(record.id), reason: 'no_apparel_bucket', apparelBucket });
            continue;
        }

        const bestSeconds = getBestSeconds(record);
        candidates.push({
            id: Number(record.id),
            name: record.name || '',
            event: eventKey(record.event),
            rawEvent: record.event || '',
            gender: genderBucket,
            region: regionValue(record, config.regionDimension),
            apparelBucket,
            size,
            isPerformance: String(record.audit_status || '') === 'qualified_time',
            bestSeconds,
            randomScore: seededRandomScore(config.seed, record.id, 'candidate'),
        });
    }
    return { candidates, waitlist, blockers };
}

function trySelect({ candidates, selectedIds, inventory, need, filter, fallbackLabel, logs }) {
    const picked = [];
    if (need <= 0) return picked;
    const pool = sortCandidates(candidates.filter((candidate) => (
        !selectedIds.has(candidate.id) && filter(candidate)
    )));
    for (const candidate of pool) {
        if (picked.length >= need) break;
        if (!consumeInventory(inventory, candidate.apparelBucket)) continue;
        selectedIds.add(candidate.id);
        picked.push({ ...candidate, fallbackLabel });
    }
    if (picked.length < need) {
        logs.push({ fallbackLabel, requested: need, selected: picked.length, shortage: need - picked.length });
    }
    return picked;
}

function allocateForQuota({ event, poolName, gender, region, target, candidates, selectedIds, inventory, logs }) {
    let remaining = target;
    const selected = [];
    const poolIsPerformance = poolName === 'performance';
    const samePool = (candidate) => candidate.isPerformance === poolIsPerformance;

    const attempts = [
        {
            label: `${event}/${poolName}/${gender}/${region}`,
            filter: (candidate) => candidate.event === event && samePool(candidate) && candidate.gender === gender && candidate.region === region,
        },
        {
            label: `${event}/${poolName}/${gender}/any-region`,
            filter: (candidate) => candidate.event === event && samePool(candidate) && candidate.gender === gender,
        },
        {
            label: `${event}/${poolName}/any-gender/any-region`,
            filter: (candidate) => candidate.event === event && samePool(candidate),
        },
        {
            label: `${event}/cross-pool-fallback`,
            filter: (candidate) => candidate.event === event,
        },
    ];

    for (const attempt of attempts) {
        if (remaining <= 0) break;
        const picked = trySelect({
            candidates,
            selectedIds,
            inventory,
            need: remaining,
            filter: attempt.filter,
            fallbackLabel: attempt.label,
            logs,
        });
        selected.push(...picked);
        remaining -= picked.length;
    }

    return selected;
}

function buildQuotaPlan({ capacities, directReservations, candidates, config, inventory }) {
    const selectedIds = new Set();
    const winners = [];
    const logs = [];
    const directByEvent = {};
    const candidatesByEvent = {};
    const quotaBreakdown = [];

    for (const reservation of directReservations) {
        directByEvent[reservation.event] = Number(directByEvent[reservation.event] || 0) + 1;
    }
    for (const candidate of candidates) {
        candidatesByEvent[candidate.event] = Number(candidatesByEvent[candidate.event] || 0) + 1;
    }

    const capacityRows = capacities.map((row) => ({
        event: eventKey(row.event),
        targetCount: Math.max(Number(row.target_count || 0), 0),
    }));

    for (const cap of capacityRows) {
        const directCount = Number(directByEvent[cap.event] || 0);
        const eventCandidates = candidates.filter((candidate) => candidate.event === cap.event);
        const lotterySlots = Math.min(Math.max(cap.targetCount - directCount, 0), eventCandidates.length);
        const performanceTarget = Math.min(
            eventCandidates.filter((candidate) => candidate.isPerformance).length,
            Math.round(lotterySlots * clamp01(config.performanceRatio, DEFAULT_CONFIG.performanceRatio)),
        );
        const generalTarget = Math.max(lotterySlots - performanceTarget, 0);
        const poolTargets = [
            ['performance', performanceTarget],
            ['general', generalTarget],
        ];

        let eventSelected = 0;
        for (const [poolName, poolTarget] of poolTargets) {
            const genderTargets = allocateRatio(poolTarget, config.genderRatio, ['M', 'F']);
            for (const [gender, genderTarget] of genderTargets.entries()) {
                const regionKeys = Object.keys(config.regionRatios || {}).filter(Boolean);
                const regionTargets = regionKeys.length > 0
                    ? allocateRatio(genderTarget, config.regionRatios, regionKeys)
                    : new Map([['ALL', genderTarget]]);

                for (const [region, regionTarget] of regionTargets.entries()) {
                    const selected = allocateForQuota({
                        event: cap.event,
                        poolName,
                        gender,
                        region,
                        target: regionTarget,
                        candidates,
                        selectedIds,
                        inventory,
                        logs,
                    });
                    winners.push(...selected.map((item) => ({
                        ...item,
                        quotaPath: { event: cap.event, pool: poolName, gender, region },
                    })));
                    eventSelected += selected.length;
                }
            }
        }

        quotaBreakdown.push({
            event: cap.event,
            targetCount: cap.targetCount,
            directCount,
            lotterySlots,
            candidateCount: eventCandidates.length,
            performanceTarget,
            generalTarget,
            winners: eventSelected,
        });
    }

    const winnerIds = new Set(winners.map((winner) => winner.id));
    const losers = candidates
        .filter((candidate) => !winnerIds.has(candidate.id))
        .map((candidate) => ({
            ...candidate,
            quotaPath: { event: candidate.event, pool: candidate.isPerformance ? 'performance' : 'general' },
            reason: 'not_selected',
        }));

    return { winners, losers, logs, quotaBreakdown };
}

function buildSummary({ winners, losers, waitlist, directReservations, quotaBreakdown, directErrors, logs, inventoryStart, inventoryEnd, blockers }) {
    const winnerGender = {};
    const winnerRegion = {};
    const apparelConsumed = {};
    for (const winner of winners) {
        winnerGender[winner.gender] = Number(winnerGender[winner.gender] || 0) + 1;
        winnerRegion[winner.region] = Number(winnerRegion[winner.region] || 0) + 1;
        apparelConsumed[winner.apparelBucket] = Number(apparelConsumed[winner.apparelBucket] || 0) + 1;
    }
    return {
        winners: winners.length,
        losers: losers.length,
        waitlist: waitlist.length,
        directReservations: directReservations.length,
        directErrors: directErrors.length,
        blockers: blockers.length,
        performanceWinners: winners.filter((item) => item.isPerformance).length,
        winnerGender,
        winnerRegion,
        apparelConsumed,
        quotaBreakdown,
        fallbackLogs: logs,
        inventoryStart: Object.fromEntries(inventoryStart.entries()),
        inventoryEnd: Object.fromEntries(inventoryEnd.entries()),
    };
}

export async function createPreview(orgId, raceId) {
    return knex.transaction(async (trx) => {
        await lockLotteryMutation(orgId, raceId, trx);
        await assertNoLotteryV1Snapshot(orgId, raceId, trx);
        await assertNoFinalizedLotteryV2(orgId, raceId, trx);
        const { config, capacities, limits, lists, records } = await readBaseData(orgId, raceId, trx);
        const configHash = stableHash(config);
        const sourceFingerprint = buildSourceFingerprint({ capacities, limits, lists, records });
        const { buckets, details } = buildInventoryBuckets(limits, config);
        const inventoryStart = new Map(buckets);
        const inventoryWorking = new Map(buckets);

        const directRecords = records.filter(isDirectRecord);
        const { reservations: directReservations, errors: directErrors } = buildDirectReservations(
            directRecords,
            inventoryWorking,
            config,
        );
        const { candidates, waitlist, blockers } = buildCandidateRows(records, inventoryWorking, config);

        const warnings = [];
        if (blockers.length > 0) {
            warnings.push(`存在 ${blockers.length} 条复核/阻断记录，已排除出 V2 抽签候选池。`);
        }

        const { winners, losers, logs, quotaBreakdown } = directErrors.length > 0
            ? { winners: [], losers: candidates, logs: [], quotaBreakdown: [] }
            : buildQuotaPlan({
                capacities,
                directReservations,
                candidates,
                config,
                inventory: inventoryWorking,
            });

        const summary = buildSummary({
            winners,
            losers,
            waitlist,
            directReservations,
            quotaBreakdown,
            directErrors,
            logs,
            inventoryStart,
            inventoryEnd: inventoryWorking,
            blockers,
        });

        await markReadySnapshotsStale(orgId, raceId, trx);

        const payload = {
            version: 1,
            meta: {
                configHash,
                sourceFingerprint,
                generatedAt: new Date().toISOString(),
            },
            config,
            inventory: { details, start: Object.fromEntries(inventoryStart.entries()), end: Object.fromEntries(inventoryWorking.entries()) },
            directReservations,
            blockers,
            winners,
            losers,
            waitlist,
            fallbackLogs: logs,
            quotaBreakdown,
        };
        const errors = directErrors;
        const status = errors.length > 0 ? 'blocked' : 'ready';
        const [snapshot] = await trx('lottery_v2_snapshots')
            .insert({
                org_id: orgId,
                race_id: raceId,
                status,
                config_hash: configHash,
                seed: config.seed || '',
                payload: JSON.stringify(payload),
                errors: JSON.stringify(errors),
                warnings: JSON.stringify(warnings),
                result_summary: JSON.stringify(summary),
            })
            .returning('*');

        return fromSnapshotRow(snapshot);
    });
}

function fromSnapshotRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        orgId: row.org_id,
        raceId: Number(row.race_id),
        status: row.status,
        configHash: row.config_hash,
        seed: row.seed,
        payload: deserializeJson(row.payload, {}),
        errors: deserializeJson(row.errors, []),
        warnings: deserializeJson(row.warnings, []),
        resultSummary: deserializeJson(row.result_summary, {}),
        createdAt: row.created_at,
        finalizedAt: row.finalized_at,
        rolledBackAt: row.rolled_back_at,
        updatedAt: row.updated_at,
    };
}

export async function getLatestPreview(orgId, raceId) {
    const row = await knex('lottery_v2_snapshots')
        .where({ org_id: orgId, race_id: raceId })
        .orderBy('created_at', 'desc')
        .first();
    return fromSnapshotRow(row);
}

export async function finalizeLatestPreview(orgId, raceId) {
    let staleSnapshotId = null;
    try {
        return await knex.transaction(async (trx) => {
            await lockLotteryMutation(orgId, raceId, trx);
            await assertNoLotteryV1Snapshot(orgId, raceId, trx);
            await assertNoFinalizedLotteryV2(orgId, raceId, trx);
            const snapshotRow = await trx('lottery_v2_snapshots')
                .where({ org_id: orgId, race_id: raceId })
                .orderBy('created_at', 'desc')
                .forUpdate()
                .first();
            if (!snapshotRow) {
                throw Object.assign(new Error('没有可执行的 Lottery V2 预演快照，请先生成预演。'), { status: 409, expose: true });
            }

            const snapshot = fromSnapshotRow(snapshotRow);
            if (snapshot.status !== 'ready') {
                throw Object.assign(new Error(`最新 V2 预演状态为 ${snapshot.status}，请先重新预演。`), { status: 409, expose: true });
            }

            const currentData = await readBaseData(orgId, raceId, trx);
            const currentConfigHash = stableHash(currentData.config);
            const currentSourceFingerprint = buildSourceFingerprint({
                capacities: currentData.capacities,
                limits: currentData.limits,
                lists: currentData.lists,
                records: currentData.records,
            });
            const snapshotMeta = snapshot.payload?.meta || {};
            const expectedConfigHash = snapshot.configHash || snapshotMeta.configHash || '';
            const expectedSourceFingerprint = snapshotMeta.sourceFingerprint || '';
            if (expectedConfigHash !== currentConfigHash || expectedSourceFingerprint !== currentSourceFingerprint) {
                staleSnapshotId = snapshot.id;
                throw Object.assign(new Error('预演快照已失效（配置或候选数据发生变化），请重新预演后再执行。'), { status: 409, expose: true, code: 'SNAPSHOT_STALE' });
            }

            const payload = snapshot.payload || {};
            const winners = Array.isArray(payload.winners) ? payload.winners : [];
            const losers = Array.isArray(payload.losers) ? payload.losers : [];
            const waitlist = Array.isArray(payload.waitlist) ? payload.waitlist : [];
            const directReservations = Array.isArray(payload.directReservations) ? payload.directReservations : [];

            const changedIds = [...new Set([...winners.map((item) => item.id), ...losers.map((item) => item.id)])];
            const preRows = changedIds.length > 0
                ? await trx('records')
                    .where({ org_id: orgId, race_id: raceId })
                    .whereIn('id', changedIds)
                    .select('id', 'lottery_status')
                : [];
            const preStatuses = preRows.map((row) => ({ recordId: Number(row.id), lotteryStatus: row.lottery_status || null }));

            const resultRows = [];
            let drawOrder = 0;
            for (const winner of winners) {
                drawOrder += 1;
                resultRows.push({
                    org_id: orgId,
                    race_id: raceId,
                    snapshot_id: snapshot.id,
                    record_id: winner.id,
                    result_status: 'winner',
                    bucket_name: `${winner.event}/${winner.isPerformance ? 'performance' : 'general'}`,
                    draw_order: drawOrder,
                    apparel_bucket: winner.apparelBucket,
                    quota_path: JSON.stringify(winner.quotaPath || {}),
                    reason: winner.fallbackLabel || '',
                });
            }
            for (const loser of losers) {
                drawOrder += 1;
                resultRows.push({
                    org_id: orgId,
                    race_id: raceId,
                    snapshot_id: snapshot.id,
                    record_id: loser.id,
                    result_status: 'loser',
                    bucket_name: `${loser.event}/${loser.isPerformance ? 'performance' : 'general'}`,
                    draw_order: drawOrder,
                    apparel_bucket: loser.apparelBucket,
                    quota_path: JSON.stringify(loser.quotaPath || {}),
                    reason: loser.reason || 'not_selected',
                });
            }
            for (const item of waitlist) {
                drawOrder += 1;
                resultRows.push({
                    org_id: orgId,
                    race_id: raceId,
                    snapshot_id: snapshot.id,
                    record_id: item.recordId,
                    result_status: 'waitlist',
                    bucket_name: 'excluded',
                    draw_order: drawOrder,
                    apparel_bucket: item.apparelBucket || '',
                    quota_path: JSON.stringify({}),
                    reason: item.reason || 'excluded',
                });
            }

            for (let i = 0; i < resultRows.length; i += BATCH_SIZE) {
                await trx('lottery_v2_results').insert(resultRows.slice(i, i + BATCH_SIZE));
            }

            const reservationRows = [
                ...directReservations.map((item) => ({
                    org_id: orgId,
                    race_id: raceId,
                    snapshot_id: snapshot.id,
                    record_id: item.recordId,
                    reservation_type: 'direct',
                    event: item.event,
                    gender_bucket: item.genderBucket,
                    size: item.size,
                    apparel_bucket: item.apparelBucket,
                    quantity: 1,
                    source: item.source || 'lottery_v2_direct',
                })),
                ...winners.map((item) => ({
                    org_id: orgId,
                    race_id: raceId,
                    snapshot_id: snapshot.id,
                    record_id: item.id,
                    reservation_type: 'lottery',
                    event: item.event,
                    gender_bucket: item.gender,
                    size: item.size,
                    apparel_bucket: item.apparelBucket,
                    quantity: 1,
                    source: 'lottery_v2',
                })),
            ];
            for (let i = 0; i < reservationRows.length; i += BATCH_SIZE) {
                await trx('apparel_reservations').insert(reservationRows.slice(i, i + BATCH_SIZE));
            }

            for (let i = 0; i < winners.length; i += BATCH_SIZE) {
                const ids = winners.slice(i, i + BATCH_SIZE).map((item) => item.id);
                if (ids.length) {
                    await trx('records')
                        .where({ org_id: orgId, race_id: raceId })
                        .whereIn('id', ids)
                        .update({ lottery_status: '中签', updated_at: trx.fn.now() });
                }
            }
            for (let i = 0; i < losers.length; i += BATCH_SIZE) {
                const ids = losers.slice(i, i + BATCH_SIZE).map((item) => item.id);
                if (ids.length) {
                    await trx('records')
                        .where({ org_id: orgId, race_id: raceId })
                        .whereIn('id', ids)
                        .update({ lottery_status: '未中签', updated_at: trx.fn.now() });
                }
            }

            const finalPayload = { ...payload, preStatuses };
            const resultSummary = {
                ...(snapshot.resultSummary || {}),
                finalized: true,
                snapshotId: snapshot.id,
            };
            const [updated] = await trx('lottery_v2_snapshots')
                .where({ id: snapshot.id, org_id: orgId })
                .update({
                    status: 'finalized',
                    finalized_at: trx.fn.now(),
                    payload: JSON.stringify(finalPayload),
                    result_summary: JSON.stringify(resultSummary),
                    updated_at: trx.fn.now(),
                })
                .returning('*');

            return fromSnapshotRow(updated);
        });
    } catch (error) {
        if (error?.code === 'SNAPSHOT_STALE' && staleSnapshotId) {
            await knex('lottery_v2_snapshots')
                .where({ id: staleSnapshotId, org_id: orgId, status: 'ready' })
                .update({ status: 'stale', updated_at: knex.fn.now() });
        }
        throw error;
    }
}

export async function getResults(orgId, raceId) {
    const snapshot = await knex('lottery_v2_snapshots')
        .where({ org_id: orgId, race_id: raceId, status: 'finalized' })
        .orderBy('finalized_at', 'desc')
        .first()
        .then((row) => fromSnapshotRow(row))
        .then((row) => row || getLatestPreview(orgId, raceId));
    const snapshotId = snapshot?.id || null;
    const rows = snapshotId
        ? await knex('lottery_v2_results')
            .where({ org_id: orgId, race_id: raceId, snapshot_id: snapshotId })
            .orderBy('draw_order', 'asc')
        : [];
    const reservations = snapshotId
        ? await knex('apparel_reservations')
            .where({ org_id: orgId, race_id: raceId, snapshot_id: snapshotId })
            .select('apparel_bucket')
            .sum('quantity as quantity')
            .groupBy('apparel_bucket')
            .orderBy('apparel_bucket')
        : [];
    return {
        snapshot,
        counts: {
            winners: rows.filter((row) => row.result_status === 'winner').length,
            losers: rows.filter((row) => row.result_status === 'loser').length,
            waitlist: rows.filter((row) => row.result_status === 'waitlist').length,
        },
        apparelReservations: reservations.map((row) => ({
            apparelBucket: row.apparel_bucket,
            quantity: Number(row.quantity || 0),
        })),
        results: rows.map((row) => ({
            id: Number(row.id),
            snapshotId: row.snapshot_id,
            recordId: Number(row.record_id),
            resultStatus: row.result_status,
            bucketName: row.bucket_name,
            drawOrder: Number(row.draw_order),
            apparelBucket: row.apparel_bucket,
            quotaPath: deserializeJson(row.quota_path, {}),
            reason: row.reason,
            createdAt: row.created_at,
        })),
    };
}

export async function rollbackLatest(orgId, raceId) {
    return knex.transaction(async (trx) => {
        await lockLotteryMutation(orgId, raceId, trx);
        await assertNoActiveLotteryJob(orgId, raceId, trx);
        const snapshotRow = await trx('lottery_v2_snapshots')
            .where({ org_id: orgId, race_id: raceId, status: 'finalized' })
            .orderBy('finalized_at', 'desc')
            .forUpdate()
            .first();
        if (!snapshotRow) {
            throw Object.assign(new Error('没有可回滚的 Lottery V2 执行结果。'), { status: 409, expose: true });
        }
        const snapshot = fromSnapshotRow(snapshotRow);
        const preStatuses = Array.isArray(snapshot.payload?.preStatuses) ? snapshot.payload.preStatuses : [];
        for (const item of preStatuses) {
            await trx('records')
                .where({ org_id: orgId, race_id: raceId, id: item.recordId })
                .update({ lottery_status: item.lotteryStatus, updated_at: trx.fn.now() });
        }
        await trx('lottery_v2_results').where({ org_id: orgId, race_id: raceId, snapshot_id: snapshot.id }).del();
        await trx('apparel_reservations').where({ org_id: orgId, race_id: raceId, snapshot_id: snapshot.id }).del();
        const [updated] = await trx('lottery_v2_snapshots')
            .where({ id: snapshot.id, org_id: orgId })
            .update({ status: 'rolled_back', rolled_back_at: trx.fn.now(), updated_at: trx.fn.now() })
            .returning('*');
        return fromSnapshotRow(updated);
    });
}

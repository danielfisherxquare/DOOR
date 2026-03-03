#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

import knex from '../src/db/knex.js';
import { raceMapper } from '../src/db/mappers/races.js';
import { recordMapper } from '../src/db/mappers/records.js';
import { columnMappingMapper } from '../src/db/mappers/column-mappings.js';
import {
    raceCapacityMapper,
    lotteryConfigMapper,
    lotteryListMapper,
    lotteryRuleMapper,
    lotteryWeightMapper,
} from '../src/db/mappers/lottery.js';
import { clothingLimitMapper } from '../src/db/mappers/clothing.js';
import { startZoneMapper, performanceRuleMapper } from '../src/db/mappers/pipeline.js';
import { lotteryResultMapper } from '../src/db/mappers/lottery-results.js';
import { bibAssignmentMapper } from '../src/db/mappers/bib.js';
import { openSqliteSnapshot } from './lib/sqlite-reader.mjs';
import {
    addMigrationError,
    addMigrationWarning,
    createMigrationReport,
    finalizeMigrationReport,
    setMigrationCount,
    writeMigrationReport,
} from './lib/migration-report.mjs';

const SOURCE_TABLES = [
    'races',
    'records',
    'lottery_configs',
    'lottery_lists',
    'clothing_limits',
    'lottery_rules',
    'race_capacity',
    'start_zones',
    'performance_rules',
    'column_mappings',
    'lottery_weights',
];

const TARGET_TABLES = [
    'races',
    'records',
    'column_mappings',
    'lottery_configs',
    'lottery_lists',
    'clothing_limits',
    'lottery_rules',
    'race_capacity',
    'start_zones',
    'performance_rules',
    'lottery_weights',
    'lottery_results',
    'bib_assignments',
];

const DERIVED_LOTTERY_STATUS_MAP = new Map([
    ['中签', 'winner'],
    ['未中签', 'loser'],
    ['候补', 'waitlist'],
    ['候补中签', 'waitlist'],
    ['waitlist', 'waitlist'],
    ['winner', 'winner'],
    ['loser', 'loser'],
]);

function parseArgs(argv) {
    const args = {
        manifest: 'scripts/migration-manifest.json',
        org: 'all',
        mode: 'dry-run',
        reportDir: 'reports/migration',
    };

    for (let index = 2; index < argv.length; index += 1) {
        const arg = argv[index];
        if (!arg.startsWith('--')) continue;
        const key = arg.slice(2);
        const value = argv[index + 1];
        if (value == null || value.startsWith('--')) {
            args[key] = true;
            continue;
        }
        args[key] = value;
        index += 1;
    }

    return args;
}

async function loadManifest(manifestPath) {
    const resolved = path.resolve(manifestPath);
    const raw = await fs.readFile(resolved, 'utf8');
    const parsed = JSON.parse(raw);
    const organizations = Array.isArray(parsed) ? parsed : parsed.organizations;

    if (!Array.isArray(organizations)) {
        throw new Error(`Invalid manifest format: ${resolved}`);
    }

    return organizations.map((entry) => ({
        orgId: String(entry.orgId),
        orgSlug: String(entry.orgSlug),
        sqlitePath: String(entry.sqlitePath),
        displayName: String(entry.displayName ?? entry.orgSlug),
    }));
}

function selectOrganizations(entries, orgSelector) {
    if (!orgSelector || orgSelector === 'all') return entries;
    return entries.filter((entry) => entry.orgSlug === orgSelector);
}

function parseJsonish(value, fallback) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function requireJsonish(value, label) {
    if (value == null || value === '') {
        throw new Error(`${label} is empty`);
    }
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') {
        throw new Error(`${label} is not valid JSON`);
    }
    try {
        return JSON.parse(value);
    } catch (error) {
        throw new Error(`${label} JSON parse failed: ${error.message}`);
    }
}

function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function toNullableNumber(value, fallback = null) {
    if (value == null || value === '') return fallback;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeTimestamp(value) {
    if (!value) return new Date().toISOString();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeDateText(value) {
    const raw = String(value ?? '').trim();
    if (!raw) {
        throw new Error('Race date is empty');
    }

    const normalized = raw
        .replace(/[./年]/g, '-')
        .replace(/[月]/g, '-')
        .replace(/[日]/g, '')
        .trim();

    const direct = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (direct) {
        const [, year, month, day] = direct;
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }

    throw new Error(`Unable to normalize race date: ${raw}`);
}

function nonEmptyText(value, fallback = '') {
    if (value == null) return fallback;
    return String(value);
}

function prepareRaceRow(sourceRow, orgId) {
    return {
        orgId,
        name: nonEmptyText(sourceRow.name),
        date: normalizeDateText(sourceRow.date),
        location: nonEmptyText(sourceRow.location),
        events: parseJsonish(sourceRow.events, []),
        conflictRule: sourceRow.conflictRule === 'permissive' ? 'permissive' : 'strict',
        locationLat: toNullableNumber(sourceRow.locationLat),
        locationLng: toNullableNumber(sourceRow.locationLng),
        routeData: sourceRow.routeData ? String(sourceRow.routeData) : null,
        mapFeaturesData: sourceRow.mapFeaturesData ? String(sourceRow.mapFeaturesData) : null,
        createdAt: normalizeTimestamp(sourceRow.createAt ?? sourceRow.createdAt),
        updatedAt: normalizeTimestamp(sourceRow.updatedAt ?? sourceRow.createAt ?? sourceRow.createdAt),
    };
}

function prepareRecordRow(sourceRow, orgId, raceIdMap) {
    const sourceRaceId = Number(sourceRow.raceId);
    const raceId = raceIdMap.get(sourceRaceId);
    if (!raceId) {
        throw new Error(`Missing race mapping for record ${sourceRow.id} -> race ${sourceRaceId}`);
    }

    return {
        orgId,
        raceId,
        name: nonEmptyText(sourceRow.name),
        namePinyin: nonEmptyText(sourceRow.namePinyin),
        phone: nonEmptyText(sourceRow.phone),
        country: nonEmptyText(sourceRow.country),
        idType: nonEmptyText(sourceRow.idType),
        idNumber: nonEmptyText(sourceRow.idNumber),
        gender: nonEmptyText(sourceRow.gender),
        age: nonEmptyText(sourceRow.age),
        birthday: nonEmptyText(sourceRow.birthday),
        event: nonEmptyText(sourceRow.event),
        source: nonEmptyText(sourceRow.source),
        clothingSize: nonEmptyText(sourceRow.clothingSize),
        province: nonEmptyText(sourceRow.province),
        city: nonEmptyText(sourceRow.city),
        district: nonEmptyText(sourceRow.district),
        address: nonEmptyText(sourceRow.address),
        email: nonEmptyText(sourceRow.email),
        emergencyName: nonEmptyText(sourceRow.emergencyName),
        emergencyPhone: nonEmptyText(sourceRow.emergencyPhone),
        bloodType: nonEmptyText(sourceRow.bloodType),
        orderGroupId: nonEmptyText(sourceRow.orderGroupId),
        paymentStatus: nonEmptyText(sourceRow.paymentStatus),
        mark: nonEmptyText(sourceRow.mark),
        lotteryStatus: sourceRow.lotteryStatus ? String(sourceRow.lotteryStatus) : null,
        personalBestFull: parseJsonish(sourceRow.personalBestFull, null),
        personalBestHalf: parseJsonish(sourceRow.personalBestHalf, null),
        lotteryZone: sourceRow.lotteryZone ? String(sourceRow.lotteryZone) : null,
        bagWindowNo: sourceRow.bagWindowNo ? String(sourceRow.bagWindowNo) : null,
        bagNo: sourceRow.bagNo ? String(sourceRow.bagNo) : null,
        expoWindowNo: sourceRow.expoWindowNo ? String(sourceRow.expoWindowNo) : null,
        bibNumber: sourceRow.bibNumber ? String(sourceRow.bibNumber) : null,
        bibColor: sourceRow.bibColor ? String(sourceRow.bibColor) : null,
        _source: nonEmptyText(sourceRow._source),
        _importedAt: normalizeTimestamp(sourceRow._importedAt),
        runnerCategory: sourceRow.runnerCategory ? String(sourceRow.runnerCategory) : null,
        auditStatus: sourceRow.auditStatus ? String(sourceRow.auditStatus) : null,
        rejectReason: sourceRow.rejectReason ? String(sourceRow.rejectReason) : null,
        isLocked: toNumber(sourceRow.isLocked, 0),
        regionType: sourceRow.regionType ? String(sourceRow.regionType) : null,
        duplicateCount: toNumber(sourceRow.duplicateCount, 0),
        duplicateSources: sourceRow.duplicateSources ? String(sourceRow.duplicateSources) : null,
        createdAt: normalizeTimestamp(sourceRow.createdAt ?? sourceRow._importedAt),
        updatedAt: normalizeTimestamp(sourceRow.updatedAt ?? sourceRow.createdAt ?? sourceRow._importedAt),
    };
}

function prepareColumnMappings(rows, orgId, report) {
    const deduped = new Map();

    for (const row of rows) {
        const sourceColumn = nonEmptyText(row.sourceColumn);
        const current = deduped.get(sourceColumn);
        const currentUpdatedAt = current ? normalizeTimestamp(current.updatedAt) : '';
        const candidateUpdatedAt = normalizeTimestamp(row.updatedAt);

        if (!current || candidateUpdatedAt >= currentUpdatedAt) {
            deduped.set(sourceColumn, {
                orgId,
                sourceColumn,
                targetFieldId: nonEmptyText(row.targetFieldId),
                updatedAt: candidateUpdatedAt,
            });
        }
    }

    if (deduped.size !== rows.length) {
        addMigrationWarning(report, 'column_mappings contained duplicate sourceColumn rows; kept latest updatedAt entry', {
            sourceCount: rows.length,
            dedupedCount: deduped.size,
        });
    }

    return [...deduped.values()];
}

function prepareLotteryConfigRow(sourceRow, orgId, raceIdMap) {
    return {
        orgId,
        raceId: raceIdMap.get(Number(sourceRow.raceId)),
        zone: sourceRow.zone ? String(sourceRow.zone) : null,
        eventType: sourceRow.eventType ? String(sourceRow.eventType) : null,
        capacity: toNumber(sourceRow.capacity, 0),
        rules: parseJsonish(sourceRow.rules, []),
        calcType: sourceRow.calcType === 'auto' ? 'auto' : 'manual',
        length: toNumber(sourceRow.length, 0),
        width: toNumber(sourceRow.width, 0),
        color: nonEmptyText(sourceRow.color, '#3B82F6'),
        designCapacity: toNumber(sourceRow.designCapacity, 0),
        intervalGap: toNumber(sourceRow.intervalGap, 0),
        createdAt: normalizeTimestamp(sourceRow.createdAt),
        updatedAt: normalizeTimestamp(sourceRow.updatedAt ?? sourceRow.createdAt),
    };
}

function prepareLotteryListRow(sourceRow, orgId, raceIdMap, recordIdMap, report) {
    const matchedSourceRecordId = toNullableNumber(sourceRow.matchedRecordId);
    const matchedRecordId = matchedSourceRecordId == null ? null : recordIdMap.get(matchedSourceRecordId) ?? null;

    if (matchedSourceRecordId != null && matchedRecordId == null) {
        addMigrationWarning(report, 'lottery_lists.matchedRecordId could not be mapped and was cleared', {
            sourceRowId: sourceRow.id,
            matchedSourceRecordId,
        });
    }

    return {
        orgId,
        raceId: raceIdMap.get(Number(sourceRow.raceId)),
        listType: sourceRow.listType === 'blacklist' ? 'blacklist' : 'whitelist',
        name: nonEmptyText(sourceRow.name),
        idNumber: nonEmptyText(sourceRow.idNumber),
        phone: nonEmptyText(sourceRow.phone),
        matchedRecordId,
        matchType: sourceRow.matchType ? String(sourceRow.matchType) : null,
        createdAt: normalizeTimestamp(sourceRow.createdAt),
    };
}

function prepareClothingLimitRow(sourceRow, orgId, raceIdMap) {
    return {
        orgId,
        raceId: raceIdMap.get(Number(sourceRow.raceId)),
        event: nonEmptyText(sourceRow.event),
        gender: nonEmptyText(sourceRow.gender),
        size: nonEmptyText(sourceRow.size),
        totalInventory: toNumber(sourceRow.totalInventory, 0),
        usedCount: toNumber(sourceRow.usedCount, 0),
        createdAt: normalizeTimestamp(sourceRow.createdAt),
        updatedAt: normalizeTimestamp(sourceRow.updatedAt ?? sourceRow.createdAt),
    };
}

function prepareLotteryRuleRow(sourceRow, orgId, raceIdMap) {
    return {
        orgId,
        raceId: raceIdMap.get(Number(sourceRow.raceId)),
        targetGroup: nonEmptyText(sourceRow.targetGroup),
        targetCount: toNumber(sourceRow.targetCount, 0),
        drawRatio: toNumber(sourceRow.drawRatio, 0.85),
        reservedRatio: toNumber(sourceRow.reservedRatio, 0.15),
        genderRatio: nonEmptyText(sourceRow.genderRatio),
        regionRatio: nonEmptyText(sourceRow.regionRatio),
        createdAt: normalizeTimestamp(sourceRow.createdAt),
        updatedAt: normalizeTimestamp(sourceRow.updatedAt ?? sourceRow.createdAt),
    };
}

function prepareRaceCapacityRow(sourceRow, orgId, raceIdMap) {
    return {
        orgId,
        raceId: raceIdMap.get(Number(sourceRow.raceId)),
        event: nonEmptyText(sourceRow.event),
        targetCount: toNumber(sourceRow.targetCount, 0),
        drawRatio: toNumber(sourceRow.drawRatio, 0.85),
        reservedRatio: toNumber(sourceRow.reservedRatio, 0.15),
        createdAt: normalizeTimestamp(sourceRow.createdAt),
        updatedAt: normalizeTimestamp(sourceRow.updatedAt ?? sourceRow.createdAt),
    };
}

function prepareStartZoneRow(sourceRow, orgId, raceIdMap) {
    return {
        orgId,
        raceId: raceIdMap.get(Number(sourceRow.raceId)),
        zoneName: nonEmptyText(sourceRow.zoneName),
        width: toNumber(sourceRow.width, 10),
        length: toNumber(sourceRow.length, 20),
        density: toNumber(sourceRow.density, 2.5),
        calculatedCapacity: toNumber(sourceRow.calculatedCapacity, 0),
        color: nonEmptyText(sourceRow.color, '#3B82F6'),
        sortOrder: toNumber(sourceRow.sortOrder, 0),
        gapDistance: toNumber(sourceRow.gapDistance, 0),
        event: nonEmptyText(sourceRow.event),
        capacityRatio: toNumber(sourceRow.capacityRatio, 1),
        scoreUpperSeconds: toNullableNumber(sourceRow.scoreUpperSeconds),
        createdAt: normalizeTimestamp(sourceRow.createdAt),
    };
}

function preparePerformanceRuleRow(sourceRow, orgId, raceIdMap) {
    return {
        orgId,
        raceId: raceIdMap.get(Number(sourceRow.raceId)),
        event: nonEmptyText(sourceRow.event),
        minTime: nonEmptyText(sourceRow.minTime),
        maxTime: nonEmptyText(sourceRow.maxTime),
        priorityRatio: toNumber(sourceRow.priorityRatio, 0.6),
        createdAt: normalizeTimestamp(sourceRow.createdAt),
    };
}

function prepareLotteryWeightRow(sourceRow, orgId, raceIdMap) {
    return {
        orgId,
        raceId: raceIdMap.get(Number(sourceRow.raceId)),
        targetGroup: nonEmptyText(sourceRow.targetGroup, 'ALL'),
        weightType: nonEmptyText(sourceRow.weightType, 'gender'),
        enabled: toNumber(sourceRow.enabled, 0),
        weightConfig: requireJsonish(sourceRow.weightConfig, 'lottery_weights.weightConfig'),
        priority: toNumber(sourceRow.priority, 0),
        createdAt: normalizeTimestamp(sourceRow.createdAt),
        updatedAt: normalizeTimestamp(sourceRow.updatedAt ?? sourceRow.createdAt),
    };
}

function buildDerivedRows(recordRows, orgId, raceIdMap, recordIdMap, report) {
    const lotteryResults = [];
    const bibAssignments = [];

    for (const sourceRow of recordRows) {
        const targetRecordId = recordIdMap.get(Number(sourceRow.id));
        const targetRaceId = raceIdMap.get(Number(sourceRow.raceId));
        if (!targetRecordId || !targetRaceId) continue;

        const rawLotteryStatus = sourceRow.lotteryStatus ? String(sourceRow.lotteryStatus).trim() : '';
        const resultStatus = DERIVED_LOTTERY_STATUS_MAP.get(rawLotteryStatus);

        if (rawLotteryStatus && !resultStatus) {
            addMigrationWarning(report, 'Skipped unsupported historical lottery status when deriving lottery_results', {
                sourceRecordId: sourceRow.id,
                lotteryStatus: rawLotteryStatus,
            });
        }

        if (resultStatus) {
            lotteryResults.push({
                orgId,
                raceId: targetRaceId,
                recordId: targetRecordId,
                resultStatus,
                bucketName: '',
                drawOrder: 0,
            });
        }

        const bibNumber = sourceRow.bibNumber ? String(sourceRow.bibNumber).trim() : '';
        if (bibNumber) {
            bibAssignments.push({
                orgId,
                raceId: targetRaceId,
                recordId: targetRecordId,
                bibNumber,
            });
        }
    }

    return { lotteryResults, bibAssignments };
}

async function validateOrganizationPreconditions(entry, reader) {
    const org = await knex('organizations')
        .select(['id', 'slug', 'name'])
        .where({ id: entry.orgId })
        .first();

    if (!org) {
        throw new Error(`Organization ${entry.orgId} does not exist in PostgreSQL`);
    }

    if (org.slug !== entry.orgSlug) {
        throw new Error(`Manifest orgSlug mismatch: expected ${org.slug}, got ${entry.orgSlug}`);
    }

    const missingTables = SOURCE_TABLES.filter((table) => !reader.tableExists(table));
    if (missingTables.length) {
        throw new Error(`SQLite source is missing required tables: ${missingTables.join(', ')}`);
    }

    const existingCounts = {};
    for (const table of TARGET_TABLES) {
        existingCounts[table] = Number(
            (await knex(table).where({ org_id: entry.orgId }).count({ count: '*' }).first())?.count ?? 0,
        );
    }

    const occupiedTables = Object.entries(existingCounts)
        .filter(([, count]) => Number(count) > 0)
        .map(([table, count]) => ({ table, count }));

    if (occupiedTables.length) {
        throw new Error(`Target org already has migrated data: ${JSON.stringify(occupiedTables)}`);
    }
}

async function insertWithTimestamps(trx, table, payload, mapperResult, sourceRow, sourceTimestampMap = {}) {
    const row = { ...mapperResult };
    if (sourceTimestampMap.createdAt) row.created_at = sourceTimestampMap.createdAt(sourceRow);
    if (sourceTimestampMap.updatedAt) row.updated_at = sourceTimestampMap.updatedAt(sourceRow);
    const [inserted] = await trx(table).insert(row).returning(['id']);
    return Number(inserted.id);
}

async function migrateOrganization(entry, mode, reportDir) {
    const report = createMigrationReport(entry, mode);
    const reader = await openSqliteSnapshot(entry.sqlitePath);

    try {
        await validateOrganizationPreconditions(entry, reader);

        for (const table of SOURCE_TABLES) {
            setMigrationCount(report, 'source', table, reader.count(table));
        }

        const sourceRaces = reader.selectAll('races', { orderBy: 'id ASC' });
        const sourceRecords = reader.selectAll('records', { orderBy: 'id ASC' });
        const sourceColumnMappings = reader.selectAll('column_mappings', { orderBy: 'updatedAt DESC, id DESC' });
        const sourceLotteryConfigs = reader.selectAll('lottery_configs', { orderBy: 'id ASC' });
        const sourceLotteryLists = reader.selectAll('lottery_lists', { orderBy: 'id ASC' });
        const sourceClothingLimits = reader.selectAll('clothing_limits', { orderBy: 'id ASC' });
        const sourceLotteryRules = reader.selectAll('lottery_rules', { orderBy: 'id ASC' });
        const sourceRaceCapacity = reader.selectAll('race_capacity', { orderBy: 'id ASC' });
        const sourceStartZones = reader.selectAll('start_zones', { orderBy: 'sortOrder ASC, zoneName ASC' });
        const sourcePerformanceRules = reader.selectAll('performance_rules', { orderBy: 'id ASC' });
        const sourceLotteryWeights = reader.selectAll('lottery_weights', { orderBy: 'priority DESC, weightType ASC' });

        const trx = await knex.transaction();
        try {
            const raceIdMap = new Map();
            const recordIdMap = new Map();

            for (const sourceRow of sourceRaces) {
                const prepared = prepareRaceRow(sourceRow, entry.orgId);
                const insertedId = await insertWithTimestamps(
                    trx,
                    'races',
                    prepared,
                    raceMapper.toDbInsert(prepared),
                    sourceRow,
                    {
                        createdAt: (row) => normalizeTimestamp(row.createAt ?? row.createdAt),
                        updatedAt: (row) => normalizeTimestamp(row.updatedAt ?? row.createAt ?? row.createdAt),
                    },
                );
                raceIdMap.set(Number(sourceRow.id), insertedId);
            }
            setMigrationCount(report, 'inserted', 'races', raceIdMap.size);

            for (const sourceRow of sourceRecords) {
                const prepared = prepareRecordRow(sourceRow, entry.orgId, raceIdMap);
                const insertedId = await insertWithTimestamps(
                    trx,
                    'records',
                    prepared,
                    recordMapper.toDbInsert(prepared),
                    sourceRow,
                    {
                        createdAt: (row) => normalizeTimestamp(row.createdAt ?? row._importedAt),
                        updatedAt: (row) => normalizeTimestamp(row.updatedAt ?? row.createdAt ?? row._importedAt),
                    },
                );
                recordIdMap.set(Number(sourceRow.id), insertedId);
            }
            setMigrationCount(report, 'inserted', 'records', recordIdMap.size);

            const columnMappings = prepareColumnMappings(sourceColumnMappings, entry.orgId, report);
            for (const row of columnMappings) {
                await trx('column_mappings').insert({
                    ...columnMappingMapper.toDbInsert(row),
                    created_at: normalizeTimestamp(row.updatedAt),
                    updated_at: normalizeTimestamp(row.updatedAt),
                });
            }
            setMigrationCount(report, 'inserted', 'column_mappings', columnMappings.length);

            for (const sourceRow of sourceLotteryConfigs) {
                const prepared = prepareLotteryConfigRow(sourceRow, entry.orgId, raceIdMap);
                await trx('lottery_configs').insert({
                    ...lotteryConfigMapper.toDbInsert(prepared, entry.orgId),
                    created_at: normalizeTimestamp(sourceRow.createdAt),
                    updated_at: normalizeTimestamp(sourceRow.updatedAt ?? sourceRow.createdAt),
                });
            }
            setMigrationCount(report, 'inserted', 'lottery_configs', sourceLotteryConfigs.length);

            for (const sourceRow of sourceLotteryLists) {
                const prepared = prepareLotteryListRow(sourceRow, entry.orgId, raceIdMap, recordIdMap, report);
                await trx('lottery_lists').insert({
                    ...lotteryListMapper.toDbInsert(prepared, entry.orgId),
                    created_at: normalizeTimestamp(sourceRow.createdAt),
                });
            }
            setMigrationCount(report, 'inserted', 'lottery_lists', sourceLotteryLists.length);

            for (const sourceRow of sourceClothingLimits) {
                const prepared = prepareClothingLimitRow(sourceRow, entry.orgId, raceIdMap);
                await trx('clothing_limits').insert({
                    ...clothingLimitMapper.toDbInsert(prepared, entry.orgId),
                    created_at: normalizeTimestamp(sourceRow.createdAt),
                    updated_at: normalizeTimestamp(sourceRow.updatedAt ?? sourceRow.createdAt),
                });
            }
            setMigrationCount(report, 'inserted', 'clothing_limits', sourceClothingLimits.length);

            for (const sourceRow of sourceLotteryRules) {
                const prepared = prepareLotteryRuleRow(sourceRow, entry.orgId, raceIdMap);
                await trx('lottery_rules').insert({
                    ...lotteryRuleMapper.toDbInsert(prepared, entry.orgId),
                    created_at: normalizeTimestamp(sourceRow.createdAt),
                    updated_at: normalizeTimestamp(sourceRow.updatedAt ?? sourceRow.createdAt),
                });
            }
            setMigrationCount(report, 'inserted', 'lottery_rules', sourceLotteryRules.length);

            for (const sourceRow of sourceRaceCapacity) {
                const prepared = prepareRaceCapacityRow(sourceRow, entry.orgId, raceIdMap);
                await trx('race_capacity').insert({
                    ...raceCapacityMapper.toDbInsert(prepared, entry.orgId),
                    created_at: normalizeTimestamp(sourceRow.createdAt),
                    updated_at: normalizeTimestamp(sourceRow.updatedAt ?? sourceRow.createdAt),
                });
            }
            setMigrationCount(report, 'inserted', 'race_capacity', sourceRaceCapacity.length);

            for (const sourceRow of sourceStartZones) {
                const prepared = prepareStartZoneRow(sourceRow, entry.orgId, raceIdMap);
                await trx('start_zones').insert({
                    ...startZoneMapper.toDbInsert(prepared, entry.orgId),
                    created_at: normalizeTimestamp(sourceRow.createdAt),
                });
            }
            setMigrationCount(report, 'inserted', 'start_zones', sourceStartZones.length);

            for (const sourceRow of sourcePerformanceRules) {
                const prepared = preparePerformanceRuleRow(sourceRow, entry.orgId, raceIdMap);
                await trx('performance_rules').insert({
                    ...performanceRuleMapper.toDbInsert(prepared, entry.orgId),
                    created_at: normalizeTimestamp(sourceRow.createdAt),
                });
            }
            setMigrationCount(report, 'inserted', 'performance_rules', sourcePerformanceRules.length);

            for (const sourceRow of sourceLotteryWeights) {
                const prepared = prepareLotteryWeightRow(sourceRow, entry.orgId, raceIdMap);
                await trx('lottery_weights').insert({
                    ...lotteryWeightMapper.toDbInsert(prepared, entry.orgId),
                    created_at: normalizeTimestamp(sourceRow.createdAt),
                    updated_at: normalizeTimestamp(sourceRow.updatedAt ?? sourceRow.createdAt),
                });
            }
            setMigrationCount(report, 'inserted', 'lottery_weights', sourceLotteryWeights.length);

            const derived = buildDerivedRows(sourceRecords, entry.orgId, raceIdMap, recordIdMap, report);
            for (const row of derived.lotteryResults) {
                await trx('lottery_results').insert(lotteryResultMapper.toDbInsert(row, entry.orgId));
            }
            for (const row of derived.bibAssignments) {
                await trx('bib_assignments').insert(bibAssignmentMapper.toDbInsert(row, entry.orgId));
            }
            setMigrationCount(report, 'derived', 'lottery_results', derived.lotteryResults.length);
            setMigrationCount(report, 'derived', 'bib_assignments', derived.bibAssignments.length);

            if (mode === 'dry-run') {
                await trx.rollback();
                finalizeMigrationReport(report, report.warnings.length ? 'dry_run_with_warning' : 'dry_run_pass', {
                    rolledBack: true,
                });
            } else {
                await trx.commit();
                finalizeMigrationReport(report, report.warnings.length ? 'applied_with_warning' : 'applied', {
                    rolledBack: false,
                });
            }
        } catch (error) {
            await trx.rollback();
            throw error;
        }
    } catch (error) {
        addMigrationError(report, error.message, { stack: error.stack });
        finalizeMigrationReport(report, 'failed');
        throw error;
    } finally {
        const outputPath = path.join(reportDir, `${entry.orgSlug}-${mode}.json`);
        await writeMigrationReport(report, outputPath);
        await reader.close();
    }

    return report;
}

async function main() {
    const args = parseArgs(process.argv);
    if (!['dry-run', 'apply'].includes(args.mode)) {
        throw new Error(`Unsupported --mode: ${args.mode}`);
    }

    const manifestEntries = await loadManifest(args.manifest);
    const selectedEntries = selectOrganizations(manifestEntries, args.org);
    if (!selectedEntries.length) {
        throw new Error(`No organizations matched selector: ${args.org}`);
    }

    const reports = [];
    let failed = false;

    for (const entry of selectedEntries) {
        try {
            const report = await migrateOrganization(entry, args.mode, args.reportDir);
            reports.push(report);
            console.log(`[${entry.orgSlug}] ${report.status}`);
        } catch (error) {
            failed = true;
            console.error(`[${entry.orgSlug}] migration failed: ${error.message}`);
            if (args.mode === 'apply') break;
        }
    }

    console.log(`Processed ${reports.length}/${selectedEntries.length} organization(s).`);

    if (failed) {
        process.exitCode = 1;
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await knex.destroy();
    });

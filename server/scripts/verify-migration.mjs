#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

import knex from '../src/db/knex.js';
import { openSqliteSnapshot } from './lib/sqlite-reader.mjs';
import {
    addVerifyError,
    addVerifyWarning,
    createVerificationReport,
    finalizeVerificationReport,
    recordCountCheck,
    writeVerificationReport,
    writeVerificationSummary,
} from './lib/verify-report.mjs';

const COUNT_TABLES = [
    ['races', 'races'],
    ['records', 'records'],
    ['column_mappings', 'column_mappings'],
    ['lottery_configs', 'lottery_configs'],
    ['lottery_lists', 'lottery_lists'],
    ['clothing_limits', 'clothing_limits'],
    ['lottery_rules', 'lottery_rules'],
    ['race_capacity', 'race_capacity'],
    ['start_zones', 'start_zones'],
    ['performance_rules', 'performance_rules'],
    ['lottery_weights', 'lottery_weights'],
];

function parseArgs(argv) {
    const args = {
        manifest: 'scripts/migration-manifest.json',
        org: 'all',
        report: 'reports/verification',
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

function parseJsonish(value, fallback = null) {
    if (value == null || value === '') return fallback;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function canonicalJson(value) {
    if (value == null || value === '') return null;
    const materialized = typeof value === 'string' ? parseJsonish(value, value) : value;
    if (typeof materialized !== 'object' || materialized == null) return String(materialized);

    if (Array.isArray(materialized)) {
        return materialized.map(canonicalJson);
    }

    return Object.keys(materialized)
        .sort()
        .reduce((accumulator, key) => {
            accumulator[key] = canonicalJson(materialized[key]);
            return accumulator;
        }, {});
}

function normalizeDateText(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
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
    return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function dedupeColumnMappings(rows) {
    const deduped = new Map();
    for (const row of rows) {
        const current = deduped.get(String(row.sourceColumn));
        const currentUpdatedAt = current ? String(current.updatedAt ?? '') : '';
        const nextUpdatedAt = String(row.updatedAt ?? '');
        if (!current || nextUpdatedAt >= currentUpdatedAt) {
            deduped.set(String(row.sourceColumn), row);
        }
    }
    return [...deduped.values()];
}

function raceIdentity(row) {
    return `${String(row.name ?? '').trim()}::${normalizeDateText(row.date)}::${String(row.location ?? '').trim()}`;
}

function pairRaces(sourceRaces, targetRaces, report) {
    const sourceBuckets = new Map();
    const targetBuckets = new Map();

    for (const race of sourceRaces) {
        const key = raceIdentity(race);
        const bucket = sourceBuckets.get(key) ?? [];
        bucket.push(race);
        sourceBuckets.set(key, bucket);
    }
    for (const race of targetRaces) {
        const key = raceIdentity(race);
        const bucket = targetBuckets.get(key) ?? [];
        bucket.push(race);
        targetBuckets.set(key, bucket);
    }

    const mapping = new Map();
    for (const [key, sourceBucket] of sourceBuckets.entries()) {
        const targetBucket = targetBuckets.get(key) ?? [];
        if (targetBucket.length !== sourceBucket.length) {
            addVerifyError(report, 'Race identity count mismatch', {
                identity: key,
                sourceCount: sourceBucket.length,
                targetCount: targetBucket.length,
            });
            continue;
        }

        sourceBucket
            .sort((a, b) => Number(a.id) - Number(b.id))
            .forEach((sourceRace, index) => {
                const targetRace = targetBucket.sort((a, b) => Number(a.id) - Number(b.id))[index];
                mapping.set(Number(sourceRace.id), Number(targetRace.id));
            });
    }

    return mapping;
}

function groupCount(rows, keyBuilder) {
    const counts = new Map();
    for (const row of rows) {
        const key = keyBuilder(row);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
}

function compareCountMap(report, label, sourceMap, targetMap) {
    const keys = new Set([...sourceMap.keys(), ...targetMap.keys()]);
    for (const key of keys) {
        const source = sourceMap.get(key) ?? 0;
        const target = targetMap.get(key) ?? 0;
        const passed = source === target;
        report.aggregates.push({ label, key, source, target, passed });
        if (!passed) {
            addVerifyError(report, `${label} mismatch`, { key, source, target });
        }
    }
}

function normalizeSmallRows(table, rows) {
    switch (table) {
        case 'column_mappings':
            return dedupeColumnMappings(rows).map((row) => ({
                sourceColumn: String(row.sourceColumn),
                targetFieldId: String(row.targetFieldId),
            })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        case 'lottery_rules':
            return rows.map((row) => ({
                targetGroup: String(row.targetGroup),
                targetCount: toNumber(row.targetCount),
                drawRatio: toNumber(row.drawRatio),
                reservedRatio: toNumber(row.reservedRatio),
                genderRatio: String(row.genderRatio ?? ''),
                regionRatio: String(row.regionRatio ?? ''),
            })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        case 'lottery_weights':
            return rows.map((row) => ({
                targetGroup: String(row.targetGroup ?? 'ALL'),
                weightType: String(row.weightType ?? 'gender'),
                enabled: toNumber(row.enabled),
                weightConfig: canonicalJson(row.weightConfig),
                priority: toNumber(row.priority),
            })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        case 'race_capacity':
            return rows.map((row) => ({
                event: String(row.event),
                targetCount: toNumber(row.targetCount),
                drawRatio: toNumber(row.drawRatio),
                reservedRatio: toNumber(row.reservedRatio),
            })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        case 'start_zones':
            return rows.map((row) => ({
                zoneName: String(row.zoneName),
                width: toNumber(row.width),
                length: toNumber(row.length),
                density: toNumber(row.density),
                calculatedCapacity: toNumber(row.calculatedCapacity),
                color: String(row.color ?? ''),
                event: String(row.event ?? ''),
                capacityRatio: toNumber(row.capacityRatio, 1),
                sortOrder: toNumber(row.sortOrder),
                gapDistance: toNumber(row.gapDistance),
                scoreUpperSeconds: row.scoreUpperSeconds == null ? null : toNumber(row.scoreUpperSeconds),
            })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        default:
            return rows;
    }
}

function compareSmallTable(report, table, sourceRows, targetRows) {
    const normalizedSource = normalizeSmallRows(table, sourceRows);
    const normalizedTarget = normalizeSmallRows(table, targetRows);
    const passed = JSON.stringify(normalizedSource) === JSON.stringify(normalizedTarget);
    report.rowChecks.push({
        table,
        passed,
        sourceCount: normalizedSource.length,
        targetCount: normalizedTarget.length,
    });
    if (!passed) {
        addVerifyError(report, `${table} row-level comparison failed`);
    }
}

function sourceRecordLookupKey(row) {
    const idNumber = String(row.idNumber ?? '').trim();
    if (idNumber) return `id:${idNumber}`;
    return `fallback:${String(row.name ?? '').trim()}::${String(row.event ?? '').trim()}::${String(row.phone ?? '').trim()}`;
}

function deterministicSample(rows, sampleSize) {
    return [...rows]
        .sort((left, right) => {
            const leftScore = (Number(left.id) * 2654435761) % 2147483647;
            const rightScore = (Number(right.id) * 2654435761) % 2147483647;
            return leftScore - rightScore;
        })
        .slice(0, Math.min(sampleSize, rows.length));
}

function normalizeRecordForComparison(row) {
    return {
        name: String(row.name ?? ''),
        idNumber: String(row.idNumber ?? ''),
        gender: String(row.gender ?? ''),
        event: String(row.event ?? ''),
        auditStatus: String(row.auditStatus ?? ''),
        lotteryStatus: String(row.lotteryStatus ?? ''),
        clothingSize: String(row.clothingSize ?? ''),
        runnerCategory: String(row.runnerCategory ?? ''),
        personalBestFull: canonicalJson(row.personalBestFull),
        personalBestHalf: canonicalJson(row.personalBestHalf),
        bibNumber: String(row.bibNumber ?? ''),
    };
}

async function verifyOrganization(entry, reportRoot) {
    const report = createVerificationReport(entry);
    const reader = await openSqliteSnapshot(entry.sqlitePath);

    try {
        const sourceRaces = reader.selectAll('races', { orderBy: 'id ASC' });
        const targetRaces = await knex('races')
            .select(['id', 'name', 'date', 'location'])
            .where({ org_id: entry.orgId })
            .orderBy('id', 'asc');

        const raceIdMap = pairRaces(sourceRaces, targetRaces, report);

        const sourceCountsByTable = {
            column_mappings: dedupeColumnMappings(reader.selectAll('column_mappings', { orderBy: 'updatedAt DESC, id DESC' })).length,
        };
        for (const [sourceTable, targetTable] of COUNT_TABLES) {
            const sourceCount = sourceTable === 'column_mappings'
                ? sourceCountsByTable.column_mappings
                : reader.count(sourceTable);
            const targetCount = Number(
                (await knex(targetTable).where({ org_id: entry.orgId }).count({ count: '*' }).first())?.count ?? 0,
            );
            const passed = sourceCount === targetCount;
            recordCountCheck(report, targetTable, sourceCount, targetCount, passed);
            if (!passed) {
                addVerifyError(report, `${targetTable} row count mismatch`, { sourceCount, targetCount });
            }
        }

        const targetDerivedLotteryResults = Number(
            (await knex('lottery_results').where({ org_id: entry.orgId }).count({ count: '*' }).first())?.count ?? 0,
        );
        const targetDerivedLotteryExpected = Number(
            (await knex('records')
                .where({ org_id: entry.orgId })
                .whereIn('lottery_status', ['中签', '未中签', '候补'])
                .count({ count: '*' })
                .first())?.count ?? 0,
        );
        recordCountCheck(report, 'lottery_results_derived', targetDerivedLotteryExpected, targetDerivedLotteryResults, targetDerivedLotteryExpected === targetDerivedLotteryResults);
        if (targetDerivedLotteryExpected !== targetDerivedLotteryResults) {
            addVerifyError(report, 'Derived lottery_results count mismatch', {
                expected: targetDerivedLotteryExpected,
                actual: targetDerivedLotteryResults,
            });
        }

        const targetDerivedBibAssignments = Number(
            (await knex('bib_assignments').where({ org_id: entry.orgId }).count({ count: '*' }).first())?.count ?? 0,
        );
        const targetDerivedBibExpected = Number(
            (await knex('records')
                .where({ org_id: entry.orgId })
                .whereNotNull('bib_number')
                .where('bib_number', '!=', '')
                .count({ count: '*' })
                .first())?.count ?? 0,
        );
        recordCountCheck(report, 'bib_assignments_derived', targetDerivedBibExpected, targetDerivedBibAssignments, targetDerivedBibExpected === targetDerivedBibAssignments);
        if (targetDerivedBibExpected !== targetDerivedBibAssignments) {
            addVerifyError(report, 'Derived bib_assignments count mismatch', {
                expected: targetDerivedBibExpected,
                actual: targetDerivedBibAssignments,
            });
        }

        const sourceRecords = reader.selectAll('records', { orderBy: 'id ASC' });
        const targetRecords = await knex('records')
            .select([
                'id',
                'race_id as raceId',
                'name',
                'id_number as idNumber',
                'phone',
                'gender',
                'event',
                'audit_status as auditStatus',
                'lottery_status as lotteryStatus',
                'clothing_size as clothingSize',
                'runner_category as runnerCategory',
                'personal_best_full as personalBestFull',
                'personal_best_half as personalBestHalf',
                'bib_number as bibNumber',
            ])
            .where({ org_id: entry.orgId });

        compareCountMap(
            report,
            'records.total_by_race',
            groupCount(sourceRecords, (row) => `race:${row.raceId}`),
            groupCount(targetRecords, (row) => {
                const sourceRaceId = [...raceIdMap.entries()].find(([, targetRaceId]) => targetRaceId === Number(row.raceId))?.[0];
                return `race:${sourceRaceId ?? 'unmapped'}`;
            }),
        );

        compareCountMap(
            report,
            'records.event_by_race',
            groupCount(sourceRecords, (row) => `race:${row.raceId}|event:${row.event ?? ''}`),
            groupCount(targetRecords, (row) => {
                const sourceRaceId = [...raceIdMap.entries()].find(([, targetRaceId]) => targetRaceId === Number(row.raceId))?.[0];
                return `race:${sourceRaceId ?? 'unmapped'}|event:${row.event ?? ''}`;
            }),
        );

        compareCountMap(
            report,
            'records.audit_status_by_race',
            groupCount(sourceRecords, (row) => `race:${row.raceId}|audit:${row.auditStatus ?? ''}`),
            groupCount(targetRecords, (row) => {
                const sourceRaceId = [...raceIdMap.entries()].find(([, targetRaceId]) => targetRaceId === Number(row.raceId))?.[0];
                return `race:${sourceRaceId ?? 'unmapped'}|audit:${row.auditStatus ?? ''}`;
            }),
        );

        compareCountMap(
            report,
            'records.lottery_status_by_race',
            groupCount(sourceRecords, (row) => `race:${row.raceId}|lottery:${row.lotteryStatus ?? ''}`),
            groupCount(targetRecords, (row) => {
                const sourceRaceId = [...raceIdMap.entries()].find(([, targetRaceId]) => targetRaceId === Number(row.raceId))?.[0];
                return `race:${sourceRaceId ?? 'unmapped'}|lottery:${row.lotteryStatus ?? ''}`;
            }),
        );

        const sourceClothingLimits = reader.selectAll('clothing_limits', { orderBy: 'id ASC' });
        const targetClothingLimits = await knex('clothing_limits')
            .select(['race_id as raceId', 'event', 'gender', 'size', 'total_inventory as totalInventory', 'used_count as usedCount'])
            .where({ org_id: entry.orgId });
        compareCountMap(
            report,
            'clothing_limits.inventory_by_race',
            groupCount(sourceClothingLimits, (row) => `race:${row.raceId}|inv:${toNumber(row.totalInventory)}|used:${toNumber(row.usedCount)}`),
            groupCount(targetClothingLimits, (row) => {
                const sourceRaceId = [...raceIdMap.entries()].find(([, targetRaceId]) => targetRaceId === Number(row.raceId))?.[0];
                return `race:${sourceRaceId ?? 'unmapped'}|inv:${toNumber(row.totalInventory)}|used:${toNumber(row.usedCount)}`;
            }),
        );

        compareSmallTable(
            report,
            'column_mappings',
            reader.selectAll('column_mappings', { orderBy: 'updatedAt DESC, id DESC' }),
            (await knex('column_mappings')
                .select(['source_column as sourceColumn', 'target_field_id as targetFieldId'])
                .where({ org_id: entry.orgId })),
        );
        compareSmallTable(
            report,
            'lottery_rules',
            reader.selectAll('lottery_rules', { orderBy: 'id ASC' }),
            (await knex('lottery_rules')
                .select([
                    'target_group as targetGroup',
                    'target_count as targetCount',
                    'draw_ratio as drawRatio',
                    'reserved_ratio as reservedRatio',
                    'gender_ratio as genderRatio',
                    'region_ratio as regionRatio',
                ])
                .where({ org_id: entry.orgId })),
        );
        compareSmallTable(
            report,
            'lottery_weights',
            reader.selectAll('lottery_weights', { orderBy: 'priority DESC, weightType ASC' }),
            (await knex('lottery_weights')
                .select([
                    'target_group as targetGroup',
                    'weight_type as weightType',
                    'enabled',
                    'weight_config as weightConfig',
                    'priority',
                ])
                .where({ org_id: entry.orgId })),
        );
        compareSmallTable(
            report,
            'race_capacity',
            reader.selectAll('race_capacity', { orderBy: 'id ASC' }),
            (await knex('race_capacity')
                .select([
                    'event',
                    'target_count as targetCount',
                    'draw_ratio as drawRatio',
                    'reserved_ratio as reservedRatio',
                ])
                .where({ org_id: entry.orgId })),
        );
        compareSmallTable(
            report,
            'start_zones',
            reader.selectAll('start_zones', { orderBy: 'sortOrder ASC, zoneName ASC' }),
            (await knex('start_zones')
                .select([
                    'zone_name as zoneName',
                    'width',
                    'length',
                    'density',
                    'calculated_capacity as calculatedCapacity',
                    'color',
                    'event',
                    'capacity_ratio as capacityRatio',
                    'sort_order as sortOrder',
                    'gap_distance as gapDistance',
                    'score_upper_seconds as scoreUpperSeconds',
                ])
                .where({ org_id: entry.orgId })),
        );

        const sourceRecordsByRace = new Map();
        for (const row of sourceRecords) {
            const bucket = sourceRecordsByRace.get(Number(row.raceId)) ?? [];
            bucket.push(row);
            sourceRecordsByRace.set(Number(row.raceId), bucket);
        }

        const targetRecordLookup = new Map();
        for (const row of targetRecords) {
            const bucket = targetRecordLookup.get(`${row.raceId}::${sourceRecordLookupKey(row)}`) ?? [];
            bucket.push(row);
            targetRecordLookup.set(`${row.raceId}::${sourceRecordLookupKey(row)}`, bucket);
        }

        for (const [sourceRaceId, sampleSourceRows] of sourceRecordsByRace.entries()) {
            const targetRaceId = raceIdMap.get(sourceRaceId);
            if (!targetRaceId) continue;

            const sampleRows = deterministicSample(sampleSourceRows, 200);
            for (const sampleRow of sampleRows) {
                const key = `${targetRaceId}::${sourceRecordLookupKey(sampleRow)}`;
                const candidates = targetRecordLookup.get(key) ?? [];
                const targetRow = candidates.shift();

                if (!targetRow) {
                    addVerifyError(report, 'Record sample lookup failed', {
                        sourceRaceId,
                        targetRaceId,
                        key,
                        sourceRecordId: sampleRow.id,
                    });
                    continue;
                }

                const normalizedSource = normalizeRecordForComparison(sampleRow);
                const normalizedTarget = normalizeRecordForComparison(targetRow);
                const passed = JSON.stringify(normalizedSource) === JSON.stringify(normalizedTarget);
                report.samples.push({
                    sourceRaceId,
                    targetRaceId,
                    sourceRecordId: Number(sampleRow.id),
                    targetRecordId: Number(targetRow.id),
                    passed,
                });
                if (!passed) {
                    addVerifyError(report, 'Record sample mismatch', {
                        sourceRecordId: sampleRow.id,
                        targetRecordId: targetRow.id,
                        source: normalizedSource,
                        target: normalizedTarget,
                    });
                }
            }
        }
    } catch (error) {
        addVerifyError(report, error.message, { stack: error.stack });
    } finally {
        finalizeVerificationReport(report);
        const outputPath = path.extname(reportRoot)
            ? reportRoot
            : path.join(reportRoot, `${entry.orgSlug}-verify.json`);
        await writeVerificationReport(report, outputPath);
        await reader.close();
    }

    return report;
}

async function main() {
    const args = parseArgs(process.argv);
    const manifestEntries = await loadManifest(args.manifest);
    const selectedEntries = selectOrganizations(manifestEntries, args.org);

    if (!selectedEntries.length) {
        throw new Error(`No organizations matched selector: ${args.org}`);
    }

    const reports = [];
    let hasFailure = false;

    for (const entry of selectedEntries) {
        const report = await verifyOrganization(entry, args.report);
        reports.push(report);
        console.log(`[${entry.orgSlug}] ${report.summary.conclusion}`);
        if (report.summary.conclusion === 'fail') {
            hasFailure = true;
        }
    }

    const summaryPath = path.extname(args.report)
        ? path.join(path.dirname(path.resolve(args.report)), 'summary.md')
        : path.join(path.resolve(args.report), 'summary.md');
    await writeVerificationSummary(reports, summaryPath);

    if (hasFailure) {
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

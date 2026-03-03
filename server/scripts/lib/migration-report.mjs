import fs from 'node:fs/promises';
import path from 'node:path';

export function createMigrationReport(entry, mode) {
    return {
        orgId: entry.orgId,
        orgSlug: entry.orgSlug,
        displayName: entry.displayName,
        sqlitePath: entry.sqlitePath,
        mode,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        status: 'running',
        counts: {
            source: {},
            inserted: {},
            derived: {},
        },
        warnings: [],
        errors: [],
        meta: {},
    };
}

export function addMigrationWarning(report, message, details = null) {
    report.warnings.push({
        message,
        details,
    });
}

export function addMigrationError(report, message, details = null) {
    report.errors.push({
        message,
        details,
    });
}

export function setMigrationCount(report, bucket, key, value) {
    report.counts[bucket][key] = Number(value ?? 0);
}

export function finalizeMigrationReport(report, status, extra = {}) {
    report.status = status;
    report.finishedAt = new Date().toISOString();
    Object.assign(report.meta, extra);
    return report;
}

export async function writeMigrationReport(report, outputPath) {
    const resolved = path.resolve(outputPath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

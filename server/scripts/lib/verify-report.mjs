import fs from 'node:fs/promises';
import path from 'node:path';

export function createVerificationReport(entry) {
    return {
        orgId: entry.orgId,
        orgSlug: entry.orgSlug,
        displayName: entry.displayName,
        sqlitePath: entry.sqlitePath,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        status: 'running',
        summary: {
            conclusion: 'running',
            warningCount: 0,
            errorCount: 0,
        },
        counts: {},
        aggregates: [],
        rowChecks: [],
        samples: [],
        warnings: [],
        errors: [],
    };
}

export function addVerifyWarning(report, message, details = null) {
    report.warnings.push({ message, details });
    report.summary.warningCount = report.warnings.length;
}

export function addVerifyError(report, message, details = null) {
    report.errors.push({ message, details });
    report.summary.errorCount = report.errors.length;
}

export function recordCountCheck(report, table, source, target, passed) {
    report.counts[table] = {
        source: Number(source ?? 0),
        target: Number(target ?? 0),
        passed: Boolean(passed),
    };
}

export function finalizeVerificationReport(report) {
    report.finishedAt = new Date().toISOString();
    report.status = 'completed';
    report.summary.conclusion = report.errors.length
        ? 'fail'
        : report.warnings.length
            ? 'pass_with_warning'
            : 'pass';
    return report;
}

export async function writeVerificationReport(report, outputPath) {
    const resolved = path.resolve(outputPath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export async function writeVerificationSummary(reports, outputPath) {
    const lines = [
        '# Migration Verification Summary',
        '',
        '| Org | Conclusion | Warnings | Errors |',
        '| --- | --- | ---: | ---: |',
        ...reports.map((report) => `| ${report.orgSlug} | ${report.summary.conclusion} | ${report.warnings.length} | ${report.errors.length} |`),
        '',
    ];

    const resolved = path.resolve(outputPath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, `${lines.join('\n')}\n`, 'utf8');
}

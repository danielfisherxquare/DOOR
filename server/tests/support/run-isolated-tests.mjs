import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

import { assertSafeTestDatabase } from './test-environment.mjs';

const { Client } = pg;
const supportDirectory = dirname(fileURLToPath(import.meta.url));
const testsDirectory = resolve(supportDirectory, '..');
const serverDirectory = resolve(testsDirectory, '..');
const DEFAULT_FILE_TIMEOUT_MS = 120_000;

export function buildIsolatedDatabaseName(testFile) {
    const digest = createHash('sha256')
        .update(String(testFile))
        .digest('hex')
        .slice(0, 12);
    return `arcspro_test_${digest}`;
}

function replaceDatabaseName(databaseUrl, databaseName) {
    const parsed = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
        throw new Error('DATABASE_URL must use PostgreSQL for isolated tests');
    }
    parsed.pathname = `/${databaseName}`;
    return parsed.toString();
}

export function buildAdminDatabaseUrl(databaseUrl) {
    return replaceDatabaseName(databaseUrl, 'postgres');
}

export function buildIsolatedDatabaseUrl(databaseUrl, databaseName) {
    if (!/^arcspro_test_[a-f0-9]{12}$/.test(databaseName)) {
        throw new Error(`Unsafe isolated test database name: ${databaseName}`);
    }
    return replaceDatabaseName(databaseUrl, databaseName);
}

async function walkTestFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const absolutePath = resolve(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await walkTestFiles(absolutePath));
        } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
            files.push(absolutePath);
        }
    }
    return files;
}

export async function listTestFiles() {
    return (await walkTestFiles(testsDirectory))
        .map((absolutePath) => relative(serverDirectory, absolutePath).split(sep).join('/'))
        .sort();
}

async function recreateDatabase(client, databaseName) {
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${databaseName}"`);
}

async function dropDatabase(client, databaseName) {
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
}

function runTestFile(testFile, databaseUrl, timeoutMs) {
    return new Promise((resolveRun, rejectRun) => {
        const child = spawn(process.execPath, [
            '--import',
            './tests/support/test-environment.mjs',
            '--test',
            '--test-concurrency=1',
            testFile,
        ], {
            cwd: serverDirectory,
            env: {
                ...process.env,
                NODE_ENV: 'test',
                DATABASE_URL: databaseUrl,
            },
            stdio: 'inherit',
        });

        let timedOut = false;
        const timeout = setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
        }, timeoutMs);

        child.once('error', (error) => {
            clearTimeout(timeout);
            rejectRun(error);
        });
        child.once('exit', (code, signal) => {
            clearTimeout(timeout);
            resolveRun({
                code: code ?? 1,
                signal,
                timedOut,
            });
        });
    });
}

export async function runIsolatedTests({
    databaseUrl = process.env.DATABASE_URL,
    fileTimeoutMs = Number(process.env.ARCSPRO_TEST_FILE_TIMEOUT_MS || DEFAULT_FILE_TIMEOUT_MS),
} = {}) {
    assertSafeTestDatabase(databaseUrl);
    const testFiles = await listTestFiles();
    const adminClient = new Client({ connectionString: buildAdminDatabaseUrl(databaseUrl) });
    const failures = [];

    await adminClient.connect();
    try {
        for (const [index, testFile] of testFiles.entries()) {
            const databaseName = buildIsolatedDatabaseName(testFile);
            const isolatedUrl = buildIsolatedDatabaseUrl(databaseUrl, databaseName);
            process.stdout.write(`\n[isolated-db ${index + 1}/${testFiles.length}] ${testFile}\n`);

            try {
                await recreateDatabase(adminClient, databaseName);
                const result = await runTestFile(testFile, isolatedUrl, fileTimeoutMs);
                if (result.code !== 0) {
                    failures.push({ testFile, ...result });
                }
            } catch (error) {
                failures.push({ testFile, error });
                console.error(`[isolated-db] ${testFile} failed to execute:`, error);
            } finally {
                await dropDatabase(adminClient, databaseName);
            }
        }
    } finally {
        await adminClient.end();
    }

    if (failures.length > 0) {
        const summary = failures.map((failure) => {
            if (failure.error) return `${failure.testFile}: ${failure.error.message}`;
            if (failure.timedOut) return `${failure.testFile}: timed out`;
            return `${failure.testFile}: exit ${failure.code}${failure.signal ? ` (${failure.signal})` : ''}`;
        });
        throw new Error(`Isolated server tests failed:\n${summary.join('\n')}`);
    }

    process.stdout.write(`\n[isolated-db] PASS ${testFiles.length}/${testFiles.length} files\n`);
    return { files: testFiles.length, failures: 0 };
}

const isMain = process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
    runIsolatedTests().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

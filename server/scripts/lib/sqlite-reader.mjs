import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..', '..');
const workspaceRoot = path.resolve(serverRoot, '..', '..');

let sqlJsModulePromise;

async function loadSqlJs() {
    if (!sqlJsModulePromise) {
        sqlJsModulePromise = (async () => {
            const candidates = [
                path.resolve(serverRoot, 'node_modules', 'sql.js', 'dist', 'sql-wasm.js'),
                path.resolve(workspaceRoot, 'tool', 'node_modules', 'sql.js', 'dist', 'sql-wasm.js'),
            ];

            for (const candidate of candidates) {
                try {
                    await fs.access(candidate);
                    const initSqlJs = require(candidate);
                    const locateFileDir = path.dirname(candidate);
                    return (initSqlJs.default ?? initSqlJs)({
                        locateFile: (file) => path.join(locateFileDir, file),
                    });
                } catch {
                    // try next candidate
                }
            }

            throw new Error(
                'sql.js not found. Install it under door/server or keep tool/node_modules/sql.js available.',
            );
        })();
    }

    return sqlJsModulePromise;
}

function toPositionalParams(params) {
    if (!Array.isArray(params)) return [];
    return params.map((value) => {
        if (value instanceof Date) return value.toISOString();
        if (typeof value === 'boolean') return value ? 1 : 0;
        return value;
    });
}

function sanitizeIdentifier(name) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new Error(`Unsafe SQLite identifier: ${name}`);
    }
    return name;
}

export class SqliteSnapshotReader {
    constructor({ db, snapshotPath, sourcePath }) {
        this.db = db;
        this.snapshotPath = snapshotPath;
        this.sourcePath = sourcePath;
    }

    query(sql, params = []) {
        const statement = this.db.prepare(sql);
        const rows = [];

        try {
            statement.bind(toPositionalParams(params));
            while (statement.step()) {
                rows.push(statement.getAsObject());
            }
        } finally {
            statement.free();
        }

        return rows;
    }

    queryOne(sql, params = []) {
        return this.query(sql, params)[0] ?? null;
    }

    selectAll(tableName, { where, orderBy, params = [] } = {}) {
        const table = sanitizeIdentifier(tableName);
        const clauses = [`SELECT * FROM ${table}`];
        if (where) clauses.push(`WHERE ${where}`);
        if (orderBy) clauses.push(`ORDER BY ${orderBy}`);
        return this.query(clauses.join(' '), params);
    }

    tableExists(tableName) {
        const row = this.queryOne(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
            [tableName],
        );
        return Boolean(row?.name);
    }

    listTables() {
        return this.query(
            `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC`,
        ).map((row) => String(row.name));
    }

    count(tableName, where = '', params = []) {
        const table = sanitizeIdentifier(tableName);
        const row = this.queryOne(
            `SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ''}`,
            params,
        );
        return Number(row?.count ?? 0);
    }

    async close() {
        try {
            this.db.close();
        } finally {
            if (this.snapshotPath) {
                await fs.rm(this.snapshotPath, { force: true }).catch(() => {});
            }
        }
    }
}

export async function openSqliteSnapshot(sqlitePath) {
    const resolvedPath = path.resolve(sqlitePath);
    await fs.access(resolvedPath);

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'door-sqlite-snapshot-'));
    const snapshotPath = path.join(tempDir, path.basename(resolvedPath));
    await fs.copyFile(resolvedPath, snapshotPath);

    const sqlJs = await loadSqlJs();
    const buffer = await fs.readFile(snapshotPath);
    const db = new sqlJs.Database(new Uint8Array(buffer));

    return new SqliteSnapshotReader({
        db,
        snapshotPath,
        sourcePath: resolvedPath,
    });
}

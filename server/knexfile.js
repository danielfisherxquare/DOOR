/**
 * Knexfile — 用于 CLI 迁移命令
 * 使用方法: npx knex migrate:latest --knexfile knexfile.js
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const isProduction = (process.env.NODE_ENV || 'development') === 'production';
const isWorker = process.env.ARCSPRO_PROCESS_TYPE === 'worker';

const poolDefaults = {
    min: isProduction ? (isWorker ? 2 : 5) : 2,
    max: isProduction ? (isWorker ? 5 : 20) : 10,
};

const pool = {
    min: parseInt(process.env.DB_POOL_MIN || String(poolDefaults.min), 10),
    max: parseInt(process.env.DB_POOL_MAX || String(poolDefaults.max), 10),
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || '30000', 10),
    acquireTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT_MS || '10000', 10),
};

const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), 'src', 'db', 'migrations');

export default {
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgres://door:door_dev@localhost:5432/door',
    pool,
    migrations: {
        directory: migrationsDirectory,
        tableName: 'knex_migrations',
    },
};

import Knex from 'knex';
import { env } from '../config/env.js';

// ── 连接池配置：根据环境和进程类型智能调整 ──────────────
const isProduction = env.NODE_ENV === 'production';
const isWorker = process.env.ARCSPRO_PROCESS_TYPE === 'worker';

// Worker 进程通常执行长事务，需要更少但更持久的连接
// API 进程需要更多连接应对并发请求
const poolDefaults = {
    min: isProduction ? (isWorker ? 2 : 5) : 2,
    max: isProduction ? (isWorker ? 5 : 20) : 10,
};

const pool = {
    min: parseInt(process.env.DB_POOL_MIN || String(poolDefaults.min), 10),
    max: parseInt(process.env.DB_POOL_MAX || String(poolDefaults.max), 10),
    // 空闲连接超时（默认 30 秒，防止 Worker 占用过久）
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || '30000', 10),
    // 获取连接超时（默认 10 秒，快速 fail 而非无限等待）
    acquireTimeoutMillis: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT_MS || '10000', 10),
};

const knex = Knex({
    client: 'pg',
    connection: env.DATABASE_URL,
    pool,
    migrations: {
        directory: './src/db/migrations',
        tableName: 'knex_migrations',
    },
});

export default knex;

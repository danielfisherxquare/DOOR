import { randomUUID } from 'node:crypto';
import knex from './db/knex.js';
import { env } from './config/env.js';
import * as jobRepo from './modules/jobs/job.repository.js';
import { getHandler, getRegisteredTypes } from './modules/jobs/job.handlers.js';

const WORKER_ID = `worker-${randomUUID().slice(0, 8)}`;
let running = true;

console.log(`🔧 Worker ${WORKER_ID} 启动中…`);
console.log(`📋 已注册 handler: ${getRegisteredTypes().join(', ') || '(无)'}`);
console.log(`⏱️  轮询间隔: ${env.WORKER_POLL_INTERVAL_MS}ms`);
console.log(`🔒 租约时长: ${env.JOB_LEASE_DURATION_MS}ms`);
console.log(`💓 心跳间隔: ${env.JOB_HEARTBEAT_INTERVAL_MS}ms`);

// ── 主轮询循环 ───────────────────────────────────────────
async function pollLoop() {
    // 启动时先回收一次过期 Job
    const recoveredOnStart = await jobRepo.recoverExpired();
    if (recoveredOnStart > 0) {
        console.log(`♻️  启动时回收 ${recoveredOnStart} 个过期 Job`);
    }

    while (running) {
        try {
            // 1. 回收过期 Job
            const recovered = await jobRepo.recoverExpired();
            if (recovered > 0) {
                console.log(`♻️  回收 ${recovered} 个过期 Job`);
            }

            // 2. 尝试领取一个 Job
            const job = await jobRepo.claim(WORKER_ID, env.JOB_LEASE_DURATION_MS);
            if (job) {
                console.log(`🚀 领取 Job [${job.id}] type=${job.type}`);
                await executeJob(job);
            }
        } catch (err) {
            console.error('轮询出错:', err.message);
        }

        // 等待下一轮
        await sleep(env.WORKER_POLL_INTERVAL_MS);
    }
}

// ── 执行单个 Job ─────────────────────────────────────────
async function executeJob(job) {
    const handler = getHandler(job.type);
    if (!handler) {
        console.error(`❌ 未找到 handler: ${job.type}`);
        await jobRepo.fail(job.id, WORKER_ID, {
            code: 'UNKNOWN_HANDLER',
            message: `No handler registered for type: ${job.type}`,
        });
        return;
    }

    // 心跳定时器
    const heartbeatInterval = setInterval(async () => {
        try {
            await jobRepo.heartbeat(job.id, WORKER_ID, env.JOB_LEASE_DURATION_MS);
        } catch (err) {
            console.error(`💓 心跳失败 [${job.id}]:`, err.message);
        }
    }, env.JOB_HEARTBEAT_INTERVAL_MS);

    try {
        const result = await handler(job, {
            knex,
            heartbeat: async (progress, message) => {
                await jobRepo.heartbeat(job.id, WORKER_ID, env.JOB_LEASE_DURATION_MS, progress, message);
            },
        });

        await jobRepo.succeed(job.id, WORKER_ID, result);
        console.log(`✅ Job 完成 [${job.id}]`);
    } catch (err) {
        console.error(`❌ Job 失败 [${job.id}]:`, err.message);
        await jobRepo.fail(job.id, WORKER_ID, {
            code: err.code || 'HANDLER_ERROR',
            message: err.message,
            stack: env.NODE_ENV === 'development' ? err.stack : undefined,
        });
    } finally {
        clearInterval(heartbeatInterval);
    }
}

// ── Graceful Shutdown ───────────────────────────────────
async function shutdown(signal) {
    console.log(`\n⏳ Worker 收到 ${signal}，等待当前 Job 完成…`);
    running = false;

    // 给最多 30 秒完成当前 Job
    setTimeout(async () => {
        console.error('⚠️ Worker 强制退出（超时 30 秒）');
        await knex.destroy();
        process.exit(1);
    }, 30_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── 工具函数 ─────────────────────────────────────────────
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 启动 ─────────────────────────────────────────────────
pollLoop()
    .then(async () => {
        console.log('🛑 Worker 已停止');
        await knex.destroy();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error('💥 Worker 异常退出:', err);
        await knex.destroy();
        process.exit(1);
    });

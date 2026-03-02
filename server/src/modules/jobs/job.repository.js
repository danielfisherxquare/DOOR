import knex from '../../db/knex.js';
import { fromDbRow } from './job.mapper.js';

const TABLE = 'jobs';

/**
 * 入队一个 Job（幂等）
 * 若同 org_id + type + idempotency_key 已有 queued/running 的 Job，则返回旧 Job
 */
export async function enqueue(orgId, type, payload, idempotencyKey, createdBy, raceId = null) {
    // 先查是否已有未完成的同 key Job
    const existing = await knex(TABLE)
        .where({ org_id: orgId, type, idempotency_key: idempotencyKey })
        .whereIn('status', ['queued', 'running'])
        .first();

    if (existing) {
        return fromDbRow(existing);
    }

    const [row] = await knex(TABLE)
        .insert({
            org_id: orgId,
            race_id: raceId,
            type,
            payload: JSON.stringify(payload),
            idempotency_key: idempotencyKey,
            created_by: createdBy,
        })
        .returning('*');

    return fromDbRow(row);
}

/**
 * 领取一个 queued Job（FOR UPDATE SKIP LOCKED）
 * @param {string} leaseOwner - Worker 标识
 * @param {number} leaseDurationMs - 租约时长（毫秒）
 * @returns {object|null} 领取到的 Job，或 null
 */
export async function claim(leaseOwner, leaseDurationMs) {
    return knex.transaction(async (trx) => {
        const job = await trx(TABLE)
            .where({ status: 'queued' })
            .orderBy('created_at', 'asc')
            .forUpdate()
            .skipLocked()
            .first();

        if (!job) return null;

        const now = new Date();
        const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

        const [updated] = await trx(TABLE)
            .where({ id: job.id })
            .update({
                status: 'running',
                lease_owner: leaseOwner,
                lease_expires_at: leaseExpiresAt,
                started_at: now,
                attempt_count: knex.raw('attempt_count + 1'),
            })
            .returning('*');

        return fromDbRow(updated);
    });
}

/**
 * 续租 + 更新进度
 */
export async function heartbeat(jobId, leaseOwner, leaseDurationMs, progress = null, message = null) {
    const update = {
        lease_expires_at: new Date(Date.now() + leaseDurationMs),
    };
    if (progress !== null) update.progress = progress;
    if (message !== null) update.message = message;

    const [row] = await knex(TABLE)
        .where({ id: jobId, lease_owner: leaseOwner, status: 'running' })
        .update(update)
        .returning('*');

    return fromDbRow(row);
}

/**
 * 标记 Job 成功
 */
export async function succeed(jobId, leaseOwner, result) {
    const [row] = await knex(TABLE)
        .where({ id: jobId, lease_owner: leaseOwner, status: 'running' })
        .update({
            status: 'succeeded',
            progress: 100,
            result: result ? JSON.stringify(result) : null,
            finished_at: new Date(),
            lease_owner: null,
            lease_expires_at: null,
        })
        .returning('*');

    return fromDbRow(row);
}

/**
 * 标记 Job 失败
 */
export async function fail(jobId, leaseOwner, error) {
    const [row] = await knex(TABLE)
        .where({ id: jobId, lease_owner: leaseOwner, status: 'running' })
        .update({
            status: 'failed',
            error: error ? JSON.stringify(error) : null,
            finished_at: new Date(),
            lease_owner: null,
            lease_expires_at: null,
        })
        .returning('*');

    return fromDbRow(row);
}

/**
 * 回收过期 Job（status='running' AND lease_expires_at < now()）
 * 将其标记为 failed + LEASE_EXPIRED
 * @returns {number} 回收的 Job 数量
 */
export async function recoverExpired() {
    const count = await knex(TABLE)
        .where({ status: 'running' })
        .where('lease_expires_at', '<', new Date())
        .update({
            status: 'failed',
            error: JSON.stringify({ code: 'LEASE_EXPIRED', message: 'Worker lease expired' }),
            finished_at: new Date(),
            lease_owner: null,
            lease_expires_at: null,
        });

    return count;
}

/**
 * 按 ID 查询 Job
 */
export async function findById(jobId) {
    const row = await knex(TABLE).where({ id: jobId }).first();
    return fromDbRow(row);
}

/**
 * 按组织 + ID 查询 Job（租户隔离）
 */
export async function findByOrgAndId(orgId, jobId) {
    const row = await knex(TABLE).where({ id: jobId, org_id: orgId }).first();
    return fromDbRow(row);
}

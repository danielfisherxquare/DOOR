/**
 * jobs 表的 snake_case ↔ camelCase 映射
 */

/**
 * 将数据库行（snake_case）转换为领域对象（camelCase）
 * @param {object} row - 数据库行
 * @returns {object} 领域对象
 */
export function fromDbRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        orgId: row.org_id,
        raceId: row.race_id,
        type: row.type,
        status: row.status,
        progress: row.progress,
        message: row.message,
        payload: row.payload,
        result: row.result,
        error: row.error,
        idempotencyKey: row.idempotency_key,
        attemptCount: row.attempt_count,
        maxAttempts: row.max_attempts,
        leaseOwner: row.lease_owner,
        leaseExpiresAt: row.lease_expires_at,
        createdBy: row.created_by,
        createdAt: row.created_at,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
    };
}

/**
 * 将领域对象转换为 API 返回的 JobStatus 结构
 * @param {object} job - 领域对象
 * @returns {object} API 响应体
 */
export function toJobStatusResponse(job) {
    if (!job) return null;
    return {
        id: job.id,
        orgId: job.orgId,
        raceId: job.raceId,
        type: job.type,
        status: job.status,
        progress: job.progress,
        message: job.message,
        result: job.result,
        error: job.error,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
    };
}

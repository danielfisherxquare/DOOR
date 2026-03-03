/**
 * Audit Mapper — snake_case (DB) ↔ camelCase (API)
 * 覆盖 audit_runs / audit_results 两张表
 */

// ─── audit_runs ─────────────────────────────────────────────────────
export const auditRunMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: Number(row.id),
            orgId: row.org_id,
            raceId: Number(row.race_id),
            stepNumber: Number(row.step_number),
            stepName: row.step_name,
            status: row.status,
            affected: Number(row.affected),
            remaining: Number(row.remaining),
            error: row.error ?? null,
            executedAt: row.executed_at,
            createdAt: row.created_at,
        };
    },

    toDbInsert(data, orgId) {
        return {
            org_id: orgId,
            race_id: data.raceId,
            step_number: data.stepNumber,
            step_name: data.stepName,
            status: data.status ?? 'pending',
            affected: data.affected ?? 0,
            remaining: data.remaining ?? 0,
            error: data.error ?? null,
            executed_at: data.executedAt ?? null,
        };
    },

    toDbUpdate(data) {
        const row = {};
        if (data.status !== undefined) row.status = data.status;
        if (data.affected !== undefined) row.affected = data.affected;
        if (data.remaining !== undefined) row.remaining = data.remaining;
        if (data.error !== undefined) row.error = data.error;
        if (data.executedAt !== undefined) row.executed_at = data.executedAt;
        return row;
    },
};

// ─── audit_results ──────────────────────────────────────────────────
export const auditResultMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: Number(row.id),
            orgId: row.org_id,
            raceId: Number(row.race_id),
            runId: row.run_id != null ? Number(row.run_id) : null,
            recordId: Number(row.record_id),
            action: row.action,
            reason: row.reason ?? null,
            createdAt: row.created_at,
        };
    },

    toDbInsert(data, orgId) {
        return {
            org_id: orgId,
            race_id: data.raceId,
            run_id: data.runId ?? null,
            record_id: data.recordId,
            action: data.action,
            reason: data.reason ?? null,
        };
    },
};

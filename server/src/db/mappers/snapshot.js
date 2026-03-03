/**
 * Snapshot Mapper — snake_case (DB) ↔ camelCase (API)
 * 覆盖 pipeline_snapshots + pipeline_snapshot_items 两张表
 */

// ─── pipeline_snapshots ────────────────────────────────────────────
export const snapshotMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: Number(row.id),
            orgId: row.org_id,
            raceId: Number(row.race_id),
            snapshotType: row.snapshot_type,
            snapshotData: row.snapshot_data ?? {},
            createdAt: row.created_at,
        };
    },

    toDbInsert(data, orgId) {
        return {
            org_id: orgId,
            race_id: data.raceId,
            snapshot_type: data.snapshotType,
            snapshot_data: data.snapshotData ? JSON.stringify(data.snapshotData) : '{}',
        };
    },
};

// ─── pipeline_snapshot_items ───────────────────────────────────────
export const snapshotItemMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: Number(row.id),
            snapshotId: Number(row.snapshot_id),
            recordId: Number(row.record_id),
            fieldData: row.field_data ?? {},
        };
    },

    toDbInsert(snapshotId, recordId, fieldData) {
        return {
            snapshot_id: snapshotId,
            record_id: recordId,
            field_data: JSON.stringify(fieldData),
        };
    },
};

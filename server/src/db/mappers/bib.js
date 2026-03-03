/**
 * Bib Mapper — snake_case (DB) ↔ camelCase (API)
 * 覆盖 bib_numbering_configs + bib_assignments 两张表
 *
 * ⚠️ bib_numbering_configs 仅用于排号编号区间配置，
 *    与 Electron 端的 bib_layout_templates（PDF 排版模板）无关。
 */

// ─── bib_numbering_configs ─────────────────────────────────────────
export const bibConfigMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: Number(row.id),
            orgId: row.org_id,
            raceId: Number(row.race_id),
            event: row.event,
            prefix: row.prefix,
            startNumber: Number(row.start_number),
            endNumber: Number(row.end_number),
            padding: Number(row.padding),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    },

    toDbInsert(data, orgId) {
        return {
            org_id: orgId,
            race_id: data.raceId,
            event: data.event ?? '',
            prefix: data.prefix ?? '',
            start_number: data.startNumber ?? 1,
            end_number: data.endNumber ?? 9999,
            padding: data.padding ?? 4,
        };
    },

    toDbUpdate(data) {
        const row = {};
        if (data.event !== undefined) row.event = data.event;
        if (data.prefix !== undefined) row.prefix = data.prefix;
        if (data.startNumber !== undefined) row.start_number = data.startNumber;
        if (data.endNumber !== undefined) row.end_number = data.endNumber;
        if (data.padding !== undefined) row.padding = data.padding;
        row.updated_at = new Date();
        return row;
    },
};

// ─── bib_assignments ───────────────────────────────────────────────
export const bibAssignmentMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: Number(row.id),
            orgId: row.org_id,
            raceId: Number(row.race_id),
            recordId: Number(row.record_id),
            bibNumber: row.bib_number,
            assignedAt: row.assigned_at,
        };
    },

    toDbInsert(data, orgId) {
        return {
            org_id: orgId,
            race_id: data.raceId,
            record_id: data.recordId,
            bib_number: data.bibNumber,
        };
    },
};

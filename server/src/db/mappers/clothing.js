/**
 * Clothing Mapper — snake_case (DB) ↔ camelCase (API)
 * 覆盖 clothing_limits 表
 */

export const clothingLimitMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: Number(row.id),
            orgId: row.org_id,
            raceId: Number(row.race_id),
            event: row.event,
            gender: row.gender,
            size: row.size,
            totalInventory: Number(row.total_inventory),
            usedCount: Number(row.used_count),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    },

    toDbInsert(data, orgId) {
        return {
            org_id: orgId,
            race_id: data.raceId,
            event: data.event ?? '',
            gender: data.gender ?? '',
            size: data.size ?? '',
            total_inventory: data.totalInventory ?? 0,
            used_count: data.usedCount ?? 0,
        };
    },

    toDbUpdate(data) {
        const row = {};
        if (data.event !== undefined) row.event = data.event;
        if (data.gender !== undefined) row.gender = data.gender;
        if (data.size !== undefined) row.size = data.size;
        if (data.totalInventory !== undefined) row.total_inventory = data.totalInventory;
        if (data.usedCount !== undefined) row.used_count = data.usedCount;
        row.updated_at = new Date();
        return row;
    },
};

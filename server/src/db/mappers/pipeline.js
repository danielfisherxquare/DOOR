/**
 * Pipeline Config Mapper — snake_case (DB) ↔ camelCase (API)
 * 覆盖 start_zones / performance_rules 两张表
 */

// ─── start_zones ────────────────────────────────────────────────────
export const startZoneMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: Number(row.id),
            orgId: row.org_id,
            raceId: Number(row.race_id),
            zoneName: row.zone_name,
            width: Number(row.width),
            length: Number(row.length),
            density: Number(row.density),
            calculatedCapacity: Number(row.calculated_capacity),
            color: row.color,
            sortOrder: Number(row.sort_order),
            gapDistance: Number(row.gap_distance),
            event: row.event,
            capacityRatio: Number(row.capacity_ratio),
            scoreUpperSeconds: row.score_upper_seconds != null ? Number(row.score_upper_seconds) : null,
            createdAt: row.created_at,
        };
    },

    toDbInsert(data, orgId) {
        return {
            org_id: orgId,
            race_id: data.raceId,
            zone_name: data.zoneName ?? '',
            width: data.width ?? 10,
            length: data.length ?? 20,
            density: data.density ?? 2.5,
            calculated_capacity: data.calculatedCapacity ?? 0,
            color: data.color ?? '#3B82F6',
            sort_order: data.sortOrder ?? 0,
            gap_distance: data.gapDistance ?? 0,
            event: data.event ?? '',
            capacity_ratio: data.capacityRatio ?? 1,
            score_upper_seconds: data.scoreUpperSeconds ?? null,
        };
    },

    toDbUpdate(data) {
        const row = {};
        if (data.zoneName !== undefined) row.zone_name = data.zoneName;
        if (data.width !== undefined) row.width = data.width;
        if (data.length !== undefined) row.length = data.length;
        if (data.density !== undefined) row.density = data.density;
        if (data.calculatedCapacity !== undefined) row.calculated_capacity = data.calculatedCapacity;
        if (data.color !== undefined) row.color = data.color;
        if (data.sortOrder !== undefined) row.sort_order = data.sortOrder;
        if (data.gapDistance !== undefined) row.gap_distance = data.gapDistance;
        if (data.event !== undefined) row.event = data.event;
        if (data.capacityRatio !== undefined) row.capacity_ratio = data.capacityRatio;
        if (data.scoreUpperSeconds !== undefined) row.score_upper_seconds = data.scoreUpperSeconds;
        return row;
    },
};

// ─── performance_rules ──────────────────────────────────────────────
export const performanceRuleMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: Number(row.id),
            orgId: row.org_id,
            raceId: Number(row.race_id),
            event: row.event,
            minTime: row.min_time,
            maxTime: row.max_time,
            priorityRatio: Number(row.priority_ratio),
            createdAt: row.created_at,
        };
    },

    toDbInsert(data, orgId) {
        return {
            org_id: orgId,
            race_id: data.raceId,
            event: data.event ?? '',
            min_time: data.minTime ?? '',
            max_time: data.maxTime ?? '',
            priority_ratio: data.priorityRatio ?? 0.6,
        };
    },

    toDbUpdate(data) {
        const row = {};
        if (data.event !== undefined) row.event = data.event;
        if (data.minTime !== undefined) row.min_time = data.minTime;
        if (data.maxTime !== undefined) row.max_time = data.maxTime;
        if (data.priorityRatio !== undefined) row.priority_ratio = data.priorityRatio;
        return row;
    },
};

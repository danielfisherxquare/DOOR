/**
 * Races Mapper - snake_case (DB) -> camelCase (API)
 */
import { deserializeJsonb, serializeJsonb } from './jsonb.js';

export const raceMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: Number(row.id),
            orgId: row.org_id,
            name: row.name,
            date: row.date,
            location: row.location,
            events: deserializeJsonb(row.events, null),
            conflictRule: row.conflict_rule,
            locationLat: row.location_lat,
            locationLng: row.location_lng,
            routeData: row.route_data,
            mapFeaturesData: row.map_features_data,
            createAt: row.created_at,
            lotteryModeDefault: row.lottery_mode_default ?? 'lottery',
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    },

    toDbInsert(data) {
        return {
            org_id: data.orgId,
            name: data.name,
            date: data.date,
            location: data.location ?? '',
            events: serializeJsonb(data.events, null),
            conflict_rule: data.conflictRule ?? 'strict',
            location_lat: data.locationLat ?? null,
            location_lng: data.locationLng ?? null,
            route_data: data.routeData ?? null,
            map_features_data: data.mapFeaturesData ?? null,
            lottery_mode_default: data.lotteryModeDefault ?? 'lottery',
        };
    },

    toDbUpdate(data) {
        const row = {};
        if (data.lotteryModeDefault !== undefined) row.lottery_mode_default = data.lotteryModeDefault;
        if (data.name !== undefined) row.name = data.name;
        if (data.date !== undefined) row.date = data.date;
        if (data.location !== undefined) row.location = data.location;
        if (data.events !== undefined) row.events = serializeJsonb(data.events, null);
        if (data.conflictRule !== undefined) row.conflict_rule = data.conflictRule;
        if (data.locationLat !== undefined) row.location_lat = data.locationLat;
        if (data.locationLng !== undefined) row.location_lng = data.locationLng;
        if (data.routeData !== undefined) row.route_data = data.routeData;
        if (data.mapFeaturesData !== undefined) row.map_features_data = data.mapFeaturesData;
        row.updated_at = new Date();
        return row;
    },
};

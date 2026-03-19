/**
 * Lottery Mapper — snake_case (DB) ↔ camelCase (API)
 * 覆盖 race_capacity / lottery_configs / lottery_lists / lottery_rules / lottery_weights 五张表
 *
 * lottery_lists 敏感字段加密支持：
 * - phone, id_number 使用 AES-256-GCM 加密
 * - 生成 id_number_hash 盲索引用于等值查询和去重
 */
import { deserializeJsonb, serializeJsonb } from './jsonb.js';
import {
    decryptField,
    encryptField,
    normalizePhone,
    normalizeIdNumber,
    phoneBlindIndex,
    idNumberBlindIndex,
} from '../../utils/crypto.js';

// ─── race_capacity ──────────────────────────────────────────────────
export const raceCapacityMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: Number(row.id),
            orgId: row.org_id,
            raceId: Number(row.race_id),
            event: row.event,
            targetCount: Number(row.target_count),
            drawRatio: Number(row.draw_ratio),
            reservedRatio: Number(row.reserved_ratio),
            lotteryModeOverride: row.lottery_mode_override ?? 'inherit',
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    },

    toDbInsert(data, orgId) {
        return {
            org_id: orgId,
            race_id: data.raceId,
            event: data.event ?? '',
            target_count: data.targetCount ?? 0,
            draw_ratio: data.drawRatio ?? 0.85,
            reserved_ratio: data.reservedRatio ?? 0.15,
            lottery_mode_override: data.lotteryModeOverride ?? 'inherit',
        };
    },

    toDbUpdate(data) {
        const row = {};
        if (data.lotteryModeOverride !== undefined) row.lottery_mode_override = data.lotteryModeOverride;
        if (data.event !== undefined) row.event = data.event;
        if (data.targetCount !== undefined) row.target_count = data.targetCount;
        if (data.drawRatio !== undefined) row.draw_ratio = data.drawRatio;
        if (data.reservedRatio !== undefined) row.reserved_ratio = data.reservedRatio;
        row.updated_at = new Date();
        return row;
    },
};

// ─── lottery_configs ────────────────────────────────────────────────
export const lotteryConfigMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: Number(row.id),
            orgId: row.org_id,
            raceId: Number(row.race_id),
            zone: row.zone,
            eventType: row.event_type,
            capacity: Number(row.capacity),
            rules: deserializeJsonb(row.rules, []),
            calcType: row.calc_type,
            length: Number(row.length),
            width: Number(row.width),
            color: row.color,
            designCapacity: Number(row.design_capacity),
            intervalGap: Number(row.interval_gap),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    },

    toDbInsert(data, orgId) {
        return {
            org_id: orgId,
            race_id: data.raceId,
            zone: data.zone ?? null,
            event_type: data.eventType ?? null,
            capacity: data.capacity ?? 0,
            rules: serializeJsonb(data.rules, []),
            calc_type: data.calcType ?? 'manual',
            length: data.length ?? 0,
            width: data.width ?? 0,
            color: data.color ?? '#3B82F6',
            design_capacity: data.designCapacity ?? 0,
            interval_gap: data.intervalGap ?? 0,
        };
    },

    toDbUpdate(data) {
        const row = {};
        if (data.zone !== undefined) row.zone = data.zone;
        if (data.eventType !== undefined) row.event_type = data.eventType;
        if (data.capacity !== undefined) row.capacity = data.capacity;
        if (data.rules !== undefined) row.rules = serializeJsonb(data.rules, []);
        if (data.calcType !== undefined) row.calc_type = data.calcType;
        if (data.length !== undefined) row.length = data.length;
        if (data.width !== undefined) row.width = data.width;
        if (data.color !== undefined) row.color = data.color;
        if (data.designCapacity !== undefined) row.design_capacity = data.designCapacity;
        if (data.intervalGap !== undefined) row.interval_gap = data.intervalGap;
        row.updated_at = new Date();
        return row;
    },
};

// ─── lottery_lists ──────────────────────────────────────────────────
export const lotteryListMapper = {
    fromDbRow(row) {
        if (!row) return null;

        // 创建解密上下文（需要与加密时的 AAD 一致）
        // 注意：race_id 是 bigint 列，pg 驱动返回字符串，必须转为 Number 才能匹配加密时的类型
        const ctx = {
            tableName: 'lottery_lists',
            orgId: row.org_id,
            raceId: Number(row.race_id),
        };

        // 解密敏感字段（支持双读）
        const idNumber = decryptField(row.id_number, { ...ctx, columnName: 'id_number' });
        const phone = decryptField(row.phone, { ...ctx, columnName: 'phone' });

        return {
            id: Number(row.id),
            orgId: row.org_id,
            raceId: Number(row.race_id),
            listType: row.list_type,
            name: row.name,
            idNumber,
            phone,
            matchedRecordId: row.matched_record_id != null ? Number(row.matched_record_id) : null,
            matchType: row.match_type,
            createdAt: row.created_at,
            // 保留 hash 列用于查询（不暴露给前端）
            _idNumberHash: row.id_number_hash,
        };
    },

    toDbInsert(data, orgId) {
        // 加密敏感字段
        const idNumber = data.idNumber ?? '';
        const phone = data.phone ?? '';

        return {
            org_id: orgId,
            race_id: data.raceId,
            list_type: data.listType,
            name: data.name ?? '',
            id_number: idNumber ? encryptField(normalizeIdNumber(idNumber), { tableName: 'lottery_lists', columnName: 'id_number', orgId, raceId: data.raceId }) : '',
            phone: phone ? encryptField(normalizePhone(phone), { tableName: 'lottery_lists', columnName: 'phone', orgId, raceId: data.raceId }) : '',
            matched_record_id: data.matchedRecordId ?? null,
            match_type: data.matchType ?? null,
            // 盲索引用于等值查询和去重
            id_number_hash: idNumber ? idNumberBlindIndex(idNumber) : null,
        };
    },

    toDbUpdate(data, orgId, raceId) {
        const row = {};
        if (data.name !== undefined) row.name = data.name;

        // 创建加密上下文
        const ctx = {
            tableName: 'lottery_lists',
            orgId,
            raceId,
        };

        // 敏感字段加密处理
        if (data.idNumber !== undefined) {
            const idNumber = data.idNumber ?? '';
            row.id_number = idNumber ? encryptField(normalizeIdNumber(idNumber), { ...ctx, columnName: 'id_number' }) : '';
            row.id_number_hash = idNumber ? idNumberBlindIndex(idNumber) : null;
        }

        if (data.phone !== undefined) {
            const phone = data.phone ?? '';
            row.phone = phone ? encryptField(normalizePhone(phone), { ...ctx, columnName: 'phone' }) : '';
        }

        if (data.matchedRecordId !== undefined) row.matched_record_id = data.matchedRecordId;
        if (data.matchType !== undefined) row.match_type = data.matchType;
        return row;
    },
};

// ─── lottery_rules ──────────────────────────────────────────────────
export const lotteryRuleMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: Number(row.id),
            orgId: row.org_id,
            raceId: Number(row.race_id),
            targetGroup: row.target_group,
            targetCount: Number(row.target_count),
            drawRatio: Number(row.draw_ratio),
            reservedRatio: Number(row.reserved_ratio),
            genderRatio: row.gender_ratio,
            regionRatio: row.region_ratio,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    },

    toDbInsert(data, orgId) {
        return {
            org_id: orgId,
            race_id: data.raceId,
            target_group: data.targetGroup ?? '',
            target_count: data.targetCount ?? 0,
            draw_ratio: data.drawRatio ?? 0.85,
            reserved_ratio: data.reservedRatio ?? 0.15,
            gender_ratio: data.genderRatio ?? '',
            region_ratio: data.regionRatio ?? '',
        };
    },

    toDbUpdate(data) {
        const row = {};
        if (data.targetGroup !== undefined) row.target_group = data.targetGroup;
        if (data.targetCount !== undefined) row.target_count = data.targetCount;
        if (data.drawRatio !== undefined) row.draw_ratio = data.drawRatio;
        if (data.reservedRatio !== undefined) row.reserved_ratio = data.reservedRatio;
        if (data.genderRatio !== undefined) row.gender_ratio = data.genderRatio;
        if (data.regionRatio !== undefined) row.region_ratio = data.regionRatio;
        row.updated_at = new Date();
        return row;
    },
};

// ─── lottery_weights ────────────────────────────────────────────────
export const lotteryWeightMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: Number(row.id),
            orgId: row.org_id,
            raceId: Number(row.race_id),
            targetGroup: row.target_group,
            weightType: row.weight_type,
            enabled: Number(row.enabled),
            weightConfig: deserializeJsonb(row.weight_config, {}),
            priority: Number(row.priority),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    },

    toDbInsert(data, orgId) {
        return {
            org_id: orgId,
            race_id: data.raceId,
            target_group: data.targetGroup ?? 'ALL',
            weight_type: data.weightType ?? 'gender',
            enabled: data.enabled ? 1 : 0,
            weight_config: serializeJsonb(data.weightConfig, {}),
            priority: data.priority ?? 0,
        };
    },

    toDbUpdate(data) {
        const row = {};
        if (data.targetGroup !== undefined) row.target_group = data.targetGroup;
        if (data.weightType !== undefined) row.weight_type = data.weightType;
        if (data.enabled !== undefined) row.enabled = data.enabled ? 1 : 0;
        if (data.weightConfig !== undefined) row.weight_config = serializeJsonb(data.weightConfig, {});
        if (data.priority !== undefined) row.priority = data.priority;
        row.updated_at = new Date();
        return row;
    },
};

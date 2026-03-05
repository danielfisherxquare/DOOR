/**
 * Records Mapper — snake_case (DB) ↔ camelCase (API)
 * 40+ 字段，与前端 DbRecord 接口 1:1 对齐
 */
import { deserializeJsonb, serializeJsonb } from './jsonb.js';

export const recordMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: Number(row.id),
            orgId: row.org_id,
            raceId: Number(row.race_id),
            name: row.name,
            namePinyin: row.name_pinyin,
            phone: row.phone,
            country: row.country,
            idType: row.id_type,
            idNumber: row.id_number,
            gender: row.gender,
            age: row.age,
            birthday: row.birthday,
            event: row.event,
            source: row.source,
            clothingSize: row.clothing_size,
            province: row.province,
            city: row.city,
            district: row.district,
            address: row.address,
            email: row.email,
            emergencyName: row.emergency_name,
            emergencyPhone: row.emergency_phone,
            bloodType: row.blood_type,
            orderGroupId: row.order_group_id,
            paymentStatus: row.payment_status,
            mark: row.mark,
            lotteryStatus: row.lottery_status,
            personalBestFull: deserializeJsonb(row.personal_best_full, null),
            personalBestHalf: deserializeJsonb(row.personal_best_half, null),
            lotteryZone: row.lottery_zone,
            bagWindowNo: row.bag_window_no,
            bagNo: row.bag_no,
            expoWindowNo: row.expo_window_no,
            bibNumber: row.bib_number,
            bibColor: row.bib_color,
            _source: row._source,
            _importedAt: row._imported_at,
            runnerCategory: row.runner_category,
            auditStatus: row.audit_status,
            rejectReason: row.reject_reason,
            isLocked: row.is_locked,
            regionType: row.region_type,
            duplicateCount: row.duplicate_count,
            duplicateSources: row.duplicate_sources,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    },

    toDbInsert(data) {
        return {
            org_id: data.orgId,
            race_id: data.raceId,
            name: data.name ?? '',
            name_pinyin: data.namePinyin ?? '',
            phone: data.phone ?? '',
            country: data.country ?? '',
            id_type: data.idType ?? '',
            id_number: data.idNumber ?? '',
            gender: data.gender ?? '',
            age: data.age ?? '',
            birthday: data.birthday ?? '',
            event: data.event ?? '',
            source: data.source ?? '',
            clothing_size: data.clothingSize ?? '',
            province: data.province ?? '',
            city: data.city ?? '',
            district: data.district ?? '',
            address: data.address ?? '',
            email: data.email ?? '',
            emergency_name: data.emergencyName ?? '',
            emergency_phone: data.emergencyPhone ?? '',
            blood_type: data.bloodType ?? '',
            order_group_id: data.orderGroupId ?? '',
            payment_status: data.paymentStatus ?? '',
            mark: data.mark ?? '',
            lottery_status: data.lotteryStatus ?? null,
            personal_best_full: serializeJsonb(data.personalBestFull, null),
            personal_best_half: serializeJsonb(data.personalBestHalf, null),
            lottery_zone: data.lotteryZone ?? null,
            bag_window_no: data.bagWindowNo ?? null,
            bag_no: data.bagNo ?? null,
            expo_window_no: data.expoWindowNo ?? null,
            bib_number: data.bibNumber ?? null,
            bib_color: data.bibColor ?? null,
            _source: data._source ?? '',
            _imported_at: data._importedAt ?? new Date(),
            runner_category: data.runnerCategory ?? null,
            audit_status: data.auditStatus ?? null,
            reject_reason: data.rejectReason ?? null,
            is_locked: data.isLocked ?? 0,
            region_type: data.regionType ?? null,
            duplicate_count: data.duplicateCount ?? 0,
            duplicate_sources: data.duplicateSources ?? null,
        };
    },

    toDbUpdate(data) {
        const row = {};
        const map = {
            name: 'name', namePinyin: 'name_pinyin', phone: 'phone',
            country: 'country', idType: 'id_type', idNumber: 'id_number',
            gender: 'gender', age: 'age', birthday: 'birthday',
            event: 'event', source: 'source', clothingSize: 'clothing_size',
            province: 'province', city: 'city', district: 'district',
            address: 'address', email: 'email',
            emergencyName: 'emergency_name', emergencyPhone: 'emergency_phone',
            bloodType: 'blood_type', orderGroupId: 'order_group_id',
            paymentStatus: 'payment_status', mark: 'mark',
            lotteryStatus: 'lottery_status', lotteryZone: 'lottery_zone',
            bagWindowNo: 'bag_window_no', bagNo: 'bag_no',
            expoWindowNo: 'expo_window_no', bibNumber: 'bib_number',
            bibColor: 'bib_color', _source: '_source',
            runnerCategory: 'runner_category', auditStatus: 'audit_status',
            rejectReason: 'reject_reason', isLocked: 'is_locked',
            regionType: 'region_type', duplicateCount: 'duplicate_count',
            duplicateSources: 'duplicate_sources',
        };

        for (const [camel, snake] of Object.entries(map)) {
            if (data[camel] !== undefined) row[snake] = data[camel];
        }

        // JSON 字段需序列化
        if (data.personalBestFull !== undefined) {
            row.personal_best_full = serializeJsonb(data.personalBestFull, null);
        }
        if (data.personalBestHalf !== undefined) {
            row.personal_best_half = serializeJsonb(data.personalBestHalf, null);
        }

        row.updated_at = new Date();
        return row;
    },
};

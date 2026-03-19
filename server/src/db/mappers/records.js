/**
 * Records Mapper — snake_case (DB) ↔ camelCase (API)
 * 40+ 字段，与前端 DbRecord 接口 1:1 对齐
 *
 * 敏感字段加密支持：
 * - phone, emergency_phone, id_number 使用 AES-256-GCM 加密
 * - 生成 phone_hash, id_number_hash 盲索引用于等值查询
 * - 支持双读：兼容旧数据明文格式
 */
import { deserializeJsonb, serializeJsonb } from './jsonb.js';
import {
    decryptField,
    encryptField,
    normalizePhone,
    normalizeIdNumber,
    phoneBlindIndex,
    idNumberBlindIndex,
    isEncrypted,
} from '../../utils/crypto.js';

/**
 * 创建 AAD 上下文（用于加密完整性校验）
 * @param {object} data - 记录数据
 * @returns {object} AAD 上下文
 */
function createEncryptionContext(data) {
    return {
        tableName: 'records',
        orgId: data.orgId,
        raceId: data.raceId,
    };
}

export const recordMapper = {
    fromDbRow(row) {
        if (!row) return null;

        // 创建解密上下文（需要与加密时的 AAD 一致）
        // 注意：race_id 是 bigint 列，pg 驱动返回字符串，必须转为 Number 才能匹配加密时的类型
        const ctx = {
            tableName: 'records',
            orgId: row.org_id,
            raceId: Number(row.race_id),
        };

        // 解密敏感字段（支持双读）
        const phone = decryptField(row.phone, { ...ctx, columnName: 'phone' });
        const emergencyPhone = decryptField(row.emergency_phone, { ...ctx, columnName: 'emergency_phone' });
        const idNumber = decryptField(row.id_number, { ...ctx, columnName: 'id_number' });

        return {
            id: Number(row.id),
            orgId: row.org_id,
            raceId: Number(row.race_id),
            name: row.name,
            namePinyin: row.name_pinyin,
            phone,
            country: row.country,
            idType: row.id_type,
            idNumber,
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
            emergencyPhone,
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
            // 保留 hash 列用于查询（不暴露给前端）
            _phoneHash: row.phone_hash,
            _idNumberHash: row.id_number_hash,
        };
    },

    toDbInsert(data) {
        const ctx = createEncryptionContext(data);

        // 加密敏感字段
        const phone = data.phone ?? '';
        const emergencyPhone = data.emergencyPhone ?? '';
        const idNumber = data.idNumber ?? '';

        return {
            org_id: data.orgId,
            race_id: data.raceId,
            name: data.name ?? '',
            name_pinyin: data.namePinyin ?? '',
            phone: phone ? encryptField(normalizePhone(phone), { ...ctx, columnName: 'phone' }) : '',
            country: data.country ?? '',
            id_type: data.idType ?? '',
            id_number: idNumber ? encryptField(normalizeIdNumber(idNumber), { ...ctx, columnName: 'id_number' }) : '',
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
            emergency_phone: emergencyPhone ? encryptField(normalizePhone(emergencyPhone), { ...ctx, columnName: 'emergency_phone' }) : '',
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
            // 盲索引用于等值查询
            phone_hash: phone ? phoneBlindIndex(phone) : null,
            id_number_hash: idNumber ? idNumberBlindIndex(idNumber) : null,
        };
    },

    toDbUpdate(data, orgId, raceId) {
        const row = {};
        const map = {
            name: 'name', namePinyin: 'name_pinyin',
            country: 'country', idType: 'id_type',
            gender: 'gender', age: 'age', birthday: 'birthday',
            event: 'event', source: 'source', clothingSize: 'clothing_size',
            province: 'province', city: 'city', district: 'district',
            address: 'address', email: 'email',
            emergencyName: 'emergency_name',
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

        // 敏感字段加密处理
        // 使用传入的 orgId/raceId，或从 data 中获取
        const ctx = createEncryptionContext({
            orgId: orgId ?? data.orgId,
            raceId: raceId ?? data.raceId,
        });

        if (data.phone !== undefined) {
            const phone = data.phone ?? '';
            row.phone = phone ? encryptField(normalizePhone(phone), { ...ctx, columnName: 'phone' }) : '';
            row.phone_hash = phone ? phoneBlindIndex(phone) : null;
        }

        if (data.emergencyPhone !== undefined) {
            const emergencyPhone = data.emergencyPhone ?? '';
            row.emergency_phone = emergencyPhone ? encryptField(normalizePhone(emergencyPhone), { ...ctx, columnName: 'emergency_phone' }) : '';
        }

        if (data.idNumber !== undefined) {
            const idNumber = data.idNumber ?? '';
            row.id_number = idNumber ? encryptField(normalizeIdNumber(idNumber), { ...ctx, columnName: 'id_number' }) : '';
            row.id_number_hash = idNumber ? idNumberBlindIndex(idNumber) : null;
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

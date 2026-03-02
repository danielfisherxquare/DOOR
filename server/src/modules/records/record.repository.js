/**
 * Record Repository — 选手记录数据访问层（读路径）
 * 支持综合查询、统计分析、字段唯一值、快速统计
 */
import knex from '../../db/knex.js';
import { recordMapper } from '../../db/mappers/records.js';

// ── 字段白名单（防 SQL 注入）──────────────────────────
const ALLOWED_FILTER_FIELDS = new Set([
    'name', 'name_pinyin', 'phone', 'country', 'id_type', 'id_number',
    'gender', 'age', 'birthday', 'event', 'source', 'clothing_size',
    'province', 'city', 'district', 'address', 'email',
    'emergency_name', 'emergency_phone', 'blood_type',
    'order_group_id', 'payment_status', 'mark',
    'lottery_status', 'lottery_zone', 'bib_number', 'bib_color',
    '_source', 'runner_category', 'audit_status', 'reject_reason',
    'region_type',
]);

const UNIQUE_VALUES_ALLOWED = new Set([
    'event', 'gender', 'source', 'clothing_size', 'province', 'city',
    'country', 'payment_status', 'lottery_status', 'runner_category',
    'audit_status', 'region_type', '_source', 'blood_type',
]);

// camelCase → snake_case 映射
const FIELD_MAP = {
    namePinyin: 'name_pinyin', idType: 'id_type', idNumber: 'id_number',
    clothingSize: 'clothing_size', emergencyName: 'emergency_name',
    emergencyPhone: 'emergency_phone', bloodType: 'blood_type',
    orderGroupId: 'order_group_id', paymentStatus: 'payment_status',
    lotteryStatus: 'lottery_status', lotteryZone: 'lottery_zone',
    bagWindowNo: 'bag_window_no', bagNo: 'bag_no',
    expoWindowNo: 'expo_window_no', bibNumber: 'bib_number',
    bibColor: 'bib_color', _source: '_source', _importedAt: '_imported_at',
    runnerCategory: 'runner_category', auditStatus: 'audit_status',
    rejectReason: 'reject_reason', isLocked: 'is_locked',
    regionType: 'region_type', duplicateCount: 'duplicate_count',
    duplicateSources: 'duplicate_sources',
};

function toSnake(field) {
    return FIELD_MAP[field] || field;
}

// ── 应用筛选条件 ──────────────────────────────────────

function applyFilters(qb, filters) {
    if (!filters?.length) return;

    for (const f of filters) {
        const col = toSnake(f.field);
        if (!ALLOWED_FILTER_FIELDS.has(col)) continue;

        switch (f.operator) {
            case 'contains':
                qb.whereILike(col, `%${f.value}%`);
                break;
            case 'equals':
                qb.where(col, f.value);
                break;
            case 'startsWith':
                qb.whereILike(col, `${f.value}%`);
                break;
            case 'endsWith':
                qb.whereILike(col, `%${f.value}`);
                break;
            case 'notEmpty':
                qb.where(col, '!=', '').whereNotNull(col);
                break;
            case 'empty':
                qb.where(function () {
                    this.where(col, '').orWhereNull(col);
                });
                break;
            case 'in':
                if (Array.isArray(f.value)) qb.whereIn(col, f.value);
                break;
        }
    }
}

// ── 综合查询 ──────────────────────────────────────────

export async function query(orgId, raceId, { keyword, filters, offset = 0, limit = 50, sort } = {}) {
    const base = knex('records').where({ org_id: orgId });
    if (raceId) base.where({ race_id: raceId });

    // 关键词搜索
    if (keyword?.trim()) {
        const kw = `%${keyword.trim()}%`;
        base.where(function () {
            this.whereILike('name', kw)
                .orWhereILike('id_number', kw)
                .orWhereILike('phone', kw);
        });
    }

    applyFilters(base, filters);

    // 总数
    const [{ count }] = await base.clone().count('* as count');
    const total = parseInt(count, 10);

    // 排序
    const sortCol = sort?.field ? toSnake(sort.field) : 'id';
    const sortDir = sort?.direction === 'asc' ? 'asc' : 'desc';
    base.orderBy(sortCol, sortDir);

    // 分页
    const rows = await base.offset(offset).limit(limit);

    return {
        records: rows.map(recordMapper.fromDbRow),
        total,
    };
}

// ── 数据库分析统计 ────────────────────────────────────

export async function analysis(orgId, raceId, { keyword, filters } = {}) {
    const base = knex('records').where({ org_id: orgId });
    if (raceId) base.where({ race_id: raceId });

    if (keyword?.trim()) {
        const kw = `%${keyword.trim()}%`;
        base.where(function () {
            this.whereILike('name', kw)
                .orWhereILike('id_number', kw)
                .orWhereILike('phone', kw);
        });
    }
    applyFilters(base, filters);

    // 总数
    const [{ count }] = await base.clone().count('* as count');
    const total = parseInt(count, 10);

    // 按项目+性别统计
    const genderByEvent = await base.clone()
        .select('event')
        .select(knex.raw("count(*) filter (where gender = 'M' or gender = '男') as m"))
        .select(knex.raw("count(*) filter (where gender = 'F' or gender = '女') as f"))
        .select(knex.raw('count(*) as total'))
        .groupBy('event');

    // 按项目+衣服尺码统计
    const clothingSizeByEvent = await base.clone()
        .select('event', 'clothing_size as size')
        .count('* as count')
        .where('clothing_size', '!=', '')
        .groupBy('event', 'clothing_size');

    // 国籍分布
    const nationality = await base.clone()
        .select('country as label')
        .count('* as count')
        .where('country', '!=', '')
        .groupBy('country')
        .orderBy('count', 'desc')
        .limit(50);

    // 省份分布
    const province = await base.clone()
        .select('province as label')
        .count('* as count')
        .where('province', '!=', '')
        .groupBy('province')
        .orderBy('count', 'desc')
        .limit(50);

    // 城市分布
    const city = await base.clone()
        .select('city as label')
        .count('* as count')
        .where('city', '!=', '')
        .groupBy('city')
        .orderBy('count', 'desc')
        .limit(50);

    return {
        total,
        genderByEvent: genderByEvent.map(r => ({
            event: r.event,
            m: parseInt(r.m, 10),
            f: parseInt(r.f, 10),
            total: parseInt(r.total, 10),
        })),
        clothingSizeByEvent: clothingSizeByEvent.map(r => ({
            event: r.event,
            size: r.size,
            count: parseInt(r.count, 10),
        })),
        nationality: nationality.map(r => ({ label: r.label, count: parseInt(r.count, 10) })),
        province: province.map(r => ({ label: r.label, count: parseInt(r.count, 10) })),
        city: city.map(r => ({ label: r.label, count: parseInt(r.count, 10) })),
    };
}

// ── 字段唯一值 ────────────────────────────────────────

export async function uniqueValues(orgId, raceId, field, limit = 500) {
    const col = toSnake(field);
    if (!UNIQUE_VALUES_ALLOWED.has(col)) {
        const err = new Error(`不允许查询字段: ${field}`);
        err.status = 400;
        err.expose = true;
        throw err;
    }

    const base = knex('records').where({ org_id: orgId });
    if (raceId) base.where({ race_id: raceId });

    const rows = await base
        .distinct(col)
        .where(col, '!=', '')
        .whereNotNull(col)
        .orderBy(col, 'asc')
        .limit(limit);

    return rows.map(r => r[col]);
}

// ── 首页快速统计 ──────────────────────────────────────

export async function quickStats(orgId, raceId, winnerStatuses = []) {
    const base = knex('records').where({ org_id: orgId, race_id: raceId });

    const [{ count: totalRows }] = await base.clone().count('* as count');

    let winnerCount = 0;
    if (winnerStatuses.length > 0) {
        const [{ count }] = await base.clone()
            .whereIn('lottery_status', winnerStatuses)
            .count('* as count');
        winnerCount = parseInt(count, 10);
    }

    const [{ count: fileCount }] = await base.clone()
        .countDistinct('_source as count');

    // 最后更新时间
    const latest = await base.clone()
        .max('_imported_at as max_imported')
        .first();

    return {
        totalRows: parseInt(totalRows, 10),
        winnerCount,
        fileCount: parseInt(fileCount, 10),
        updatedAt: latest?.max_imported ?? '',
    };
}

// ── 记录总数 ──────────────────────────────────────────

export async function count(orgId, raceId) {
    const base = knex('records').where({ org_id: orgId });
    if (raceId) base.where({ race_id: raceId });
    const [{ count }] = await base.count('* as count');
    return parseInt(count, 10);
}

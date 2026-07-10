/**
 * Record Repository — 选手记录数据访问层（读路径）
 * 支持综合查询、统计分析、字段唯一值、快速统计
 *
 * 🔐 加密字段处理：
 * - phone, id_number, emergency_phone 已加密
 * - 使用 blind index (phone_hash, id_number_hash) 进行精确匹配
 * - 模糊搜索 (contains/startsWith/endsWith) 不适用于加密字段
 */
import knex from '../../db/knex.js';
import { isHalfEvent } from '../../utils/event-normalizer.js';
import { recordMapper } from '../../db/mappers/records.js';
import {
    idNumberBlindIndex,
    phoneBlindIndex,
} from '../../utils/crypto.js';

// super_admin 的 orgId 为 null，此时不加 org_id 过滤
function scopeOrg(qb, orgId) {
    if (orgId) qb.where({ org_id: orgId });
    return qb;
}

// ── 字段白名单（防 SQL 注入）──────────────────────────
const ALLOWED_FILTER_FIELDS = new Set([
    'name', 'name_pinyin', 'country', 'id_type',
    'gender', 'age', 'birthday', 'event', 'source', 'clothing_size',
    'province', 'city', 'district', 'address', 'email',
    'emergency_name', 'blood_type',
    'order_group_id', 'payment_status', 'mark',
    'lottery_status', 'lottery_zone', 'bib_number', 'bib_color',
    '_source', 'runner_category', 'audit_status', 'reject_reason',
    'region_type',
]);

// 🔐 加密字段：仅支持 equals 操作符（使用 blind index）
const ENCRYPTED_FIELDS = new Set(['phone', 'id_number', 'emergency_phone']);
const ENCRYPTED_FIELD_HASH_MAP = {
    phone: 'phone_hash',
    id_number: 'id_number_hash',
    emergency_phone: null, // 无单独 hash 列
};

const UNIQUE_VALUES_ALLOWED = new Set([
    'event', 'gender', 'source', 'clothing_size', 'province', 'city',
    'country', 'payment_status', 'lottery_status', 'runner_category',
    'audit_status', 'region_type', '_source', 'blood_type',
]);

// camelCase → snake_case 映射
const FIELD_MAP = {
    orgId: 'org_id', raceId: 'race_id',
    namePinyin: 'name_pinyin', idType: 'id_type', idNumber: 'id_number',
    clothingSize: 'clothing_size', emergencyName: 'emergency_name',
    emergencyPhone: 'emergency_phone', bloodType: 'blood_type',
    orderGroupId: 'order_group_id', paymentStatus: 'payment_status',
    lotteryStatus: 'lottery_status', lotteryZone: 'lottery_zone',
    bagWindowNo: 'bag_window_no', bagNo: 'bag_no',
    expoWindowNo: 'expo_window_no', bibNumber: 'bib_number',
    bibColor: 'bib_color', _source: '_source', _importedAt: '_imported_at',
    personalBestFull: 'personal_best_full', personalBestHalf: 'personal_best_half',
    runnerCategory: 'runner_category', auditStatus: 'audit_status',
    rejectReason: 'reject_reason', isLocked: 'is_locked',
    regionType: 'region_type', duplicateCount: 'duplicate_count',
    duplicateSources: 'duplicate_sources',
    createdAt: 'created_at', updatedAt: 'updated_at',
};

function toSnake(field) {
    return FIELD_MAP[field] || field;
}

// ── 应用筛选条件 ──────────────────────────────────────

function applyFilters(qb, filters) {
    if (!filters?.length) return;

    for (const f of filters) {
        const col = toSnake(f.field);

        // 🔐 加密字段：仅支持 equals/notEmpty/empty（使用 blind index 或 hash 列）
        if (ENCRYPTED_FIELDS.has(col)) {
            const hashCol = ENCRYPTED_FIELD_HASH_MAP[col];
            switch (f.operator) {
                case 'equals':
                    if (hashCol) {
                        // 使用 blind index 进行精确匹配
                        const hash = col === 'id_number'
                            ? idNumberBlindIndex(f.value)
                            : col === 'phone'
                                ? phoneBlindIndex(f.value)
                                : null;
                        if (hash) qb.where(hashCol, hash);
                    }
                    break;
                case 'notEmpty':
                    if (hashCol) {
                        qb.whereNotNull(hashCol);
                    } else {
                        qb.where(col, '!=', '').whereNotNull(col);
                    }
                    break;
                case 'empty':
                    if (hashCol) {
                        qb.whereNull(hashCol);
                    } else {
                        qb.where(function () {
                            this.where(col, '').orWhereNull(col);
                        });
                    }
                    break;
                // contains/startsWith/endsWith 不支持加密字段，静默忽略
            }
            continue;
        }

        // 非加密字段的正常处理
        if (!ALLOWED_FILTER_FIELDS.has(col)) continue;

        switch (f.operator) {
            case 'contains':
                qb.whereILike(col, `%${f.value}%`);
                break;
            case 'equals':
                qb.where(col, f.value);
                break;
            case 'notEquals':
                qb.whereNot(col, f.value);
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
    const base = scopeOrg(knex('records'), orgId);
    if (raceId) base.where({ race_id: raceId });

    // 关键词搜索（仅 name 可用 LIKE，加密字段无法模糊搜索）
    if (keyword?.trim()) {
        const kw = `%${keyword.trim()}%`;
        base.whereILike('name', kw);
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
    const base = scopeOrg(knex('records'), orgId);
    if (raceId) base.where({ race_id: raceId });

    // 关键词搜索（仅 name 可用 LIKE，加密字段无法模糊搜索）
    if (keyword?.trim()) {
        const kw = `%${keyword.trim()}%`;
        base.whereILike('name', kw);
    }
    applyFilters(base, filters);

    // ── 并行执行所有统计查询（5 → 1 次往返）──────────────
    const [
        [{ count }],
        genderByEvent,
        clothingSizeByEvent,
        nationality,
        province,
        city,
    ] = await Promise.all([
        // 总数
        base.clone().count('* as count'),

        // 按项目+性别统计
        base.clone()
            .select('event')
            .select(knex.raw("count(*) filter (where gender = 'M' or gender = '男') as m"))
            .select(knex.raw("count(*) filter (where gender = 'F' or gender = '女') as f"))
            .select(knex.raw('count(*) as total'))
            .groupBy('event'),

        // 按项目+衣服尺码统计
        base.clone()
            .select('event', 'clothing_size as size')
            .count('* as count')
            .where('clothing_size', '!=', '')
            .groupBy('event', 'clothing_size'),

        // 国籍分布
        base.clone()
            .select('country as label')
            .count('* as count')
            .where('country', '!=', '')
            .groupBy('country')
            .orderBy('count', 'desc')
            .limit(50),

        // 省份分布
        base.clone()
            .select('province as label')
            .count('* as count')
            .where('province', '!=', '')
            .groupBy('province')
            .orderBy('count', 'desc')
            .limit(50),

        // 城市分布
        base.clone()
            .select('city as label')
            .count('* as count')
            .where('city', '!=', '')
            .groupBy('city')
            .orderBy('count', 'desc')
            .limit(50),
    ]);

    const total = parseInt(count, 10);

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

    const base = scopeOrg(knex('records'), orgId);
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
    const base = scopeOrg(knex('records'), orgId).where({ race_id: raceId });

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
    const base = scopeOrg(knex('records'), orgId);
    if (raceId) base.where({ race_id: raceId });
    const [{ count }] = await base.count('* as count');
    return parseInt(count, 10);
}

// ── 单条记录更新（写路径）──────────────────────────────

export async function findRecordScope(orgId, recordId, db = knex) {
    const query = db('records').where({ id: recordId });
    if (orgId) query.andWhere({ org_id: orgId });
    const row = await query.first('id', 'org_id', 'race_id');
    return row ? { id: Number(row.id), orgId: row.org_id, raceId: Number(row.race_id) } : null;
}

export async function findRecordScopes(orgId, recordIds, db = knex) {
    if (!Array.isArray(recordIds) || recordIds.length === 0) return [];
    const query = db('records').whereIn('id', recordIds);
    if (orgId) query.andWhere({ org_id: orgId });
    const rows = await query.select('id', 'org_id', 'race_id');
    return rows.map(row => ({
        id: Number(row.id),
        orgId: row.org_id,
        raceId: Number(row.race_id),
    }));
}

export async function updateById(orgId, recordId, data, db = knex) {
    // 先获取现有记录的 raceId（用于加密上下文）
    const existing = await findRecordScope(orgId, recordId, db);

    if (!existing) return null;

    const row = recordMapper.toDbUpdate(data, orgId, existing.raceId);
    const query = db('records').where({ id: recordId });
    if (orgId) query.andWhere({ org_id: orgId });
    const [updated] = await query.update(row).returning('*');
    return updated ? recordMapper.fromDbRow(updated) : null;
}

export async function bulkUpdate(orgId, updates, db = knex) {
    if (!Array.isArray(updates) || updates.length === 0) {
        return { updated: 0 };
    }

    // 收集有效的 recordId 列表
    const validItems = [];
    for (const item of updates) {
        const recordId = Number(item?.id);
        if (Number.isFinite(recordId) && recordId > 0) {
            validItems.push({ recordId, data: item?.data || {} });
        }
    }
    if (validItems.length === 0) return { updated: 0 };

    let updated = 0;
    const allIds = validItems.map(v => v.recordId);
    const existingRows = await findRecordScopes(orgId, allIds, db);
    const raceIdMap = new Map(existingRows.map(row => [row.id, row.raceId]));

    // ── 逐条 UPDATE（因每条加密数据不同，无法完全批量化）──
    for (const { recordId, data } of validItems) {
        const raceId = raceIdMap.get(recordId);
        if (raceId === undefined) continue;

        const row = recordMapper.toDbUpdate(data, orgId, raceId);
        if (Object.keys(row).length === 0) continue;

        const q = db('records').where({ id: recordId });
        if (orgId) q.andWhere({ org_id: orgId });
        const count = await q.update(row);
        updated += count;
    }

    return { updated };
}

// ── 清空赛事数据 ──────────────────────────────────────

export async function deleteByRaceId(orgId, raceId, db = knex) {
    // 1. 删除 Records
    const recordsQuery = db('records').where({ race_id: raceId });
    if (orgId) recordsQuery.andWhere({ org_id: orgId });
    const deletedRecordsCount = await recordsQuery.delete();

        // 2. 删除 快照 (预抽签、预排号)
    const snapshotsQuery = db('pipeline_snapshots').where({ race_id: raceId });
    if (orgId) snapshotsQuery.andWhere({ org_id: orgId });
    await snapshotsQuery.delete(); // DB cascade will delete items

        // 3. 删除 抽签结果
    const lotteryResultsQuery = db('lottery_results').where({ race_id: raceId });
    if (orgId) lotteryResultsQuery.andWhere({ org_id: orgId });
    await lotteryResultsQuery.delete();

        // 4. 删除 排号结果
    const bibAssignmentsQuery = db('bib_assignments').where({ race_id: raceId });
    if (orgId) bibAssignmentsQuery.andWhere({ org_id: orgId });
    await bibAssignmentsQuery.delete();

        // 5. 删除 名单 (黑白名单等)
    const lotteryListsQuery = db('lottery_lists').where({ race_id: raceId });
    if (orgId) lotteryListsQuery.andWhere({ org_id: orgId });
    await lotteryListsQuery.delete();

        // 6. 重置 服装库存 (已用量归零，保留实际库存)
    const clothingQuery = db('clothing_limits').where({ race_id: raceId });
    if (orgId) clothingQuery.andWhere({ org_id: orgId });
    await clothingQuery.update({ used_count: 0 });

    return deletedRecordsCount;
}

// ── 流式导出（返回 Knex stream 用于 NDJSON）──────────

export function streamByRaceId(orgId, raceId, db = knex) {
    const query = db('records').where({ race_id: raceId });
    if (orgId) query.andWhere({ org_id: orgId });
    return query.orderBy('id', 'asc').stream();
}

// ── 校验成绩导入 ──────────────────────────────────────

const PERSONAL_BEST_COLUMNS = new Set(['personal_best_full', 'personal_best_half']);

export function buildPersonalBestCaseUpdateSql({ items, column, raceId, orgId }) {
    if (!PERSONAL_BEST_COLUMNS.has(column)) {
        throw new Error(`Invalid personal best column: ${column}`);
    }
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error('items must be a non-empty array');
    }

    const hashes = items.map(b => b.hash);
    const whenClauses = items.map(() => 'WHEN id_number_hash = ? THEN ?::jsonb').join(' ');
    const whenParams = items.flatMap(b => [b.hash, b.pbJson]);

    const orgClause = orgId ? 'AND org_id = ?' : '';
    const orgParams = orgId ? [orgId] : [];

    const sql = `
        UPDATE records
        SET ${column} = CASE ${whenClauses} END,
            updated_at = NOW()
        WHERE race_id = ?
          AND id_number_hash IN (${hashes.map(() => '?').join(',')})
          ${orgClause}
    `;

    return {
        sql,
        params: [
            ...whenParams,
            raceId,
            ...hashes,
            ...orgParams,
        ],
    };
}

/**
 * 批量导入校验成绩（更新 personal_best_full / personal_best_half）
 * @param {string} orgId
 * @param {number} raceId
 * @param {Array<{ idNumber: string, netTime: string, raceName?: string, raceDate?: string, event: string }>} results
 * @returns {Promise<{ updated: number }>}
 */
export async function importVerificationResults(orgId, raceId, results, db = knex) {
    if (!results || results.length === 0) return { updated: 0 };

    const safeRaceId = Number(raceId);
    if (!safeRaceId || !Number.isFinite(safeRaceId)) {
        throw new Error('Invalid raceId');
    }

    // ── 分组：Full / Half ─────────────────────────────────
    const fullMap = new Map();   // idNumber → pbJson
    const halfMap = new Map();

    for (const res of results) {
        if (!res.idNumber || !res.netTime) continue;

        const pbJson = JSON.stringify({
            raceName: res.raceName || '未知赛事',
            netTime: res.netTime,
            date: res.raceDate || '',
        });

        const isHalf = isHalfEvent(res.event);
        const target = isHalf ? halfMap : fullMap;
        // 同一 idNumber 后面的覆盖前面的
        target.set(res.idNumber.trim(), pbJson);
    }

    // ── 预计算所有 blind index（CPU 密集，在事务外完成）──
    /** @param {Map<string, string>} inputMap @returns {Array<{hash: string, pbJson: string}>} */
    function precomputeHashes(inputMap) {
        const items = [];
        for (const [idNum, pbJson] of inputMap) {
            const hash = idNumberBlindIndex(idNum);
            if (hash) items.push({ hash, pbJson });
        }
        return items;
    }

    const fullItems = fullMap.size > 0 ? precomputeHashes(fullMap) : [];
    const halfItems = halfMap.size > 0 ? precomputeHashes(halfMap) : [];

    if (fullItems.length === 0 && halfItems.length === 0) {
        return { updated: 0 };
    }

    let totalUpdated = 0;
    const BATCH = 500;

    // ── 批量 CASE UPDATE（每 BATCH 条一次 SQL）────────
    async function batchCaseUpdate(items, column) {
        for (let i = 0; i < items.length; i += BATCH) {
            const batch = items.slice(i, i + BATCH);
            const { sql, params } = buildPersonalBestCaseUpdateSql({
                items: batch,
                column,
                raceId: safeRaceId,
                orgId,
            });
            const result = await db.raw(sql, params);

            totalUpdated += result.rowCount || 0;
        }
    }

    if (fullItems.length > 0) {
        await batchCaseUpdate(fullItems, 'personal_best_full');
    }
    if (halfItems.length > 0) {
        await batchCaseUpdate(halfItems, 'personal_best_half');
    }
    return { updated: totalUpdated };
}

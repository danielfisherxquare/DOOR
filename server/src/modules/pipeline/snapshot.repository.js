/**
 * Snapshot Repository — 快照 数据访问层
 *
 * 支持两种快照类型：
 *   - 'pre_lottery' — 抽签前快照（保存审核/抽签状态字段）
 *   - 'pre_bib'     — 排号前快照（额外保存排号字段）
 *
 * 多租户隔离：所有查询必须带 org_id
 *
 * ⚠️ 快照唯一约束 UNIQUE(org_id, race_id, snapshot_type)
 *    同类型快照只保留最近一次，UPSERT 覆盖语义。
 */
import knex from '../../db/knex.js';

/** pre_lottery 快照保存的 records 字段 */
const LOTTERY_SNAPSHOT_FIELDS = [
    'audit_status',
    'lottery_status',
    'is_locked',
    'bib_number',
    'clothing_size',
    'runner_category',
];

/** pre_bib 快照额外保存的排号相关字段 */
const BIB_EXTRA_FIELDS = [
    'bag_window_no',
    'bag_no',
    'expo_window_no',
    'bib_color',
];

/** 根据快照类型决定需要保存哪些字段 */
function getSnapshotFields(type) {
    if (type === 'pre_bib') {
        return [...LOTTERY_SNAPSHOT_FIELDS, ...BIB_EXTRA_FIELDS];
    }
    return LOTTERY_SNAPSHOT_FIELDS;
}

/** 分批处理工具函数 — 防止 PG 65535 参数限制 */
const BATCH_SIZE = 1000;

async function batchInsert(trx, table, rows) {
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        await trx(table).insert(rows.slice(i, i + BATCH_SIZE));
    }
}

// ────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────

/**
 * 创建快照 — UPSERT 语义（覆盖同类型旧快照）
 *
 * @param {string} orgId
 * @param {number} raceId
 * @param {'pre_lottery'|'pre_bib'} type
 * @param {object} [metadata={}] - 全局统计元数据
 * @returns {{ snapshotId: number, itemCount: number }}
 */
export async function createSnapshot(orgId, raceId, type, metadata = {}, externalTrx = null) {
    const executor = async (trx) => {
        // 1. 删除旧快照（级联删 items）
        await trx('pipeline_snapshots')
            .where({ org_id: orgId, race_id: raceId, snapshot_type: type })
            .del();

        // 2. 创建新快照头
        const [snapshot] = await trx('pipeline_snapshots')
            .insert({
                org_id: orgId,
                race_id: raceId,
                snapshot_type: type,
                snapshot_data: JSON.stringify(metadata),
            })
            .returning('id');

        const snapshotId = typeof snapshot === 'object' ? snapshot.id : snapshot;

        // 3. 读取当前 records 的字段子集
        const fields = getSnapshotFields(type);
        const selectCols = ['id', ...fields];
        const records = await trx('records')
            .where({ org_id: orgId, race_id: raceId })
            .select(selectCols);

        // 4. 批量插入 snapshot_items
        if (records.length > 0) {
            const items = records.map((r) => ({
                snapshot_id: snapshotId,
                record_id: r.id,
                field_data: JSON.stringify(
                    fields.reduce((acc, f) => {
                        acc[f] = r[f] ?? null;
                        return acc;
                    }, {})
                ),
            }));
            await batchInsert(trx, 'pipeline_snapshot_items', items);
        }

        return { snapshotId, itemCount: records.length };
    };
    return externalTrx ? executor(externalTrx) : knex.transaction(executor);
}

/**
 * 从快照恢复 records 字段 — 批量 UPDATE
 *
 * @param {string} orgId
 * @param {number} raceId
 * @param {'pre_lottery'|'pre_bib'} type
 * @returns {{ restoredCount: number }}
 */
export async function restoreSnapshot(orgId, raceId, type, externalTrx = null) {
    const executor = async (trx) => {
        // 1. 找到快照头
        const snapshot = await trx('pipeline_snapshots')
            .where({ org_id: orgId, race_id: raceId, snapshot_type: type })
            .first();

        if (!snapshot) {
            throw new Error(`快照不存在: type=${type}, raceId=${raceId}`);
        }

        // 2. 读取所有 items
        const items = await trx('pipeline_snapshot_items')
            .where({ snapshot_id: snapshot.id });

        if (items.length === 0) {
            return { restoredCount: 0 };
        }

        // 3. 逐批恢复 records 字段
        const fields = getSnapshotFields(type);

        for (let i = 0; i < items.length; i += BATCH_SIZE) {
            const batch = items.slice(i, i + BATCH_SIZE);

            const values = batch.map((item) => {
                const data = typeof item.field_data === 'string'
                    ? JSON.parse(item.field_data)
                    : item.field_data;
                return `(${item.record_id}, '${JSON.stringify(data).replace(/'/g, "''")}'::jsonb)`;
            }).join(',\n');

            const setClauses = fields.map(
                (f) => `${f} = (snap.field_data->>'${f}')${numericFields.has(f) ? '::int' : ''}`
            ).join(', ');

            await trx.raw(`
                UPDATE records AS r
                SET ${setClauses}
                FROM (VALUES ${values}) AS snap(record_id, field_data)
                WHERE r.id = snap.record_id
                  AND r.org_id = ?
                  AND r.race_id = ?
            `, [orgId, raceId]);
        }

        return { restoredCount: items.length };
    };
    return externalTrx ? executor(externalTrx) : knex.transaction(executor);
}

/** 需要转为整数的字段 */
const numericFields = new Set(['is_locked']);

/**
 * 检查是否存在快照
 */
export async function hasSnapshot(orgId, raceId, type) {
    const row = await knex('pipeline_snapshots')
        .where({ org_id: orgId, race_id: raceId, snapshot_type: type })
        .first('id');
    return !!row;
}

/**
 * 删除快照（级联删 items）
 */
export async function deleteSnapshot(orgId, raceId, type, externalTrx = null) {
    const db = externalTrx || knex;
    const deleted = await db('pipeline_snapshots')
        .where({ org_id: orgId, race_id: raceId, snapshot_type: type })
        .del();
    return { deleted: deleted > 0 };
}

/**
 * 获取快照元数据（不含 items）
 */
export async function getSnapshotMeta(orgId, raceId, type) {
    const row = await knex('pipeline_snapshots')
        .where({ org_id: orgId, race_id: raceId, snapshot_type: type })
        .first();
    if (!row) return null;
    return {
        id: Number(row.id),
        orgId: row.org_id,
        raceId: Number(row.race_id),
        snapshotType: row.snapshot_type,
        snapshotData: row.snapshot_data ?? {},
        createdAt: row.created_at,
    };
}

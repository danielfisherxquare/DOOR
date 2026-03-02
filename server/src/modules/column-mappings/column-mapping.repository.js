/**
 * Column Mappings Repository — 列映射数据访问层（多租户隔离）
 */
import knex from '../../db/knex.js';
import { columnMappingMapper } from '../../db/mappers/column-mappings.js';

/**
 * 获取组织全部映射
 */
export async function findAllByOrg(orgId) {
    const rows = await knex('column_mappings')
        .where({ org_id: orgId })
        .orderBy('updated_at', 'desc');
    return rows.map(columnMappingMapper.fromDbRow);
}

/**
 * 批量 UPSERT — ON CONFLICT (org_id, source_column) 更新 target_field_id
 */
export async function upsertBatch(orgId, mappings) {
    if (!mappings || mappings.length === 0) return [];

    const rows = mappings.map((m) => columnMappingMapper.toDbInsert({ ...m, orgId }));

    // Knex onConflict().merge() 实现 UPSERT
    await knex('column_mappings')
        .insert(rows)
        .onConflict(['org_id', 'source_column'])
        .merge({
            target_field_id: knex.raw('EXCLUDED.target_field_id'),
            updated_at: knex.fn.now(),
        });

    return findAllByOrg(orgId);
}

/**
 * 按 ID 批量删除（带组织隔离）
 */
export async function deleteByIds(orgId, ids) {
    if (!ids || ids.length === 0) return 0;
    return knex('column_mappings')
        .where({ org_id: orgId })
        .whereIn('id', ids)
        .delete();
}

/**
 * 清空组织全部映射
 */
export async function clearByOrg(orgId) {
    return knex('column_mappings')
        .where({ org_id: orgId })
        .delete();
}

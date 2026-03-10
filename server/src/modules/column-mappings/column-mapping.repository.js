import knex from '../../db/knex.js';
import { columnMappingMapper } from '../../db/mappers/column-mappings.js';

function mapRows(rows) {
    return rows.map(columnMappingMapper.fromDbRow);
}

let userScopeSupportPromise = null;

async function supportsUserScopedMappings() {
    if (!userScopeSupportPromise) {
        userScopeSupportPromise = (async () => {
            try {
                const userIdColumn = await knex('information_schema.columns')
                    .where({
                        table_schema: 'public',
                        table_name: 'column_mappings',
                        column_name: 'user_id',
                    })
                    .first('column_name');

                if (!userIdColumn) return false;

                const indexResult = await knex.raw(`
                    SELECT indexname
                    FROM pg_indexes
                    WHERE schemaname = current_schema()
                      AND tablename = 'column_mappings'
                      AND indexname IN (
                        'column_mappings_org_source_org_default_unique',
                        'column_mappings_org_user_source_unique'
                      )
                `);

                const indexNames = new Set((indexResult.rows || []).map((row) => row.indexname));
                return indexNames.has('column_mappings_org_source_org_default_unique')
                    && indexNames.has('column_mappings_org_user_source_unique');
            } catch (err) {
                console.warn('[column-mappings] failed to inspect schema, falling back to legacy org-scoped mode:', err?.message || err);
                return false;
            }
        })();
    }

    return userScopeSupportPromise;
}

async function findLegacyByOrg(orgId) {
    if (!orgId) return [];

    const rows = await knex('column_mappings')
        .where({ org_id: orgId })
        .orderBy([{ column: 'updated_at', order: 'desc' }, { column: 'source_column', order: 'asc' }]);

    return mapRows(rows);
}

async function upsertLegacyBatch(orgId, mappings) {
    if (!orgId || !mappings || mappings.length === 0) return [];

    const rows = mappings.map((mapping) => columnMappingMapper.toDbInsert({
        ...mapping,
        orgId,
        userId: null,
    }));

    await knex('column_mappings')
        .insert(rows)
        .onConflict(['org_id', 'source_column'])
        .merge({
            target_field_id: knex.raw('EXCLUDED.target_field_id'),
            updated_at: knex.fn.now(),
        });

    return findLegacyByOrg(orgId);
}

export async function findByUserScope(orgId, userId) {
    if (!await supportsUserScopedMappings()) {
        return findLegacyByOrg(orgId);
    }

    if (!orgId || !userId) return [];
    const rows = await knex('column_mappings')
        .where({ org_id: orgId, user_id: userId })
        .orderBy([{ column: 'updated_at', order: 'desc' }, { column: 'source_column', order: 'asc' }]);
    return mapRows(rows);
}

export async function findByOrgScope(orgId) {
    if (!await supportsUserScopedMappings()) {
        return findLegacyByOrg(orgId);
    }

    if (!orgId) return [];
    const rows = await knex('column_mappings')
        .where({ org_id: orgId })
        .whereNull('user_id')
        .orderBy([{ column: 'updated_at', order: 'desc' }, { column: 'source_column', order: 'asc' }]);
    return mapRows(rows);
}

export async function findEffective(orgId, userId) {
    if (!await supportsUserScopedMappings()) {
        return findLegacyByOrg(orgId);
    }

    if (!orgId) return [];

    let query = knex('column_mappings')
        .where({ org_id: orgId })
        .orderByRaw('CASE WHEN user_id IS NULL THEN 1 ELSE 0 END ASC')
        .orderBy([{ column: 'updated_at', order: 'desc' }, { column: 'source_column', order: 'asc' }]);

    if (userId) {
        query = query.where(function applyEffectiveScope() {
            this.where({ user_id: userId }).orWhereNull('user_id');
        });
    } else {
        query = query.whereNull('user_id');
    }

    const rows = await query;
    const deduped = [];
    const seen = new Set();
    for (const row of rows) {
        if (seen.has(row.source_column)) continue;
        seen.add(row.source_column);
        deduped.push(row);
    }
    return mapRows(deduped);
}

export async function upsertUserBatch(orgId, userId, mappings) {
    if (!await supportsUserScopedMappings()) {
        return upsertLegacyBatch(orgId, mappings);
    }

    if (!orgId || !userId || !mappings || mappings.length === 0) return [];

    const rows = mappings.map((mapping) => columnMappingMapper.toDbInsert({
        ...mapping,
        orgId,
        userId,
    }));

    await knex('column_mappings')
        .insert(rows)
        .onConflict(knex.raw('(org_id, user_id, source_column) WHERE user_id IS NOT NULL'))
        .merge({
            target_field_id: knex.raw('EXCLUDED.target_field_id'),
            updated_at: knex.fn.now(),
        });

    return findByUserScope(orgId, userId);
}

export async function upsertOrgBatch(orgId, mappings) {
    if (!await supportsUserScopedMappings()) {
        return upsertLegacyBatch(orgId, mappings);
    }

    if (!orgId || !mappings || mappings.length === 0) return [];

    const rows = mappings.map((mapping) => columnMappingMapper.toDbInsert({
        ...mapping,
        orgId,
        userId: null,
    }));

    await knex('column_mappings')
        .insert(rows)
        .onConflict(knex.raw('(org_id, source_column) WHERE user_id IS NULL'))
        .merge({
            target_field_id: knex.raw('EXCLUDED.target_field_id'),
            updated_at: knex.fn.now(),
        });

    return findByOrgScope(orgId);
}

export async function deleteUserByIds(orgId, userId, ids) {
    if (!await supportsUserScopedMappings()) {
        if (!orgId || !ids || ids.length === 0) return 0;
        return knex('column_mappings')
            .where({ org_id: orgId })
            .whereIn('id', ids)
            .delete();
    }

    if (!orgId || !userId || !ids || ids.length === 0) return 0;
    return knex('column_mappings')
        .where({ org_id: orgId, user_id: userId })
        .whereIn('id', ids)
        .delete();
}

export async function deleteOrgByIds(orgId, ids) {
    if (!await supportsUserScopedMappings()) {
        if (!orgId || !ids || ids.length === 0) return 0;
        return knex('column_mappings')
            .where({ org_id: orgId })
            .whereIn('id', ids)
            .delete();
    }

    if (!orgId || !ids || ids.length === 0) return 0;
    return knex('column_mappings')
        .where({ org_id: orgId })
        .whereNull('user_id')
        .whereIn('id', ids)
        .delete();
}

export async function clearUserScope(orgId, userId) {
    if (!await supportsUserScopedMappings()) {
        if (!orgId) return 0;
        return knex('column_mappings')
            .where({ org_id: orgId })
            .delete();
    }

    if (!orgId || !userId) return 0;
    return knex('column_mappings')
        .where({ org_id: orgId, user_id: userId })
        .delete();
}

export async function clearOrgScope(orgId) {
    if (!await supportsUserScopedMappings()) {
        if (!orgId) return 0;
        return knex('column_mappings')
            .where({ org_id: orgId })
            .delete();
    }

    if (!orgId) return 0;
    return knex('column_mappings')
        .where({ org_id: orgId })
        .whereNull('user_id')
        .delete();
}

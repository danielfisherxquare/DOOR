/**
 * Column Mappings Mapper — snake_case (DB) ↔ camelCase (API)
 */

export const columnMappingMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: Number(row.id),
            orgId: row.org_id,
            userId: row.user_id ?? null,
            sourceColumn: row.source_column,
            targetFieldId: row.target_field_id,
            scope: row.user_id ? 'user' : 'org',
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    },

    toDbInsert(data) {
        return {
            org_id: data.orgId,
            user_id: data.userId ?? null,
            source_column: data.sourceColumn,
            target_field_id: data.targetFieldId,
        };
    },
};

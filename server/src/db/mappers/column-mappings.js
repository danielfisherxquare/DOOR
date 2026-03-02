/**
 * Column Mappings Mapper — snake_case (DB) ↔ camelCase (API)
 */

export const columnMappingMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: Number(row.id),
            orgId: row.org_id,
            sourceColumn: row.source_column,
            targetFieldId: row.target_field_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    },

    toDbInsert(data) {
        return {
            org_id: data.orgId,
            source_column: data.sourceColumn,
            target_field_id: data.targetFieldId,
        };
    },
};

/**
 * 导入会话 Mapper
 * 处理数据库 snake_case 和外层 camelCase 的转换
 */
import { deserializeJsonb, serializeJsonb } from './jsonb.js';

export const importSessionMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: row.id,
            orgId: row.org_id,
            status: row.status,
            rawCount: row.raw_count,
            totalRows: row.total_rows,
            rawPreview: deserializeJsonb(row.raw_preview, []),
            stats: deserializeJsonb(row.stats, {}),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    },

    toDbInsert(data) {
        return {
            org_id: data.orgId,
            status: data.status || 'open',
            raw_count: data.rawCount || 0,
            total_rows: data.totalRows || 0,
            raw_preview: serializeJsonb(data.rawPreview, []),
            stats: serializeJsonb(data.stats, {}),
        };
    },

    chunkFromDbRow(row) {
        if (!row) return null;
        return {
            id: row.id,
            sessionId: row.session_id,
            seq: row.seq,
            rowsData: deserializeJsonb(row.rows_data, []),
            rowCount: row.row_count,
            createdAt: row.created_at,
        };
    },

    chunkToDbInsert(data) {
        return {
            session_id: data.sessionId,
            seq: data.seq,
            rows_data: serializeJsonb(data.rowsData, []),
            row_count: data.rowCount,
        };
    }
};

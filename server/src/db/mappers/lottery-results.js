/**
 * Lottery Results Mapper — snake_case (DB) ↔ camelCase (API)
 * 覆盖 lottery_results 表
 */

export const lotteryResultMapper = {
    fromDbRow(row) {
        if (!row) return null;
        return {
            id: Number(row.id),
            orgId: row.org_id,
            raceId: Number(row.race_id),
            recordId: Number(row.record_id),
            resultStatus: row.result_status,
            bucketName: row.bucket_name,
            drawOrder: Number(row.draw_order),
            createdAt: row.created_at,
        };
    },

    toDbInsert(data, orgId) {
        return {
            org_id: orgId,
            race_id: data.raceId,
            record_id: data.recordId,
            result_status: data.resultStatus,
            bucket_name: data.bucketName ?? '',
            draw_order: data.drawOrder ?? 0,
        };
    },
};

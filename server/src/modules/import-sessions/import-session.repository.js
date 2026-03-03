import knex from '../../db/knex.js';
import { importSessionMapper } from '../../db/mappers/import-sessions.js';

export const importSessionRepository = {
    /**
     * 创建新的导入会话
     */
    async create(orgId) {
        const [row] = await knex('import_sessions')
            .insert({ org_id: orgId })
            .returning('*');
        return importSessionMapper.fromDbRow(row);
    },

    /**
     * 获取指定会话信息（受 orgId 隔离保护）
     */
    async findById(orgId, sessionId) {
        const row = await knex('import_sessions')
            .where({ org_id: orgId, id: sessionId })
            .first();
        return importSessionMapper.fromDbRow(row);
    },

    /**
     * 设置会话清洗摘要信息
     */
    async setSummary(orgId, sessionId, summary) {
        const { rawCount, rawPreview, stats } = summary;

        const [row] = await knex('import_sessions')
            .where({ org_id: orgId, id: sessionId })
            .update({
                raw_count: rawCount || 0,
                raw_preview: JSON.stringify(rawPreview || []),
                stats: JSON.stringify(stats || {}),
                updated_at: knex.fn.now()
            })
            .returning('*');

        return importSessionMapper.fromDbRow(row);
    },

    /**
     * 追加清洗后的数据块
     */
    async appendChunk(orgId, sessionId, rowsData) {
        if (!Array.isArray(rowsData) || rowsData.length === 0) return 0;

        return await knex.transaction(async (trx) => {
            // 1. 验证会话存在且归属该组织
            const session = await trx('import_sessions')
                .where({ org_id: orgId, id: sessionId })
                .forUpdate()
                .first();

            if (!session) throw new Error('Session not found or forbidden');
            if (session.status !== 'open') throw new Error('Cannot append to a non-open session');

            // 2. 获取当前最大 seq
            const maxSeqRow = await trx('import_session_chunks')
                .where({ session_id: sessionId })
                .max('seq as max_seq')
                .first();
            const nextSeq = (maxSeqRow?.max_seq ?? -1) + 1;

            const rowCount = rowsData.length;

            // 3. 写入 chunk
            await trx('import_session_chunks').insert({
                session_id: sessionId,
                seq: nextSeq,
                rows_data: JSON.stringify(rowsData),
                row_count: rowCount,
            });

            // 4. 更新 session 的总行数（不能链式 increment + update）
            const [updatedSession] = await trx('import_sessions')
                .where({ id: sessionId })
                .update({
                    total_rows: knex.raw('total_rows + ?', [rowCount]),
                    updated_at: knex.fn.now(),
                })
                .returning('*');

            return updatedSession.total_rows;
        });
    },

    /**
     * 读取指定偏移的数据块
     * 自动从所有的 chunk 碎片中拼接目标 range 的 rows
     */
    async getChunk(orgId, sessionId, offset, limit) {
        // 1. 鉴权
        const session = await this.findById(orgId, sessionId);
        if (!session) throw new Error('Session not found or forbidden');

        // 由于 chunk 存储按批次打包，我们需要在内存中进行展平与截取
        // 注意：在大数据量下我们仅提取相关的 seq 区间是最优的。
        // 但简单实现可直接按 seq 排序取出所需的 chunks 再 slice。 
        // 考虑到 5万行不会超过 100 个 chunks，先用流式加载。
        const chunks = await knex('import_session_chunks')
            .where({ session_id: sessionId })
            .orderBy('seq', 'asc');

        const allRows = [];
        for (const c of chunks) {
            let data = c.rows_data;
            if (typeof data === 'string') {
                data = JSON.parse(data);
            }
            if (Array.isArray(data)) {
                allRows.push(...data);
            }
        }

        return allRows.slice(offset, offset + limit);
    },

    /**
     * 取消或删除会话 (包括 chunks 一并由 DB CASCADE 回收)
     */
    async cancel(orgId, sessionId) {
        const deleted = await knex('import_sessions')
            .where({ org_id: orgId, id: sessionId })
            .delete();
        return deleted > 0;
    },

    /**
     * 标记会话已提交
     */
    async markCommitted(orgId, sessionId) {
        const [row] = await knex('import_sessions')
            .where({ org_id: orgId, id: sessionId })
            .update({
                status: 'committed',
                updated_at: knex.fn.now()
            })
            .returning('*');
        return importSessionMapper.fromDbRow(row);
    }
};

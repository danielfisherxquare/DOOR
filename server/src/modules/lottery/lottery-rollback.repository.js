/**
 * Lottery Rollback Repository — 抽签回滚 & Bib 回滚
 *
 * 多租户隔离：所有查询必须带 org_id
 */
import knex from '../../db/knex.js';
import * as snapshotRepo from '../pipeline/snapshot.repository.js';

const BATCH_SIZE = 1000;

/**
 * 检查是否有同类型执行正在 running
 * @throws {Error} 若有 running 任务
 */
async function guardConcurrent(trx, orgId, raceId, executionType) {
    const running = await trx('pipeline_executions')
        .where({ org_id: orgId, race_id: raceId, execution_type: executionType, status: 'running' })
        .first();
    if (running) {
        throw Object.assign(
            new Error(`存在正在执行的 ${executionType} 任务 (id=${running.id}), 请等待完成`),
            { code: 'CONCURRENT_EXECUTION', statusCode: 409 }
        );
    }
}

/**
 * 回滚抽签 — 事务
 *
 * 1. 防重检查
 * 2. 记录执行日志
 * 3. 从 pre_lottery 快照恢复 records 字段
 * 4. 清空 lottery_results
 * 5. 还原 clothing_limits.used_count
 * 6. 删除快照
 */
export async function rollbackLottery(orgId, raceId) {
    return knex.transaction(async (trx) => {
        // 防重
        await guardConcurrent(trx, orgId, raceId, 'rollback_lottery');

        // 检查快照存在
        const snapshot = await trx('pipeline_snapshots')
            .where({ org_id: orgId, race_id: raceId, snapshot_type: 'pre_lottery' })
            .first();
        if (!snapshot) {
            throw Object.assign(
                new Error('无法回滚：抽签快照不存在'),
                { code: 'NO_SNAPSHOT', statusCode: 400 }
            );
        }

        // 写执行日志
        const [exec] = await trx('pipeline_executions')
            .insert({
                org_id: orgId,
                race_id: raceId,
                execution_type: 'rollback_lottery',
                status: 'running',
            })
            .returning('id');
        const execId = typeof exec === 'object' ? exec.id : exec;

        try {
            // 1. 还原 clothing_limits：先计算中签者的库存增量，再逆向还原
            const winners = await trx('lottery_results')
                .where({ 'lottery_results.org_id': orgId, 'lottery_results.race_id': raceId, 'lottery_results.result_status': 'winner' })
                .join('records', function () {
                    this.on('lottery_results.record_id', '=', 'records.id')
                        .andOn('lottery_results.org_id', '=', 'records.org_id');
                })
                .select(
                    'records.event',
                    'records.gender',
                    'records.clothing_size',
                )
                .whereNotNull('records.clothing_size')
                .andWhere('records.clothing_size', '<>', '');

            // 按 event:gender:size 聚合
            const restoreMap = new Map();
            for (const w of winners) {
                const key = `${w.event || 'ALL'}|${w.gender || 'U'}|${w.clothing_size}`;
                restoreMap.set(key, (restoreMap.get(key) || 0) + 1);
            }

            for (const [key, count] of restoreMap) {
                const [event, gender, size] = key.split('|');
                await trx('clothing_limits')
                    .where({ org_id: orgId, race_id: raceId, event, gender, size })
                    .decrement('used_count', count);
            }

            // 2. 从快照恢复 records
            await snapshotRepo.restoreSnapshot(orgId, raceId, 'pre_lottery', trx);

            // 3. 清空 lottery_results
            await trx('lottery_results')
                .where({ org_id: orgId, race_id: raceId })
                .del();

            // 4. 删除快照
            await snapshotRepo.deleteSnapshot(orgId, raceId, 'pre_lottery', trx);

            // 更新执行日志
            await trx('pipeline_executions')
                .where({ id: execId })
                .update({
                    status: 'succeeded',
                    result: JSON.stringify({ restoredRecords: winners.length }),
                    completed_at: new Date(),
                });

            return { success: true, restoredRecords: winners.length };

        } catch (err) {
            console.error('[rollbackLottery] Error:', err.message, err.stack);
            try {
                await knex('pipeline_executions')
                    .where({ id: execId })
                    .update({ status: 'failed', error: err.message, completed_at: new Date() });
            } catch (_) { /* ignore */ }
            throw err;
        }
    });
}

/**
 * 回滚 Bib 排号 — 事务
 *
 * 1. 防重检查
 * 2. 从 pre_bib 快照恢复 records 的排号字段
 * 3. 清空 bib_assignments
 * 4. 删除快照
 */
export async function rollbackBib(orgId, raceId) {
    return knex.transaction(async (trx) => {
        // 防重
        await guardConcurrent(trx, orgId, raceId, 'rollback_bib');

        // 检查快照存在
        const snapshot = await trx('pipeline_snapshots')
            .where({ org_id: orgId, race_id: raceId, snapshot_type: 'pre_bib' })
            .first();
        if (!snapshot) {
            throw Object.assign(
                new Error('无法回滚：排号快照不存在'),
                { code: 'NO_SNAPSHOT', statusCode: 400 }
            );
        }

        // 写执行日志
        const [exec] = await trx('pipeline_executions')
            .insert({
                org_id: orgId,
                race_id: raceId,
                execution_type: 'rollback_bib',
                status: 'running',
            })
            .returning('id');
        const execId = typeof exec === 'object' ? exec.id : exec;

        try {
            // 1. 从快照恢复 records
            const { restoredCount } = await snapshotRepo.restoreSnapshot(orgId, raceId, 'pre_bib', trx);

            // 2. 清空 bib_assignments
            await trx('bib_assignments')
                .where({ org_id: orgId, race_id: raceId })
                .del();

            // 3. 删除快照
            await snapshotRepo.deleteSnapshot(orgId, raceId, 'pre_bib', trx);

            // 更新执行日志
            await trx('pipeline_executions')
                .where({ id: execId })
                .update({
                    status: 'succeeded',
                    result: JSON.stringify({ restoredCount }),
                    completed_at: new Date(),
                });

            return { success: true, restoredCount };

        } catch (err) {
            console.error('[rollbackBib] Error:', err.message, err.stack);
            try {
                await knex('pipeline_executions')
                    .where({ id: execId })
                    .update({ status: 'failed', error: err.message, completed_at: new Date() });
            } catch (_) { /* ignore */ }
            throw err;
        }
    });
}

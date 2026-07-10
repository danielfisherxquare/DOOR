/**
 * Lottery Rollback Repository — 抽签回滚 & Bib 回滚
 *
 * 多租户隔离：所有查询必须带 org_id
 */
import knex from '../../db/knex.js';
import * as snapshotRepo from '../pipeline/snapshot.repository.js';
import { normalizeEvent } from '../../utils/event-normalizer.js';
import {
    assertNoActiveLotteryJob,
    assertNoActivePipelineExecution,
    lockLotteryRace,
} from './lottery-execution.repository.js';

const BATCH_SIZE = 1000;

function toEventKey(event) {
    return normalizeEvent(event || '');
}

async function decrementInventoryWithFallback(trx, orgId, raceId, rawEvent, normalizedEvent, gender, size, count) {
    const eventCandidates = [...new Set([
        rawEvent || 'ALL',
        normalizedEvent || rawEvent || 'ALL',
    ])];

    for (const event of eventCandidates) {
        const updated = await trx('clothing_limits')
            .where({ org_id: orgId, race_id: raceId, event, gender, size })
            .update({
                used_count: trx.raw('GREATEST(COALESCE(used_count, 0) - ?, 0)', [count]),
            });
        if (updated > 0) {
            return true;
        }
    }

    return false;
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
        await lockLotteryRace(orgId, raceId, trx);
        await assertNoActiveLotteryJob(orgId, raceId, trx);
        await assertNoActivePipelineExecution(
            orgId,
            raceId,
            ['lottery', 'rollback_lottery'],
            trx,
        );

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
            const raceRow = await trx('races')
                .where({ id: raceId, org_id: orgId })
                .select('lottery_mode_default')
                .first();
            const raceDefaultMode = raceRow?.lottery_mode_default || 'lottery';
            const capacities = await trx('race_capacity')
                .where({ org_id: orgId, race_id: raceId })
                .select('event', 'lottery_mode_override');
            const effectiveModeByEvent = new Map(
                capacities.map(cap => [
                    toEventKey(cap.event),
                    (cap.lottery_mode_override === 'direct' || cap.lottery_mode_override === 'lottery')
                        ? cap.lottery_mode_override
                        : raceDefaultMode,
                ]),
            );
            const isDirectEvent = (event) => (effectiveModeByEvent.get(toEventKey(event)) || raceDefaultMode) === 'direct';

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
                if (isDirectEvent(w.event)) continue;
                const rawEvent = w.event || 'ALL';
                const normalizedEvent = toEventKey(w.event) || rawEvent;
                const key = `${rawEvent}|${normalizedEvent}|${w.gender || 'U'}|${w.clothing_size}`;
                restoreMap.set(key, (restoreMap.get(key) || 0) + 1);
            }

            for (const [key, count] of restoreMap) {
                const [rawEvent, normalizedEvent, gender, size] = key.split('|');
                await decrementInventoryWithFallback(
                    trx,
                    orgId,
                    raceId,
                    rawEvent,
                    normalizedEvent,
                    gender,
                    size,
                    count,
                );
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
        await lockLotteryRace(orgId, raceId, trx);
        await assertNoActiveLotteryJob(orgId, raceId, trx);
        await assertNoActivePipelineExecution(
            orgId,
            raceId,
            ['bib_numbering', 'rollback_bib'],
            trx,
        );

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
            throw err;
        }
    });
}

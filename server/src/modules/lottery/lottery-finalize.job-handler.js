import { registerHandler } from '../jobs/job.handlers.js';
import * as snapshotRepo from '../pipeline/snapshot.repository.js';

const BATCH_SIZE = 1000;

function buildEffectiveModeResolver(capacities, raceDefaultMode) {
    const effectiveModeByEvent = new Map(
        capacities.map((cap) => [
            cap.event || '',
            (cap.lottery_mode_override === 'direct' || cap.lottery_mode_override === 'lottery')
                ? cap.lottery_mode_override
                : raceDefaultMode,
        ]),
    );
    return (event) => (effectiveModeByEvent.get(event || '') || raceDefaultMode);
}

registerHandler('lottery:finalize', async (job, { knex, heartbeat }) => {
    const { raceId } = job.payload;
    const orgId = job.orgId;

    await heartbeat(2, '检查并发锁');

    const running = await knex('pipeline_executions')
        .where({ org_id: orgId, race_id: raceId, execution_type: 'lottery', status: 'running' })
        .first();
    if (running) {
        throw Object.assign(
            new Error(`存在正在执行的 lottery 任务 (id=${running.id})`),
            { code: 'CONCURRENT_EXECUTION' },
        );
    }

    const hasSnapshot = await snapshotRepo.hasSnapshot(orgId, raceId, 'pre_lottery');
    if (hasSnapshot) {
        throw Object.assign(
            new Error('已存在抽签快照，请先回滚当前抽签结果再重新执行'),
            { code: 'SNAPSHOT_EXISTS', status: 409, expose: true },
        );
    }

    const [exec] = await knex('pipeline_executions')
        .insert({
            org_id: orgId,
            race_id: raceId,
            execution_type: 'lottery',
            status: 'running',
        })
        .returning('id');
    const execId = typeof exec === 'object' ? exec.id : exec;

    try {
        const resultSummary = await knex.transaction(async (trx) => {
            await heartbeat(5, '创建 pre_lottery 快照');

            const snapshotResult = await snapshotRepo.createSnapshot(orgId, raceId, 'pre_lottery', {
                executionId: execId,
                createdBy: 'lottery:finalize',
            }, trx);

            await heartbeat(20, `快照完成 (${snapshotResult.itemCount} 条), 读取容量配置`);

            const capacities = await trx('race_capacity')
                .where({ org_id: orgId, race_id: raceId });

            const raceRow = await trx('races')
                .where({ id: raceId, org_id: orgId })
                .select('lottery_mode_default')
                .first();
            const raceDefaultMode = raceRow?.lottery_mode_default || 'lottery';
            const resolveEffectiveMode = buildEffectiveModeResolver(capacities, raceDefaultMode);

            const candidates = await trx('records')
                .where({ org_id: orgId, race_id: raceId })
                .where(function () {
                    this.where('audit_status', 'pass')
                        .orWhere('audit_status', 'review');
                })
                .where('lottery_status', '参与抽签')
                .where('is_locked', 0)
                .select('id', 'event', 'gender', 'clothing_size');

            await heartbeat(30, `候选人 ${candidates.length} 名, 读取权重规则`);

            await trx('lottery_weights')
                .where({ org_id: orgId, race_id: raceId, enabled: 1 })
                .orderBy('priority', 'asc');

            await heartbeat(35, '执行抽签/直通确认');

            const byEvent = new Map();
            for (const candidate of candidates) {
                const event = candidate.event || '';
                if (!byEvent.has(event)) byEvent.set(event, []);
                byEvent.get(event).push(candidate);
            }

            const allResults = [];
            const winnerIds = [];
            const loserIds = [];
            let drawOrder = 0;

            for (const [event, group] of byEvent) {
                const cap = capacities.find((row) => row.event === event);
                const effectiveMode = resolveEffectiveMode(event);

                if (effectiveMode === 'direct') {
                    for (const candidate of group) {
                        drawOrder += 1;
                        allResults.push({
                            recordId: candidate.id,
                            resultStatus: 'winner',
                            bucketName: event,
                            drawOrder,
                        });
                        winnerIds.push(candidate.id);
                    }
                    continue;
                }

                const targetCount = cap ? Math.floor(Number(cap.target_count) * Number(cap.draw_ratio)) : group.length;
                const shuffled = [...group];
                for (let i = shuffled.length - 1; i > 0; i -= 1) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }

                for (let i = 0; i < shuffled.length; i += 1) {
                    const isWinner = i < targetCount;
                    drawOrder += 1;
                    allResults.push({
                        recordId: shuffled[i].id,
                        resultStatus: isWinner ? 'winner' : 'loser',
                        bucketName: event,
                        drawOrder,
                    });
                    if (isWinner) winnerIds.push(shuffled[i].id);
                    else loserIds.push(shuffled[i].id);
                }
            }

            await heartbeat(55, `完成: 中签 ${winnerIds.length}, 未中签 ${loserIds.length}, 写入结果`);

            await trx('lottery_results')
                .where({ org_id: orgId, race_id: raceId })
                .del();

            for (let i = 0; i < allResults.length; i += BATCH_SIZE) {
                const batch = allResults.slice(i, i + BATCH_SIZE).map((row) => ({
                    org_id: orgId,
                    race_id: raceId,
                    record_id: row.recordId,
                    result_status: row.resultStatus,
                    bucket_name: row.bucketName,
                    draw_order: row.drawOrder,
                }));

                await trx('lottery_results')
                    .insert(batch)
                    .onConflict(['org_id', 'race_id', 'record_id'])
                    .merge({
                        result_status: trx.raw('EXCLUDED.result_status'),
                        bucket_name: trx.raw('EXCLUDED.bucket_name'),
                        draw_order: trx.raw('EXCLUDED.draw_order'),
                    });
            }

            await heartbeat(70, '更新 records 状态');

            for (let i = 0; i < winnerIds.length; i += BATCH_SIZE) {
                await trx('records')
                    .whereIn('id', winnerIds.slice(i, i + BATCH_SIZE))
                    .where({ org_id: orgId })
                    .update({ lottery_status: '中签' });
            }

            for (let i = 0; i < loserIds.length; i += BATCH_SIZE) {
                await trx('records')
                    .whereIn('id', loserIds.slice(i, i + BATCH_SIZE))
                    .where({ org_id: orgId })
                    .update({ lottery_status: '未中签' });
            }

            await heartbeat(85, '扣减服装库存');

            const winnerRecords = winnerIds.length > 0
                ? await trx('records')
                    .whereIn('id', winnerIds)
                    .where({ org_id: orgId })
                    .select('id', 'event', 'gender', 'clothing_size')
                : [];

            const deductMap = new Map();
            let inventoryDeducted = 0;
            for (const winner of winnerRecords) {
                if (resolveEffectiveMode(winner.event) === 'direct') continue;
                if (!winner.clothing_size) continue;
                const event = winner.event || 'ALL';
                const gender = winner.gender || 'U';
                const key = `${event}|${gender}|${winner.clothing_size}`;
                deductMap.set(key, (deductMap.get(key) || 0) + 1);
                inventoryDeducted += 1;
            }

            const deductReport = [];
            for (const [key, count] of deductMap) {
                const [event, gender, size] = key.split('|');
                const updated = await trx('clothing_limits')
                    .where({ org_id: orgId, race_id: raceId, event, gender, size })
                    .increment('used_count', count);
                deductReport.push({ event, gender, size, count, matched: updated > 0 });
            }

            await heartbeat(95, '更新执行日志');

            return {
                totalCandidates: candidates.length,
                winners: winnerIds.length,
                losers: loserIds.length,
                inventoryDeducted,
                deductReport,
            };
        });

        await knex('pipeline_executions')
            .where({ id: execId })
            .update({
                status: 'succeeded',
                result: JSON.stringify(resultSummary),
                completed_at: new Date(),
            });

        return resultSummary;
    } catch (err) {
        await knex('pipeline_executions')
            .where({ id: execId })
            .update({
                status: 'failed',
                error: err.message,
                completed_at: new Date(),
            });
        throw err;
    }
});

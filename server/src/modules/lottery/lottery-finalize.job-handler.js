/**
 * Lottery Finalize Job Handler — 最终抽签执行
 *
 * Job Type: lottery:finalize
 * payload: { raceId }
 *
 * 核心事务逻辑（源自 sqliteService.cjs:stepFinalizeLottery）：
 *   1. 防重检查（pipeline_executions）
 *   2. 创建 pre_lottery 快照
 *   3. 按容量/规则执行抽签 → 写入 lottery_results
 *   4. 更新 records.lottery_status（中签/未中签）
 *   5. 中签者扣减 clothing_limits.used_count
 *   6. 以上均在同一事务内执行
 *
 * 由 worker.js 通过 side-effect import 注册
 */
import { registerHandler } from '../jobs/job.handlers.js';
import * as snapshotRepo from '../pipeline/snapshot.repository.js';

const BATCH_SIZE = 1000;

registerHandler('lottery:finalize', async (job, { knex, heartbeat }) => {
    const { raceId } = job.payload;
    const orgId = job.orgId;

    await heartbeat(2, '检查并发锁');

    // ── 0. 防重 ─────────────────────────────────────────────
    const running = await knex('pipeline_executions')
        .where({ org_id: orgId, race_id: raceId, execution_type: 'lottery', status: 'running' })
        .first();
    if (running) {
        throw Object.assign(
            new Error(`存在正在执行的 lottery 任务 (id=${running.id})`),
            { code: 'CONCURRENT_EXECUTION' }
        );
    }

    // 写执行日志
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
        await heartbeat(5, '创建 pre_lottery 快照');

        // ── 1. 创建快照 ─────────────────────────────────────
        const snapshotResult = await snapshotRepo.createSnapshot(orgId, raceId, 'pre_lottery', {
            executionId: execId,
            createdBy: 'lottery:finalize',
        });

        await heartbeat(20, `快照完成 (${snapshotResult.itemCount} 条), 读取容量配置`);

        // ── 2. 读取容量配置 + 候选 records ──────────────────
        const capacities = await knex('race_capacity')
            .where({ org_id: orgId, race_id: raceId });

        // 读取赛事默认抽签模式
        const raceRow = await knex('races')
            .where({ id: raceId, org_id: orgId })
            .select('lottery_mode_default')
            .first();
        const raceDefaultMode = raceRow?.lottery_mode_default || 'lottery';
        const effectiveModeByEvent = new Map(
            capacities.map(cap => [
                cap.event || '',
                (cap.lottery_mode_override === 'direct' || cap.lottery_mode_override === 'lottery')
                    ? cap.lottery_mode_override
                    : raceDefaultMode,
            ]),
        );
        const isDirectEvent = (event) => (effectiveModeByEvent.get(event || '') || raceDefaultMode) === 'direct';

        const candidates = await knex('records')
            .where({ org_id: orgId, race_id: raceId })
            .where(function () {
                this.where('audit_status', 'pass')
                    .orWhere('audit_status', 'review');
            })
            .where('lottery_status', '参与抽签')
            .where('is_locked', 0)
            .select('id', 'event', 'gender', 'clothing_size');

        await heartbeat(30, `候选人 ${candidates.length} 名, 读取权重规则`);

        // ── 3. 读取权重 ─────────────────────────────────────
        const weights = await knex('lottery_weights')
            .where({ org_id: orgId, race_id: raceId, enabled: 1 })
            .orderBy('priority', 'asc');

        // ── 4. 执行抽签/直通 ─────────────────────────────────
        await heartbeat(35, '执行抽签/直通确认');

        // 按 event 分组，每组独立处理
        const byEvent = new Map();
        for (const c of candidates) {
            const event = c.event || '';
            if (!byEvent.has(event)) byEvent.set(event, []);
            byEvent.get(event).push(c);
        }

        const allResults = [];    // { recordId, resultStatus, bucketName, drawOrder }
        const winnerIds = [];
        const loserIds = [];

        let drawOrder = 0;
        for (const [event, group] of byEvent) {
            const cap = capacities.find(c => c.event === event);

            // 解析项目生效模式: override 优先，否则继承赛事默认
            const modeOverride = cap?.lottery_mode_override;
            const effectiveMode = (modeOverride === 'lottery' || modeOverride === 'direct')
                ? modeOverride
                : raceDefaultMode;

            if (effectiveMode === 'direct') {
                // ── 直通模式：全部标为中签 ──
                console.log(`[lottery:finalize] 项目 "${event}"：直通模式，${group.length} 人全部中签`);
                for (const candidate of group) {
                    drawOrder++;
                    allResults.push({
                        recordId: candidate.id,
                        resultStatus: 'winner',
                        bucketName: event,
                        drawOrder,
                    });
                    winnerIds.push(candidate.id);
                }
            } else {
                // ── 抽签模式：Fisher-Yates 随机洗牌 ──
                const targetCount = cap ? Math.floor(Number(cap.target_count) * Number(cap.draw_ratio)) : group.length;

                const shuffled = [...group];
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }

                for (let i = 0; i < shuffled.length; i++) {
                    const isWinner = i < targetCount;
                    drawOrder++;
                    allResults.push({
                        recordId: shuffled[i].id,
                        resultStatus: isWinner ? 'winner' : 'loser',
                        bucketName: event,
                        drawOrder,
                    });
                    if (isWinner) {
                        winnerIds.push(shuffled[i].id);
                    } else {
                        loserIds.push(shuffled[i].id);
                    }
                }
            }
        }

        await heartbeat(55, `完成: 中签 ${winnerIds.length}, 未中签 ${loserIds.length}, 写入结果`);

        // ── 5. 批量写入 lottery_results ──────────────────────
        // 先清空旧结果
        await knex('lottery_results')
            .where({ org_id: orgId, race_id: raceId })
            .del();

        for (let i = 0; i < allResults.length; i += BATCH_SIZE) {
            const batch = allResults.slice(i, i + BATCH_SIZE).map(r => ({
                org_id: orgId,
                race_id: raceId,
                record_id: r.recordId,
                result_status: r.resultStatus,
                bucket_name: r.bucketName,
                draw_order: r.drawOrder,
            }));
            await knex('lottery_results')
                .insert(batch)
                .onConflict(['org_id', 'race_id', 'record_id'])
                .merge({
                    result_status: knex.raw('EXCLUDED.result_status'),
                    bucket_name: knex.raw('EXCLUDED.bucket_name'),
                    draw_order: knex.raw('EXCLUDED.draw_order'),
                });
        }

        await heartbeat(70, '更新 records 状态');

        // ── 6. 更新 records.lottery_status ───────────────────
        for (let i = 0; i < winnerIds.length; i += BATCH_SIZE) {
            const batch = winnerIds.slice(i, i + BATCH_SIZE);
            await knex('records')
                .whereIn('id', batch)
                .where({ org_id: orgId })
                .update({ lottery_status: '中签' });
        }

        for (let i = 0; i < loserIds.length; i += BATCH_SIZE) {
            const batch = loserIds.slice(i, i + BATCH_SIZE);
            await knex('records')
                .whereIn('id', batch)
                .where({ org_id: orgId })
                .update({ lottery_status: '未中签' });
        }

        await heartbeat(85, '扣减服装库存');

        // ── 7. 库存扣减 ─────────────────────────────────────
        // 获取中签者的服装信息
        const winnerRecords = await knex('records')
            .whereIn('id', winnerIds)
            .where({ org_id: orgId })
            .select('id', 'event', 'gender', 'clothing_size');

        // 聚合扣减
        const deductMap = new Map();
        let needDeductCount = 0;
        for (const w of winnerRecords) {
            if (isDirectEvent(w.event)) continue;
            if (!w.clothing_size) continue;
            const event = w.event || 'ALL';
            const gender = w.gender || 'U';
            const key = `${event}|${gender}|${w.clothing_size}`;
            deductMap.set(key, (deductMap.get(key) || 0) + 1);
            needDeductCount++;
        }

        const deductReport = [];
        for (const [key, count] of deductMap) {
            const [event, gender, size] = key.split('|');
            const updated = await knex('clothing_limits')
                .where({ org_id: orgId, race_id: raceId, event, gender, size })
                .increment('used_count', count);

            deductReport.push({ event, gender, size, count, matched: updated > 0 });
        }

        await heartbeat(95, '更新执行日志');

        // ── 8. 更新执行日志 ─────────────────────────────────
        const resultSummary = {
            totalCandidates: candidates.length,
            winners: winnerIds.length,
            losers: loserIds.length,
            inventoryDeducted: needDeductCount,
            deductReport,
        };

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

import { registerHandler } from '../jobs/job.handlers.js';
import * as snapshotRepo from '../pipeline/snapshot.repository.js';
import { isFullEvent, isHalfEvent, normalizeEvent } from '../../utils/event-normalizer.js';
import {
    assertNoActivePipelineExecution,
    assertNoFinalizedLotteryV2,
    lockLotteryRace,
} from './lottery-execution.repository.js';

const BATCH_SIZE = 1000;
const DIRECT_STATUSES = ['直通名额', '直通', '强制保签'];

function toEventKey(event) {
    return normalizeEvent(event || '');
}

function getEventGroupKey(event) {
    if (isHalfEvent(event)) return 'Half';
    if (isFullEvent(event)) return 'Full';
    return toEventKey(event || '') || 'ALL';
}

function getGenderKey(gender) {
    const raw = String(gender || '').trim().toLowerCase();
    if (!raw) return 'U';
    if (raw === 'm' || raw === 'male' || raw === 'man' || raw === '男') return 'M';
    if (raw === 'f' || raw === 'female' || raw === 'woman' || raw === '女') return 'F';
    return 'U';
}

function shuffle(items) {
    const copied = [...items];
    for (let i = copied.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copied[i], copied[j]] = [copied[j], copied[i]];
    }
    return copied;
}

function addCount(target, key, delta = 1) {
    target[key] = Number(target[key] || 0) + delta;
}

function buildEffectiveModeResolver(capacities, raceDefaultMode) {
    const effectiveModeByEvent = new Map(
        capacities.map((cap) => [
            toEventKey(cap.event),
            (cap.lottery_mode_override === 'direct' || cap.lottery_mode_override === 'lottery')
                ? cap.lottery_mode_override
                : raceDefaultMode,
        ]),
    );
    return (event) => (effectiveModeByEvent.get(toEventKey(event)) || raceDefaultMode);
}

function buildCapacityLookup(capacities) {
    return new Map(
        capacities
            .map((cap) => [toEventKey(cap.event), cap])
            .filter(([eventKey]) => Boolean(eventKey)),
    );
}

function buildPerformancePriorityLookup(rows) {
    return new Map(
        rows.map((row) => [getEventGroupKey(row.event), Number(row.priority_ratio || 0)]),
    );
}

function buildGenderWeightLookup(rows) {
    const lookup = new Map();
    for (const row of rows) {
        let weightConfig = row.weight_config || {};
        if (typeof row.weight_config === 'string') {
            try {
                weightConfig = JSON.parse(row.weight_config || '{}');
            } catch {
                weightConfig = {};
            }
        }
        lookup.set(String(row.target_group || 'ALL'), {
            maleRatio: Number(weightConfig.maleRatio || 0),
            femaleRatio: Number(weightConfig.femaleRatio || 0),
        });
    }
    return lookup;
}

function buildEmptyUnselectedStats() {
    return {
        qualified_inventory: 0,
        qualified_lottery: 0,
        general_inventory: 0,
        general_lottery: 0,
        general_capacity: 0,
        unknown_gender_excluded: 0,
    };
}

async function incrementInventoryWithFallback(trx, orgId, raceId, rawEvent, normalizedEvent, gender, size, count) {
    const eventCandidates = [...new Set([
        rawEvent || 'ALL',
        normalizedEvent || rawEvent || 'ALL',
    ])];

    for (const event of eventCandidates) {
        const updated = await trx('clothing_limits')
            .where({ org_id: orgId, race_id: raceId, event, gender, size })
            .increment('used_count', count);
        if (updated > 0) {
            return { matched: true, event };
        }
    }

    return { matched: false, event: normalizedEvent || rawEvent || 'ALL' };
}

registerHandler('lottery:finalize', async (job, { knex, heartbeat }) => {
    const { raceId } = job.payload;
    const orgId = job.orgId;

    await heartbeat(2, '检查并发锁');

    let execId = null;
    let executionStarted = false;

    try {
        const resultSummary = await knex.transaction(async (trx) => {
            await lockLotteryRace(orgId, raceId, trx);
            await assertNoActivePipelineExecution(
                orgId,
                raceId,
                ['lottery', 'rollback_lottery'],
                trx,
            );
            await assertNoFinalizedLotteryV2(orgId, raceId, trx);

            const hasSnapshot = await snapshotRepo.hasSnapshot(orgId, raceId, 'pre_lottery', trx);
            if (hasSnapshot) {
                throw Object.assign(
                    new Error('已存在抽签快照，请先回滚当前抽签结果再重新执行'),
                    { code: 'SNAPSHOT_EXISTS', status: 409, expose: true },
                );
            }

            const [exec] = await trx('pipeline_executions')
                .insert({
                    org_id: orgId,
                    race_id: raceId,
                    execution_type: 'lottery',
                    status: 'running',
                })
                .returning('id');
            execId = typeof exec === 'object' ? exec.id : exec;
            executionStarted = true;

            await heartbeat(5, '创建 pre_lottery 快照');

            const snapshotResult = await snapshotRepo.createSnapshot(orgId, raceId, 'pre_lottery', {
                executionId: execId,
                createdBy: 'lottery:finalize',
            }, trx);

            await heartbeat(18, `快照完成 (${snapshotResult.itemCount} 条), 读取配置`);

            const [capacities, raceRow, performanceRules, lotteryWeights, inventoryRows] = await Promise.all([
                trx('race_capacity').where({ org_id: orgId, race_id: raceId }),
                trx('races')
                    .where({ id: raceId, org_id: orgId })
                    .select('lottery_mode_default')
                    .first(),
                trx('performance_rules')
                    .where({ org_id: orgId, race_id: raceId })
                    .select('event', 'priority_ratio'),
                trx('lottery_weights')
                    .where({ org_id: orgId, race_id: raceId, enabled: 1, weight_type: 'gender' })
                    .select('target_group', 'weight_config'),
                trx('clothing_limits')
                    .where({ org_id: orgId, race_id: raceId })
                    .select('event', 'gender', 'size', 'total_inventory', 'used_count'),
            ]);

            const raceDefaultMode = raceRow?.lottery_mode_default || 'lottery';
            const resolveEffectiveMode = buildEffectiveModeResolver(capacities, raceDefaultMode);
            const capacityByEvent = buildCapacityLookup(capacities);
            const performancePriorityByGroup = buildPerformancePriorityLookup(performanceRules);
            const genderWeightByGroup = buildGenderWeightLookup(lotteryWeights);

            const [candidates, lockedRecords] = await Promise.all([
                trx('records')
                    .where({ org_id: orgId, race_id: raceId })
                    .where(function () {
                        this.whereIn('audit_status', ['pass', 'review', 'qualified_time']);
                    })
                    .where('lottery_status', '参与抽签')
                    .where('is_locked', 0)
                    .select('id', 'event', 'gender', 'clothing_size', 'audit_status'),
                trx('records')
                    .where({ org_id: orgId, race_id: raceId, is_locked: 1 })
                    .whereIn('lottery_status', DIRECT_STATUSES)
                    .select('event', 'gender', 'clothing_size'),
            ]);

            await heartbeat(32, `候选人 ${candidates.length} 名，准备分桶抽签`);

            const warnings = [];
            const errors = [];
            const winnersByEvent = {};
            const lockedByEvent = {};
            const bucketBreakdown = [];
            const unselectedStats = buildEmptyUnselectedStats();
            const winnerGenderByEvent = {};
            const candidateGenderByEvent = {};

            for (const locked of lockedRecords) {
                const groupKey = getEventGroupKey(locked.event);
                addCount(lockedByEvent, groupKey, 1);
            }

            const byEvent = new Map();
            for (const candidate of candidates) {
                const groupKey = getEventGroupKey(candidate.event);
                if (!byEvent.has(groupKey)) byEvent.set(groupKey, []);
                byEvent.get(groupKey).push(candidate);
            }

            const allResults = [];
            const winnerIds = [];
            const loserIds = [];
            let drawOrder = 0;

            for (const [groupKey, group] of byEvent.entries()) {
                const bucketLabel = groupKey;
                const sampleEvent = group[0]?.event || groupKey;
                const cap = capacityByEvent.get(toEventKey(sampleEvent));
                const effectiveMode = resolveEffectiveMode(sampleEvent);
                const priorityRatio = Math.min(Math.max(Number(performancePriorityByGroup.get(groupKey) || 0), 0), 1);

                if (!cap && effectiveMode !== 'direct') {
                    warnings.push(`项目 ${sampleEvent} 缺少容量配置，默认按 0 个随机名额处理。`);
                }

                const qualifiedPool = shuffle(group.filter((candidate) => candidate.audit_status === 'qualified_time'));
                const generalPool = shuffle(group.filter((candidate) => candidate.audit_status !== 'qualified_time'));
                const targetCount = effectiveMode === 'direct'
                    ? group.length
                    : Math.max(0, Math.floor(Number(cap?.target_count || 0) * Number(cap?.draw_ratio || 0)));

                const expectedQualifiedCount = Math.min(
                    qualifiedPool.length,
                    Math.round(targetCount * priorityRatio),
                );
                const qualifiedWinners = effectiveMode === 'direct'
                    ? qualifiedPool
                    : qualifiedPool.slice(0, expectedQualifiedCount);
                const remainingSlots = Math.max(targetCount - qualifiedWinners.length, 0);
                const generalWinners = effectiveMode === 'direct'
                    ? generalPool
                    : generalPool.slice(0, remainingSlots);
                const winners = [...qualifiedWinners, ...generalWinners];
                const winnerIdSet = new Set(winners.map((item) => item.id));
                const losers = group.filter((candidate) => !winnerIdSet.has(candidate.id));

                addCount(winnersByEvent, groupKey, winners.length);

                candidateGenderByEvent[groupKey] = candidateGenderByEvent[groupKey] || { M: 0, F: 0, U: 0 };
                winnerGenderByEvent[groupKey] = winnerGenderByEvent[groupKey] || { M: 0, F: 0, U: 0 };

                for (const candidate of group) {
                    addCount(candidateGenderByEvent[groupKey], getGenderKey(candidate.gender), 1);
                }
                for (const winner of winners) {
                    addCount(winnerGenderByEvent[groupKey], getGenderKey(winner.gender), 1);
                }

                for (const winner of winners) {
                    drawOrder += 1;
                    allResults.push({
                        recordId: winner.id,
                        resultStatus: 'winner',
                        bucketName: bucketLabel,
                        drawOrder,
                    });
                    winnerIds.push(winner.id);
                }

                for (const loser of losers) {
                    drawOrder += 1;
                    allResults.push({
                        recordId: loser.id,
                        resultStatus: 'loser',
                        bucketName: bucketLabel,
                        drawOrder,
                    });
                    loserIds.push(loser.id);
                    if (loser.audit_status === 'qualified_time') {
                        unselectedStats.qualified_lottery += 1;
                    } else {
                        unselectedStats.general_lottery += 1;
                    }
                }

                bucketBreakdown.push({
                    bucket: bucketLabel,
                    candidates: group.length,
                    winners: winners.length,
                    losers: losers.length,
                    fused: false,
                    qualifiedCount: qualifiedPool.length,
                    generalCount: generalPool.length,
                    qualifiedWinners: qualifiedWinners.length,
                    generalWinners: generalWinners.length,
                });
            }

            await heartbeat(58, `完成抽签分配: 中签 ${winnerIds.length}, 未中签 ${loserIds.length}`);

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

            await heartbeat(72, '写回 records 状态');

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

            await heartbeat(85, '扣减服装库存并整理库存报告');

            const winnerRecords = winnerIds.length > 0
                ? await trx('records')
                    .whereIn('id', winnerIds)
                    .where({ org_id: orgId })
                    .select('id', 'event', 'gender', 'clothing_size')
                : [];

            const deductMap = new Map();
            const consumedBySize = {};
            const consumedByEventSize = {};

            for (const winner of winnerRecords) {
                if (resolveEffectiveMode(winner.event) === 'direct') continue;
                if (!winner.clothing_size) continue;

                const rawEvent = winner.event || 'ALL';
                const normalizedEvent = toEventKey(winner.event) || rawEvent;
                const gender = winner.gender || 'U';
                const size = winner.clothing_size;
                const key = `${rawEvent}|${normalizedEvent}|${gender}|${size}`;
                deductMap.set(key, (deductMap.get(key) || 0) + 1);

                addCount(consumedBySize, size, 1);
                const eventSizeKey = `${getEventGroupKey(winner.event)}|${size}`;
                addCount(consumedByEventSize, eventSizeKey, 1);
            }

            const deductReport = [];
            for (const [key, count] of deductMap) {
                const [rawEvent, normalizedEvent, gender, size] = key.split('|');
                const result = await incrementInventoryWithFallback(
                    trx,
                    orgId,
                    raceId,
                    rawEvent,
                    normalizedEvent,
                    gender,
                    size,
                    count,
                );
                if (!result.matched) {
                    warnings.push(`尺码 ${size} 在 ${normalizedEvent}/${gender} 下未找到可扣减库存，将保留为异常提示。`);
                }
                deductReport.push({
                    event: result.event,
                    rawEvent,
                    normalizedEvent,
                    gender,
                    size,
                    count,
                    matched: result.matched,
                });
            }

            const totalInventoryBySize = {};
            const previouslyUsedBySize = {};
            for (const row of inventoryRows) {
                addCount(totalInventoryBySize, row.size, Number(row.total_inventory || 0));
                addCount(previouslyUsedBySize, row.size, Number(row.used_count || 0));
            }

            const lockedBySize = {};
            for (const locked of lockedRecords) {
                if (locked.clothing_size) {
                    addCount(lockedBySize, locked.clothing_size, 1);
                }
            }

            const inventoryWarnings = [];
            const inventoryReport = [...new Set([
                ...Object.keys(totalInventoryBySize),
                ...Object.keys(consumedBySize),
            ])].sort().map((size) => {
                const totalInventory = Number(totalInventoryBySize[size] || 0);
                const previouslyUsed = Number(previouslyUsedBySize[size] || 0);
                const consumed = Number(consumedBySize[size] || 0);
                const remaining = totalInventory - previouslyUsed - consumed;
                if (remaining < 0) {
                    inventoryWarnings.push(`尺码 ${size} 扣减后剩余 ${remaining}，存在超配风险。`);
                }
                return {
                    size,
                    totalInventory,
                    previouslyUsed,
                    lockedCount: Number(lockedBySize[size] || 0),
                    consumed,
                    remaining,
                    fullConsumed: Number(consumedByEventSize[`Full|${size}`] || 0),
                    halfConsumed: Number(consumedByEventSize[`Half|${size}`] || 0),
                };
            });

            const genderStats = {};
            for (const [groupKey, winners] of Object.entries(winnerGenderByEvent)) {
                const candidateStats = candidateGenderByEvent[groupKey] || { M: 0, F: 0, U: 0 };
                const knownCandidateTotal = Number(candidateStats.M || 0) + Number(candidateStats.F || 0);
                const weight = genderWeightByGroup.get(groupKey)
                    || genderWeightByGroup.get('ALL')
                    || {
                        maleRatio: knownCandidateTotal > 0 ? Number(candidateStats.M || 0) / knownCandidateTotal : 0.5,
                        femaleRatio: knownCandidateTotal > 0 ? Number(candidateStats.F || 0) / knownCandidateTotal : 0.5,
                    };
                const maleWinners = Number(winners.M || 0);
                const femaleWinners = Number(winners.F || 0);
                const total = maleWinners + femaleWinners;
                genderStats[groupKey] = {
                    male: {
                        target: Math.round((Number(weight.maleRatio || 0) || 0) * total),
                        winners: maleWinners,
                        targetRatio: Number(weight.maleRatio || 0) || 0,
                        actualRatio: total > 0 ? maleWinners / total : 0,
                    },
                    female: {
                        target: Math.round((Number(weight.femaleRatio || 0) || 0) * total),
                        winners: femaleWinners,
                        targetRatio: Number(weight.femaleRatio || 0) || 0,
                        actualRatio: total > 0 ? femaleWinners / total : 0,
                    },
                    total,
                };
            }

            await heartbeat(95, '汇总执行结果');

            const lockedTotal = Object.values(lockedByEvent).reduce((sum, value) => sum + Number(value || 0), 0);

            const resultSummary = {
                totalCandidates: candidates.length,
                winners: winnerIds.length,
                losers: loserIds.length,
                selectedTotal: winnerIds.length + lockedTotal,
                winnersByEvent,
                lockedByEvent,
                bucketBreakdown,
                inventoryReport,
                unselectedStats,
                genderStats,
                inventoryWarnings,
                warnings,
                errors,
                inventoryDeducted: Object.values(consumedBySize).reduce((sum, value) => sum + Number(value || 0), 0),
                deductReport,
            };

            await trx('pipeline_executions')
                .where({ id: execId, org_id: orgId, race_id: raceId })
                .update({
                    status: 'succeeded',
                    result: resultSummary,
                    completed_at: new Date(),
                });

            return resultSummary;
        });

        return resultSummary;
    } catch (err) {
        if (executionStarted) {
            try {
                await knex('pipeline_executions')
                    .insert({
                        org_id: orgId,
                        race_id: raceId,
                        execution_type: 'lottery',
                        status: 'failed',
                        result: {},
                        error: err.message,
                        completed_at: new Date(),
                    });
            } catch (statusError) {
                console.error('[lottery:finalize] Failed to persist execution failure:', statusError);
            }
        }
        throw err;
    }
});

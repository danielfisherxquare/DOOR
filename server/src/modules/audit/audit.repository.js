/**
 * Audit Repository — 审核运行记录 + 审核准备统计 数据访问层
 * 多租户隔离：所有查询必须带 org_id
 *
 * ⚠️ 关键业务逻辑：
 * - getPrepStats 基于 lotteryStatus（中文枚举值）统计，非 auditStatus！
 * - resetAudit 包含叠加保护逻辑（pre_excluded），非简单重置！
 */
import knex from '../../db/knex.js';
import { auditRunMapper } from '../../db/mappers/audit.js';

// ─── 审核准备统计 ────────────────────────────────────────────────────
// 基于 lotteryStatus（中文枚举值）聚合统计，与 sqliteService.getAuditPrepStats 逻辑一致
export async function getPrepStats(orgId, raceId) {
    const rows = await knex('records')
        .where({ org_id: orgId, race_id: raceId })
        .groupBy('event')
        .select(
            'event',
            knex.raw("SUM(CASE WHEN lottery_status = '参与抽签' THEN 1 ELSE 0 END)::int AS participate"),
            knex.raw("SUM(CASE WHEN lottery_status IN ('直通名额','直通','强制保签') THEN 1 ELSE 0 END)::int AS direct"),
            knex.raw("SUM(CASE WHEN lottery_status IN ('不予通过','模糊剔除','未成年剔除','精英资质存疑','强制剔除') THEN 1 ELSE 0 END)::int AS denied"),
            knex.raw("SUM(CASE WHEN lottery_status IS NULL OR lottery_status = '' OR lottery_status NOT IN ('参与抽签','直通名额','直通','强制保签','不予通过','模糊剔除','未成年剔除','精英资质存疑','强制剔除') THEN 1 ELSE 0 END)::int AS pending"),
            knex.raw("COUNT(*)::int AS subtotal"),
        )
        .orderBy('event');

    const byEvent = {};
    let total = 0;
    for (const r of rows) {
        byEvent[r.event || '(未知)'] = {
            participate: r.participate || 0,
            direct: r.direct || 0,
            denied: r.denied || 0,
            pending: r.pending || 0,
            subtotal: r.subtotal || 0,
        };
        total += r.subtotal || 0;
    }
    return { byEvent, total };
}

// ─── 审核重置（含叠加保护逻辑）─────────────────────────────────────
// ⚠️ 非简单重置！已有排除性 lotteryStatus 的记录会被保留为 reject (pre_excluded)
const EXCLUSION_STATUSES = [
    '未成年剔除', '不予通过', '模糊剔除', '精英资质存疑',
    '直通', '直通名额', '强制保签', '强制剔除',
];

export async function resetAudit(orgId, raceId) {
    return knex.transaction(async (trx) => {
        // 步骤 1：保留已有排除性 lotteryStatus 的记录 → reject + pre_excluded
        const preservedResult = await trx('records')
            .where({ org_id: orgId, race_id: raceId })
            .whereIn('lottery_status', EXCLUSION_STATUSES)
            .update({
                audit_status: 'reject',
                reject_reason: 'pre_excluded',
            });

        // 步骤 2：将其余非 pending 的记录重置为 pending
        const resetResult = await trx('records')
            .where({ org_id: orgId, race_id: raceId })
            .whereNot('audit_status', 'pending')
            .whereNotIn('lottery_status', EXCLUSION_STATUSES)
            .update({
                audit_status: 'pending',
                reject_reason: '',
                is_locked: 0,
            });

        // 清除旧审核记录
        await trx('audit_results').where({ org_id: orgId, race_id: raceId }).delete();
        await trx('audit_runs').where({ org_id: orgId, race_id: raceId }).delete();

        // 获取 pending 计数
        const { cnt: pending } = await trx('records')
            .where({ org_id: orgId, race_id: raceId, audit_status: 'pending' })
            .count('* as cnt')
            .first();

        return {
            ok: true,
            pending: Number(pending) || 0,
            preserved: preservedResult || 0,
        };
    });
}

// ─── audit_runs CRUD ─────────────────────────────────────────────────

export async function createRun(orgId, raceId, stepNumber, stepName) {
    const row = {
        org_id: orgId,
        race_id: raceId,
        step_number: stepNumber,
        step_name: stepName,
        status: 'running',
        executed_at: new Date(),
    };
    const [inserted] = await knex('audit_runs').insert(row).returning('*');
    return auditRunMapper.fromDbRow(inserted);
}

export async function completeRun(runId, affected, remaining) {
    const [updated] = await knex('audit_runs')
        .where({ id: runId })
        .update({
            status: 'completed',
            affected,
            remaining,
        })
        .returning('*');
    return auditRunMapper.fromDbRow(updated);
}

export async function failRun(runId, error) {
    const [updated] = await knex('audit_runs')
        .where({ id: runId })
        .update({
            status: 'failed',
            error: String(error),
        })
        .returning('*');
    return auditRunMapper.fromDbRow(updated);
}

export async function getLatestRuns(orgId, raceId) {
    // 每个步骤取最近一条记录
    const rows = await knex('audit_runs')
        .where({ org_id: orgId, race_id: raceId })
        .orderBy('created_at', 'desc');
    // 按 stepNumber 去重，保留最新
    const latest = {};
    for (const row of rows) {
        if (!latest[row.step_number]) {
            latest[row.step_number] = auditRunMapper.fromDbRow(row);
        }
    }
    return Object.values(latest).sort((a, b) => a.stepNumber - b.stepNumber);
}

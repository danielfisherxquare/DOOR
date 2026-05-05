import { registerHandler } from '../jobs/job.handlers.js';
import { createPreview, finalizeLatestPreview } from './lottery-v2.service.js';

registerHandler('lottery-v2:preview', async (job, { heartbeat }) => {
    const raceId = Number(job.payload?.raceId);
    if (!Number.isFinite(raceId) || raceId <= 0) {
        throw Object.assign(new Error('Invalid raceId in Lottery V2 preview payload'), { code: 'INVALID_RACE_ID' });
    }
    await heartbeat(5, 'Lottery V2 正在生成服装约束预演');
    const snapshot = await createPreview(job.orgId, raceId);
    await heartbeat(100, snapshot.status === 'blocked' ? 'Lottery V2 预演阻断' : 'Lottery V2 预演完成');
    return snapshot;
});

registerHandler('lottery-v2:finalize', async (job, { heartbeat }) => {
    const raceId = Number(job.payload?.raceId);
    if (!Number.isFinite(raceId) || raceId <= 0) {
        throw Object.assign(new Error('Invalid raceId in Lottery V2 finalize payload'), { code: 'INVALID_RACE_ID' });
    }
    await heartbeat(5, 'Lottery V2 正在基于预演快照写回结果');
    const snapshot = await finalizeLatestPreview(job.orgId, raceId);
    await heartbeat(100, 'Lottery V2 正式执行完成');
    return snapshot;
});

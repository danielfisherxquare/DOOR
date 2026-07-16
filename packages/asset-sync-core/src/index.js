export const SYNC_JOB_STATES = Object.freeze(['queued', 'running', 'paused', 'conflict', 'failed', 'completed'])

export function createSyncJob(input) {
  return {
    id: input.id,
    direction: input.direction,
    assetId: input.assetId || null,
    filePath: input.filePath || null,
    state: 'queued',
    progress: 0,
    attempts: 0,
    error: null,
    createdAt: input.createdAt || new Date().toISOString(),
  }
}

export function transitionSyncJob(job, event) {
  if (!SYNC_JOB_STATES.includes(job.state)) throw new TypeError(`Unknown sync job state: ${job.state}`)
  if (event.type === 'start') return { ...job, state: 'running', attempts: job.attempts + 1, error: null }
  if (event.type === 'progress') return { ...job, progress: Math.max(0, Math.min(1, Number(event.progress) || 0)) }
  if (event.type === 'pause') return { ...job, state: 'paused' }
  if (event.type === 'conflict') return { ...job, state: 'conflict', error: event.error || null }
  if (event.type === 'fail') return { ...job, state: 'failed', error: event.error || null }
  if (event.type === 'complete') return { ...job, state: 'completed', progress: 1, error: null }
  throw new TypeError(`Unknown sync job event: ${event.type}`)
}

export async function pullUntilCurrent({ client, store, cursor = '0', limit = 100 }) {
  let nextCursor = cursor
  let hasMore = true
  while (hasMore) {
    const batch = await client.pullChanges(nextCursor, limit)
    await store.applyRemoteBatch(batch)
    nextCursor = batch.nextCursor
    hasMore = batch.hasMore
  }
  await store.setCursor(nextCursor)
  return nextCursor
}

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createSyncJob, pullUntilCurrent, transitionSyncJob } from '../src/index.js'

describe('asset sync core', () => {
  it('keeps upload state transitions explicit', () => {
    const queued = createSyncJob({ id: 'job-1', direction: 'upload', filePath: '/tmp/logo.png' })
    const running = transitionSyncJob(queued, { type: 'start' })
    const complete = transitionSyncJob(running, { type: 'complete' })
    assert.equal(running.attempts, 1)
    assert.equal(complete.state, 'completed')
    assert.equal(complete.progress, 1)
  })

  it('pulls every change page before advancing the local cursor', async () => {
    const calls = []
    const batches = []
    const cursorWrites = []
    const client = {
      async pullChanges(cursor) {
        calls.push(cursor)
        return cursor === '0'
          ? { changes: [{ id: '1' }], tombstones: [], nextCursor: '1', hasMore: true }
          : { changes: [], tombstones: [{ id: '2' }], nextCursor: '2', hasMore: false }
      },
    }
    const store = {
      async applyRemoteBatch(batch) { batches.push(batch) },
      async setCursor(cursor) { cursorWrites.push(cursor) },
    }
    assert.equal(await pullUntilCurrent({ client, store }), '2')
    assert.deepEqual(calls, ['0', '1'])
    assert.equal(batches.length, 2)
    assert.deepEqual(cursorWrites, ['2'])
  })
})

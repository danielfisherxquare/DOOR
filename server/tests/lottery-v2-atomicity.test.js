import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { saveConfig } from '../src/modules/lottery-v2/lottery-v2.service.js'

function createTransactionalDatabase({ failSnapshotUpdate = false } = {}) {
  const durable = {
    config: { seed: 'old-seed' },
    snapshotStatus: 'ready',
  }

  const database = {
    async transaction(work) {
      const staged = structuredClone(durable)

      const trx = (table) => {
        let insertedRow = null
        const query = {
          where() { return query },
          whereIn() { return query },
          forUpdate() { return query },
          first() {
            if (table === 'races') return Promise.resolve({ id: 9 })
            if (table === 'pipeline_executions') return Promise.resolve(null)
            return Promise.resolve(null)
          },
          insert(row) {
            insertedRow = row
            return query
          },
          onConflict() { return query },
          merge() { return query },
          returning() {
            staged.config = { ...insertedRow }
            return Promise.resolve([{ id: 1, ...insertedRow }])
          },
          update(values) {
            if (table === 'lottery_v2_snapshots') {
              if (failSnapshotUpdate) throw new Error('snapshot update failed')
              staged.snapshotStatus = values.status
            }
            return Promise.resolve(1)
          },
        }
        return query
      }
      trx.fn = { now: () => 'now' }

      const result = await work(trx)
      durable.config = staged.config
      durable.snapshotStatus = staged.snapshotStatus
      return result
    },
  }

  return { database, durable }
}

describe('lottery v2 transaction boundaries', () => {
  it('rolls back the config write when invalidating ready previews fails', async () => {
    const { database, durable } = createTransactionalDatabase({ failSnapshotUpdate: true })

    await assert.rejects(
      () => saveConfig('org-1', 9, { seed: 'new-seed' }, database),
      /snapshot update failed/u,
    )

    assert.deepEqual(durable.config, { seed: 'old-seed' })
    assert.equal(durable.snapshotStatus, 'ready')
  })
})

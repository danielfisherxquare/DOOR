import assert from 'node:assert/strict'
import { it } from 'node:test'

import { createTwinMutationWorkflow } from '../src/modules/inventory/inventory.twin.service.js'

function transactionalState(initialState) {
  let durable = structuredClone(initialState)
  return {
    database: {
      async transaction(work) {
        const staged = structuredClone(durable)
        const result = await work({ state: staged, isTransaction: true })
        durable = staged
        return result
      },
    },
    read: () => structuredClone(durable),
  }
}

it('rolls back a twin location when QR registration fails', async () => {
  const state = transactionalState({ locations: [], qrEntities: [] })
  const repository = {
    createTwinLocation: async (_orgId, data, trx) => {
      const location = {
        id: 10,
        warehouse_id: data.warehouseId,
        code: data.code,
        qr_code: data.qrCode,
      }
      trx.state.locations.push(location)
      return location
    },
    findQrEntity: async () => null,
    findQrEntityByCode: async () => null,
    createQrEntity: async () => {
      throw new Error('QR registration failed')
    },
  }
  const workflow = createTwinMutationWorkflow({ database: state.database, repository })

  await assert.rejects(
    () =>
      workflow.createTwinLocation('org-1', {
        warehouseId: 3,
        code: 'A-01',
        qrCode: 'LOC-3-A-01',
      }),
    /QR registration failed/,
  )
  assert.deepEqual(state.read(), { locations: [], qrEntities: [] })
})

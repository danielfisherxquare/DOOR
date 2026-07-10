import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  parseStocktakingFilters,
  parseStocktakingPlanPayload,
  parseStocktakingScanPayload,
} from '../src/modules/inventory/inventory.schema.js'
import { createStocktakingWorkflow } from '../src/modules/inventory/inventory.stocktaking.workflow.service.js'

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

describe('stocktaking schemas', () => {
  it('requires plan names and strips forged lifecycle fields', () => {
    assert.deepEqual(
      parseStocktakingPlanPayload({
        planName: ' Q3 count ',
        planType: 'partial',
        warehouseId: '8',
        scope: { itemTypes: ['bag', ' medal '], orgId: 'forged' },
        status: 'completed',
        countedItems: 999,
      }),
      {
        planName: 'Q3 count',
        planType: 'partial',
        warehouseId: 8,
        scope: { itemTypes: ['bag', 'medal'] },
      },
    )
    assert.throws(() => parseStocktakingPlanPayload({ planName: '' }), /planName/)
    assert.throws(
      () => parseStocktakingFilters('plans', { status: 'forged' }),
      /status/,
    )
  })

  it('normalizes scan defaults without allowing a forged counter', () => {
    assert.deepEqual(
      parseStocktakingScanPayload({
        planId: '4',
        qrCode: ' BAG-1 ',
        actualLocation: ' A-01 ',
        actualStatus: '',
        actualQuantity: '',
        countedBy: 'forged',
      }),
      {
        planId: 4,
        qrCode: 'BAG-1',
        actualLocation: 'A-01',
        actualStatus: 'in_stock',
        actualQuantity: 1,
      },
    )
  })
})

describe('stocktaking workflow atomicity', () => {
  it('rolls back generated records when starting the plan fails', async () => {
    const state = transactionalState({ planStatus: 'draft', records: [] })
    const repository = {
      getPlan: async (_orgId, _planId, trx, options) => {
        assert.deepEqual(options, { forUpdate: true })
        return { id: 3, status: trx.state.planStatus, scope: { item_types: ['bag'] } }
      },
      getUnitsForPlan: async () => [{ id: 9, qr_code: 'BAG-9', status: 'in_stock' }],
      createRecords: async (_orgId, _planId, records, trx) => {
        trx.state.records.push(...records)
      },
      markPlanStarted: async () => {
        throw new Error('plan update failed')
      },
    }
    const workflow = createStocktakingWorkflow({ database: state.database, repository })

    await assert.rejects(() => workflow.startPlan('org-1', 3), /plan update failed/)
    assert.deepEqual(state.read(), { planStatus: 'draft', records: [] })
  })

  it('rolls back a counted record when progress update fails', async () => {
    const state = transactionalState({ counted: false, countedItems: 0 })
    const repository = {
      getPlan: async () => ({ id: 3, status: 'in_progress' }),
      getRecordByQr: async (_orgId, _planId, _qrCode, trx, options) => {
        assert.deepEqual(options, { forUpdate: true })
        return {
          id: 10,
          actual_quantity: trx.state.counted ? 1 : null,
          expected_status: 'in_stock',
          expected_location: 'A-01',
        }
      },
      updateRecordCount: async (_orgId, _recordId, _data, trx) => {
        trx.state.counted = true
      },
      incrementPlanProgress: async () => {
        throw new Error('progress update failed')
      },
    }
    const workflow = createStocktakingWorkflow({ database: state.database, repository })

    await assert.rejects(
      () =>
        workflow.scanCount(
          'org-1',
          3,
          {
            qrCode: 'BAG-9',
            actualLocation: 'A-01',
            actualStatus: 'in_stock',
            actualQuantity: 1,
          },
          'user-1',
        ),
      /progress update failed/,
    )
    assert.deepEqual(state.read(), { counted: false, countedItems: 0 })
  })
})

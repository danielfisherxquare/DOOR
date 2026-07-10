import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  parseAlertFilters,
  parseAlertRulePayload,
  parseBatchPayload,
  parseBatchUnitPayload,
  parseLocationPayload,
  parseMaterialApprovalPayload,
  parseTransactionFilters,
  parseUnitStatusPayload,
  parseUnitScanPayload,
  parseWarehousePayload,
  resolveInventoryOrgId,
} from '../src/modules/inventory/inventory.schema.js'
import { createInventoryWorkflow } from '../src/modules/inventory/inventory.workflow.service.js'

describe('inventory schemas', () => {
  it('keeps ordinary users in their own organization and rejects forged scope', () => {
    assert.equal(resolveInventoryOrgId({ role: 'org_admin', orgId: 'org-1' }, {}), 'org-1')
    assert.equal(
      resolveInventoryOrgId({ role: 'org_admin', orgId: 'org-1' }, { orgId: 'org-1' }),
      'org-1',
    )
    assert.throws(
      () => resolveInventoryOrgId({ role: 'org_admin', orgId: 'org-1' }, { orgId: 'org-2' }),
      (error) => error.status === 403 && error.code === 'INVENTORY_SCOPE_FORBIDDEN',
    )
  })

  it('caps batch inbound expansion and strips forged fields', () => {
    assert.deepEqual(
      parseBatchUnitPayload({
        batchId: '7',
        warehouseId: '8',
        orgId: 'forged',
        items: [
          {
            itemType: ' bag ',
            itemCategory: ' Runner bag ',
            itemSpec: { size: 'L' },
            quantity: '2',
            orgId: 'forged',
          },
        ],
      }),
      {
        batchId: 7,
        warehouseId: 8,
        items: [
          {
            itemType: 'bag',
            itemCategory: 'Runner bag',
            itemSpec: { size: 'L' },
            quantity: 2,
          },
        ],
      },
    )
    assert.throws(
      () =>
        parseBatchUnitPayload({
          batchId: 7,
          items: [{ itemType: 'bag', quantity: 10001 }],
        }),
      /10000/,
    )
  })

  it('requires a real runner for pickup scans', () => {
    assert.deepEqual(
      parseUnitScanPayload({
        qrCode: ' BAG-1 ',
        action: 'pickup',
        raceId: 'race-1',
        runnerId: 'runner-1',
        status: 'forged',
      }),
      { qrCode: 'BAG-1', action: 'pickup', raceId: 'race-1', runnerId: 'runner-1' },
    )
    assert.throws(
      () => parseUnitScanPayload({ qrCode: 'BAG-1', action: 'pickup', runnerId: '' }),
      /runnerId/,
    )
  })

  it('requires create-time fields while preserving explicit nullable clears on updates', () => {
    assert.throws(() => parseBatchPayload({}, { partial: false }), /batchName/)
    assert.deepEqual(
      parseBatchPayload({ batchName: ' Summer kit ', batchType: 'clothing', supplier: '' }),
      { batchName: 'Summer kit', batchType: 'clothing', supplier: null },
    )
    assert.throws(() => parseWarehousePayload({ name: 'Main' }), /code/)
    assert.throws(() => parseLocationPayload({ warehouseId: 1 }), /code/)
    assert.deepEqual(
      parseWarehousePayload({ address: '', contact: null }, { partial: true }),
      { address: null, contact: null },
    )
  })

  it('whitelists unit status updates and maps public fields to database columns', () => {
    assert.deepEqual(
      parseUnitStatusPayload({
        status: 'returned',
        warehouseId: '8',
        locationId: null,
        currentHolderType: 'org',
        currentHolderId: 'org-1',
        org_id: 'forged',
        picked_by: 'forged',
      }),
      {
        status: 'returned',
        extra: {
          warehouse_id: 8,
          location_id: null,
          current_holder_type: 'org',
          current_holder_id: 'org-1',
        },
      },
    )
    assert.throws(() => parseUnitStatusPayload({ status: 'admin' }), /status/)
  })

  it('validates alert filters and rule updates without accepting database columns', () => {
    assert.deepEqual(
      parseAlertFilters({ isRead: 'false', isResolved: '1', severity: 'warning', limit: '25' }),
      { isRead: false, isResolved: true, severity: 'warning', limit: 25 },
    )
    assert.deepEqual(
      parseAlertRulePayload(
        {
          ruleType: 'low_stock',
          thresholdValue: '10',
          thresholdType: 'quantity',
          notifyChannels: ['in_app'],
          isEnabled: 'false',
          org_id: 'forged',
          created_at: 'forged',
        },
        { partial: true },
      ),
      {
        ruleType: 'low_stock',
        thresholdValue: 10,
        thresholdType: 'quantity',
        notifyChannels: ['in_app'],
        isEnabled: false,
      },
    )
    assert.throws(
      () =>
        parseAlertRulePayload({
          ruleType: 'arbitrary_sql',
          thresholdValue: 1,
          thresholdType: 'quantity',
        }),
      /ruleType/,
    )
  })

  it('bounds reporting filters and material approvals', () => {
    assert.deepEqual(
      parseTransactionFilters({ unitId: '8', transactionType: 'pickup', limit: '5000' }),
      { unitId: 8, transactionType: 'pickup', limit: 500 },
    )
    assert.deepEqual(parseMaterialApprovalPayload({ approvedQuantity: '12', status: 'forged' }), {
      approvedQuantity: 12,
    })
    assert.throws(() => parseMaterialApprovalPayload({ approvedQuantity: -1 }), /approvedQuantity/)
  })
})

describe('inventory workflow atomicity', () => {
  it('rolls back a pickup status change when its transaction log fails', async () => {
    let durable = { status: 'allocated', transactions: [] }
    const database = {
      async transaction(work) {
        const staged = structuredClone(durable)
        const result = await work({ state: staged })
        durable = staged
        return result
      },
    }
    const repository = {
      getUnitByQR: async (_orgId, _qrCode, trx) => ({
        id: 1,
        status: trx.state.status,
      }),
      updateUnitStatus: async (_orgId, _unitId, status, _extra, trx) => {
        trx.state.status = status
      },
      createTransaction: async () => {
        throw new Error('transaction log failed')
      },
    }
    const workflow = createInventoryWorkflow({ database, repository, twinService: {} })

    await assert.rejects(
      () =>
        workflow.scanUnit({
          orgId: 'org-1',
          userId: 'user-1',
          input: {
            qrCode: 'BAG-1',
            action: 'pickup',
            raceId: 'race-1',
            runnerId: 'runner-1',
          },
        }),
      /transaction log failed/,
    )

    assert.equal(durable.status, 'allocated')
    assert.deepEqual(durable.transactions, [])
  })

  it('allocates locked stock to the request race inside one transaction', async () => {
    const trx = { isTransaction: true }
    let allocation
    const database = { transaction: (work) => work(trx) }
    const repository = {
      getRequestById: async (_orgId, _requestId, actualTrx, options) => {
        assert.equal(actualTrx, trx)
        assert.deepEqual(options, { forUpdate: true })
        return {
          id: 11,
          race_id: 23,
          item_type: 'bag',
          approved_quantity: 2,
          status: 'approved',
        }
      },
      getUnits: async (_orgId, filters, actualTrx, options) => {
        assert.deepEqual(filters, { itemType: 'bag', status: 'in_stock', limit: 2 })
        assert.equal(actualTrx, trx)
        assert.deepEqual(options, { forUpdate: true })
        return [{ id: 31 }, { id: 32 }]
      },
      allocateToRace: async (...args) => {
        allocation = args
        return { allocated: 2 }
      },
    }
    const workflow = createInventoryWorkflow({ database, repository, twinService: {} })

    assert.deepEqual(await workflow.allocateRequest({ orgId: 'org-1', requestId: 11 }), {
      allocated: 2,
    })
    assert.deepEqual(allocation, ['org-1', 11, 23, [{ id: 31 }, { id: 32 }], trx])
  })

  it('does not approve more material than the pending request', async () => {
    const trx = { isTransaction: true }
    let updated = false
    const workflow = createInventoryWorkflow({
      database: { transaction: (work) => work(trx) },
      repository: {
        getRequestById: async () => ({
          id: 11,
          status: 'pending',
          requested_quantity: 5,
        }),
        approveRequest: async () => {
          updated = true
        },
      },
      twinService: {},
    })

    await assert.rejects(
      () =>
        workflow.approveRequest({
          orgId: 'org-1',
          requestId: 11,
          approvedQuantity: 6,
          approverId: 'user-1',
        }),
      /申请数量/,
    )
    assert.equal(updated, false)
  })
})

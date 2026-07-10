import knex from '../../db/knex.js'
import * as defaultRepository from './inventory.repository.js'
import * as defaultTwinService from './inventory.twin.service.js'

function workflowError(message, code, status = 400) {
  const error = new Error(message)
  error.status = status
  error.code = code
  error.expose = true
  return error
}

function getTypeCode(type) {
  return { clothing: 'CLOTH', medal: 'MEDAL', bag: 'BAG', bib: 'BIB' }[type] || 'OTHER'
}

export function createInventoryWorkflow({
  database = knex,
  repository = defaultRepository,
  twinService = defaultTwinService,
} = {}) {
  return {
    createBatchUnits({ orgId, userId, input }) {
      return database.transaction(async (trx) => {
        const batch = await repository.getBatchById(orgId, input.batchId, trx, { forUpdate: true })
        if (!batch) throw workflowError('批次不存在', 'INVENTORY_BATCH_NOT_FOUND')

        const units = []
        const orgCode = orgId.substring(0, 4).toUpperCase()
        const typeCode = getTypeCode(batch.batch_type)
        const batchCode = String(input.batchId).padStart(4, '0')
        let sequence = await repository.getMaxSequence(orgId, input.batchId, trx)

        for (const item of input.items) {
          for (let index = 0; index < item.quantity; index += 1) {
            sequence += 1
            units.push({
              batchId: input.batchId,
              qrCode: `${orgCode}-${typeCode}-${batchCode}-${String(sequence).padStart(6, '0')}`,
              itemType: item.itemType,
              itemCategory: item.itemCategory,
              itemSpec: item.itemSpec,
              warehouseId: item.warehouseId || input.warehouseId,
              locationId: item.locationId,
            })
          }
        }

        const createdUnits = await repository.createUnits(orgId, units, trx)
        await repository.updateBatchQuantity(
          orgId,
          input.batchId,
          Number(batch.total_quantity || 0) + createdUnits.length,
          trx,
        )
        const twinSync = await twinService.syncLegacyUnitsToTwinObjects(
          orgId,
          createdUnits,
          { currentWarehouseId: input.warehouseId, createdBy: userId || null },
          trx,
        )
        return { units: createdUnits, twinSync }
      })
    },

    scanUnit({ orgId, userId, input }) {
      return database.transaction(async (trx) => {
        const unit = await repository.getUnitByQR(orgId, input.qrCode, trx, { forUpdate: true })
        if (!unit) throw workflowError('物资不存在', 'INVENTORY_UNIT_NOT_FOUND', 404)
        if (input.action !== 'pickup') return { action: 'lookup', unit }
        if (unit.status !== 'allocated') {
          throw workflowError('物资状态异常，无法领取', 'INVENTORY_UNIT_NOT_ALLOCATED')
        }

        await repository.updateUnitStatus(
          orgId,
          unit.id,
          'picked',
          {
            current_holder_type: 'runner',
            current_holder_id: input.runnerId,
            picked_at: trx.fn?.now?.(),
            picked_by: userId,
          },
          trx,
        )
        await repository.createTransaction(
          orgId,
          {
            unitId: unit.id,
            transactionType: 'pickup',
            fromHolderType: 'race',
            fromHolderId: input.raceId,
            toHolderType: 'runner',
            toHolderId: input.runnerId,
            operatorId: userId,
            remarks: '扫码领取',
          },
          trx,
        )
        return {
          action: 'pickup',
          unit: {
            ...unit,
            status: 'picked',
            current_holder_type: 'runner',
            current_holder_id: input.runnerId,
          },
        }
      })
    },

    approveRequest({ orgId, requestId, approvedQuantity, approverId }) {
      return database.transaction(async (trx) => {
        const request = await repository.getRequestById(orgId, requestId, trx, {
          forUpdate: true,
        })
        if (!request) {
          throw workflowError('物资申请不存在', 'INVENTORY_REQUEST_NOT_FOUND', 404)
        }
        if (request.status !== 'pending') {
          throw workflowError('只有待审批申请可以审批', 'INVENTORY_REQUEST_NOT_PENDING')
        }
        if (approvedQuantity > Number(request.requested_quantity)) {
          throw workflowError('批准数量不能超过申请数量', 'INVENTORY_APPROVAL_QUANTITY_EXCEEDED')
        }
        return repository.approveRequest(
          orgId,
          requestId,
          approvedQuantity,
          approverId,
          trx,
        )
      })
    },

    allocateRequest({ orgId, requestId }) {
      return database.transaction(async (trx) => {
        const request = await repository.getRequestById(orgId, requestId, trx, {
          forUpdate: true,
        })
        if (!request || request.status !== 'approved') {
          throw workflowError('申请未审批通过', 'INVENTORY_REQUEST_NOT_APPROVED')
        }
        const units = await repository.getUnits(
          orgId,
          {
            itemType: request.item_type,
            status: 'in_stock',
            limit: request.approved_quantity,
          },
          trx,
          { forUpdate: true },
        )
        if (units.length < request.approved_quantity) {
          throw workflowError('库存不足', 'INVENTORY_STOCK_INSUFFICIENT')
        }
        return repository.allocateToRace(orgId, requestId, request.race_id, units, trx)
      })
    },
  }
}

export const inventoryWorkflow = createInventoryWorkflow()

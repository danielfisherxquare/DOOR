import knex from '../../db/knex.js'
import * as defaultRepository from './inventory.stocktaking.js'

function workflowError(message, code, status = 400) {
  const error = new Error(message)
  error.status = status
  error.code = code
  error.expose = true
  return error
}

export function createStocktakingWorkflow({ database = knex, repository = defaultRepository } = {}) {
  return {
    startPlan(orgId, planId) {
      return database.transaction(async (trx) => {
        const plan = await repository.getPlan(orgId, planId, trx, { forUpdate: true })
        if (!plan) throw workflowError('盘点计划不存在', 'STOCKTAKING_PLAN_NOT_FOUND', 404)
        if (plan.status !== 'draft') {
          throw workflowError('只有草稿状态的计划才能开始', 'STOCKTAKING_PLAN_NOT_DRAFT')
        }

        const units = await repository.getUnitsForPlan(orgId, plan, trx)
        const records = units.map((unit) => ({
          unit_id: unit.id,
          qr_code: unit.qr_code,
          expected_location: unit.location_id ? String(unit.location_id) : null,
          expected_status: unit.status,
          system_quantity: 1,
          actual_quantity: null,
          is_matched: null,
          counted_by: null,
          counted_at: null,
        }))
        await repository.createRecords(orgId, planId, records, trx)
        return repository.markPlanStarted(orgId, planId, records.length, trx)
      })
    },

    scanCount(orgId, planId, input, countedBy) {
      return database.transaction(async (trx) => {
        const plan = await repository.getPlan(orgId, planId, trx, { forUpdate: true })
        if (!plan) throw workflowError('盘点计划不存在', 'STOCKTAKING_PLAN_NOT_FOUND', 404)
        if (plan.status !== 'in_progress') {
          throw workflowError('只有进行中的计划才能扫码', 'STOCKTAKING_PLAN_NOT_IN_PROGRESS')
        }
        const record = await repository.getRecordByQr(orgId, planId, input.qrCode, trx, {
          forUpdate: true,
        })
        if (!record) {
          throw workflowError('该物资不在盘点范围内', 'STOCKTAKING_RECORD_NOT_FOUND', 404)
        }
        if (record.actual_quantity !== null) {
          throw workflowError('该物资已盘点', 'STOCKTAKING_RECORD_ALREADY_COUNTED')
        }

        const isMatched =
          record.expected_status === input.actualStatus &&
          (record.expected_location === input.actualLocation || !input.actualLocation)
        const updatedRecord = await repository.updateRecordCount(
          orgId,
          record.id,
          {
            actual_location: input.actualLocation ?? null,
            actual_status: input.actualStatus,
            actual_quantity: input.actualQuantity,
            is_matched: isMatched,
            counted_by: countedBy,
          },
          trx,
        )
        await repository.incrementPlanProgress(orgId, planId, isMatched, trx)
        return { success: true, matched: isMatched, record: updatedRecord }
      })
    },

    completePlan(orgId, planId) {
      return database.transaction(async (trx) => {
        const plan = await repository.getPlan(orgId, planId, trx, { forUpdate: true })
        if (!plan) throw workflowError('盘点计划不存在', 'STOCKTAKING_PLAN_NOT_FOUND', 404)
        if (plan.status !== 'in_progress') {
          throw workflowError('只有进行中的计划才能完成', 'STOCKTAKING_PLAN_NOT_IN_PROGRESS')
        }
        const stats = await repository.getPlanStats(orgId, planId, trx)
        return repository.markPlanCompleted(orgId, planId, stats, trx)
      })
    },

    cancelPlan(orgId, planId) {
      return database.transaction(async (trx) => {
        const plan = await repository.getPlan(orgId, planId, trx, { forUpdate: true })
        if (!plan) throw workflowError('盘点计划不存在', 'STOCKTAKING_PLAN_NOT_FOUND', 404)
        if (plan.status === 'completed') {
          throw workflowError('已完成的计划不能取消', 'STOCKTAKING_PLAN_COMPLETED')
        }
        await repository.deletePlanRecords(orgId, planId, trx)
        return repository.markPlanCancelled(orgId, planId, trx)
      })
    },
  }
}

export const stocktakingWorkflow = createStocktakingWorkflow()

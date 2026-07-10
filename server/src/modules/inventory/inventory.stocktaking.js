/**
 * Inventory stocktaking data access.
 * Lifecycle mutations are coordinated by inventory.stocktaking.workflow.service.js.
 */
import knex from '../../db/knex.js'

const PLAN_STATUS = {
  DRAFT: 'draft',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
}

function dbOrKnex(db) {
  return db || knex
}

function databaseScope(scope) {
  if (!scope) return null
  const value = typeof scope === 'string' ? JSON.parse(scope) : scope
  return {
    item_types: value.item_types || value.itemTypes || [],
    locations: value.locations || [],
  }
}

export async function getPlans(orgId, filters = {}, db) {
  const query = dbOrKnex(db)('stocktaking_plans').where({ org_id: orgId })
  if (filters.status) query.where('status', filters.status)
  if (filters.planType) query.where('plan_type', filters.planType)
  return query.orderBy('created_at', 'desc').limit(filters.limit || 100)
}

export async function getPlan(orgId, planId, db, options = {}) {
  const query = dbOrKnex(db)('stocktaking_plans')
    .where({ org_id: orgId, id: planId })
    .first()
  return options.forUpdate ? query.forUpdate() : query
}

export async function createPlan(orgId, data, createdBy, db) {
  const scope = data.scope
    ? {
        item_types: data.scope.itemTypes || [],
        locations: data.scope.locations || [],
      }
    : null
  const [plan] = await dbOrKnex(db)('stocktaking_plans')
    .insert({
      org_id: orgId,
      warehouse_id: data.warehouseId,
      plan_name: data.planName,
      plan_type: data.planType,
      scope,
      status: PLAN_STATUS.DRAFT,
      total_items: 0,
      counted_items: 0,
      diff_items: 0,
      created_by: createdBy,
    })
    .returning('*')
  return plan
}

export async function getUnitsForPlan(orgId, plan, db) {
  let query = dbOrKnex(db)('org_inventory_units as units')
    .leftJoin('warehouse_locations as locations', function joinLocation() {
      this.on('locations.id', '=', 'units.location_id').andOn(
        'locations.org_id',
        '=',
        'units.org_id',
      )
    })
    .where('units.org_id', orgId)
    .whereIn('units.status', ['in_stock', 'allocated'])
    .select('units.*')
  if (plan.warehouse_id) query = query.where('units.warehouse_id', plan.warehouse_id)

  const scope = databaseScope(plan.scope)
  if (scope?.item_types.length) query = query.whereIn('units.item_type', scope.item_types)
  if (scope?.locations.length) {
    const locationIds = scope.locations
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
    query = query.where(function matchLocationScope() {
      this.whereIn('locations.code', scope.locations).orWhereIn('locations.zone', scope.locations)
      if (locationIds.length) this.orWhereIn('locations.id', locationIds)
    })
  }
  return query
}

export async function createRecords(orgId, planId, records, db) {
  if (!records.length) return []
  return dbOrKnex(db)('stocktaking_records')
    .insert(records.map((record) => ({ ...record, org_id: orgId, plan_id: planId })))
    .returning('*')
}

export async function markPlanStarted(orgId, planId, totalItems, db) {
  const database = dbOrKnex(db)
  const [plan] = await database('stocktaking_plans')
    .where({ org_id: orgId, id: planId, status: PLAN_STATUS.DRAFT })
    .update({
      status: PLAN_STATUS.IN_PROGRESS,
      total_items: totalItems,
      started_at: database.fn.now(),
    })
    .returning('*')
  return plan
}

export async function getRecordByQr(orgId, planId, qrCode, db, options = {}) {
  const query = dbOrKnex(db)('stocktaking_records')
    .where({ org_id: orgId, plan_id: planId, qr_code: qrCode })
    .first()
  return options.forUpdate ? query.forUpdate() : query
}

export async function updateRecordCount(orgId, recordId, data, db) {
  const database = dbOrKnex(db)
  const [record] = await database('stocktaking_records')
    .where({ org_id: orgId, id: recordId })
    .update({ ...data, counted_at: database.fn.now() })
    .returning('*')
  return record
}

export async function incrementPlanProgress(orgId, planId, isMatched, db) {
  return dbOrKnex(db)('stocktaking_plans')
    .where({ org_id: orgId, id: planId, status: PLAN_STATUS.IN_PROGRESS })
    .increment({ counted_items: 1, diff_items: isMatched ? 0 : 1 })
}

export async function getPlanStats(orgId, planId, db) {
  const database = dbOrKnex(db)
  return database('stocktaking_records')
    .where({ org_id: orgId, plan_id: planId })
    .select(
      database.raw('COUNT(*)::int as total'),
      database.raw('COUNT(CASE WHEN actual_quantity IS NOT NULL THEN 1 END)::int as counted'),
      database.raw('COUNT(CASE WHEN is_matched = false THEN 1 END)::int as diff'),
    )
    .first()
}

export async function markPlanCompleted(orgId, planId, stats, db) {
  const database = dbOrKnex(db)
  const [plan] = await database('stocktaking_plans')
    .where({ org_id: orgId, id: planId, status: PLAN_STATUS.IN_PROGRESS })
    .update({
      status: PLAN_STATUS.COMPLETED,
      counted_items: Number(stats.counted || 0),
      diff_items: Number(stats.diff || 0),
      completed_at: database.fn.now(),
    })
    .returning('*')
  return plan
}

export async function deletePlanRecords(orgId, planId, db) {
  return dbOrKnex(db)('stocktaking_records').where({ org_id: orgId, plan_id: planId }).delete()
}

export async function markPlanCancelled(orgId, planId, db) {
  const [plan] = await dbOrKnex(db)('stocktaking_plans')
    .where({ org_id: orgId, id: planId })
    .update({
      status: PLAN_STATUS.CANCELLED,
      total_items: 0,
      counted_items: 0,
      diff_items: 0,
    })
    .returning('*')
  return plan
}

export async function getRecords(orgId, planId, filters = {}, db) {
  const query = dbOrKnex(db)('stocktaking_records').where({ org_id: orgId, plan_id: planId })
  if (filters.isMatched !== undefined) query.where('is_matched', filters.isMatched)
  return query.orderBy('counted_at', 'desc')
}

export async function getStatistics(orgId, planId, db) {
  const plan = await getPlan(orgId, planId, db)
  if (!plan) throw new Error('盘点计划不存在')
  const records = await getRecords(orgId, planId, {}, db)
  const total = records.length
  const counted = records.filter((record) => record.actual_quantity !== null).length
  const matched = records.filter((record) => record.is_matched === true).length
  const unmatched = records.filter((record) => record.is_matched === false).length
  const pending = total - counted
  return {
    plan,
    total,
    counted,
    matched,
    unmatched,
    pending,
    progress: total > 0 ? Math.round((counted / total) * 100) : 0,
  }
}

export default {
  getPlans,
  getPlan,
  createPlan,
  getUnitsForPlan,
  createRecords,
  markPlanStarted,
  getRecordByQr,
  updateRecordCount,
  incrementPlanProgress,
  getPlanStats,
  markPlanCompleted,
  deletePlanRecords,
  markPlanCancelled,
  getRecords,
  getStatistics,
}

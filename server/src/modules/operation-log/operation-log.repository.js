import knex from '../../db/knex.js'

function applyFilters(query, orgId, filters) {
  if (orgId) query.where('operation_log.org_id', orgId)
  if (filters.module) query.where('operation_log.module', filters.module)
  if (filters.businessType) query.where('operation_log.business_type', filters.businessType)
  if (filters.userId) query.where('operation_log.user_id', filters.userId)
  if (filters.status) query.where('operation_log.status', filters.status)
  if (filters.startDate) query.where('operation_log.created_at', '>=', filters.startDate)
  if (filters.endDate) query.where('operation_log.created_at', '<=', `${filters.endDate}T23:59:59Z`)
  if (filters.keyword) query.where('operation_log.title', 'ilike', `%${filters.keyword}%`)
  return query
}

export async function listOperationLogs(orgId, filters) {
  const query = applyFilters(
    knex('operation_log')
      .leftJoin('users', 'operation_log.user_id', 'users.id')
      .select('operation_log.*', 'users.username', 'users.email')
      .orderBy('operation_log.created_at', 'desc'),
    orgId,
    filters,
  )
  const countQuery = applyFilters(knex('operation_log'), orgId, filters)
  const [countResult, logs] = await Promise.all([
    countQuery.count('id as total').first(),
    query.offset((filters.page - 1) * filters.pageSize).limit(filters.pageSize),
  ])
  return {
    logs,
    total: Number(countResult?.total || 0),
    page: filters.page,
    pageSize: filters.pageSize,
  }
}

export async function listOperationLogModules(orgId) {
  const query = knex('operation_log').distinct('module').orderBy('module')
  if (orgId) query.where('org_id', orgId)
  return query.pluck('module')
}

export async function getOperationLogById(orgId, id) {
  const query = knex('operation_log')
    .leftJoin('users', 'operation_log.user_id', 'users.id')
    .select('operation_log.*', 'users.username')
    .where('operation_log.id', id)
  if (orgId) query.where('operation_log.org_id', orgId)
  return query.first()
}

import { pickFields, validationError } from '../../lib/http/validation.js'

function invalid(message, status = 400, code = 'OPERATION_LOG_INPUT_INVALID') {
  const error = validationError(message, undefined, code)
  error.status = status
  throw error
}

function text(value, label, max = 255) {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = String(value).trim()
  if (!parsed) return undefined
  if (parsed.length > max) invalid(`${label} 最长 ${max} 个字符`)
  return parsed
}

function positiveInteger(value, label, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) invalid(`${label} 必须是正整数`)
  return parsed
}

function date(value, label) {
  const parsed = text(value, label, 10)
  if (parsed === undefined) return undefined
  const candidate = new Date(`${parsed}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(parsed) ||
    Number.isNaN(candidate.getTime()) ||
    candidate.toISOString().slice(0, 10) !== parsed
  ) {
    invalid(`${label} 必须是有效的 YYYY-MM-DD 日期`)
  }
  return parsed
}

function compact(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))
}

export function resolveOperationLogOrgId(authContext = {}, source = {}) {
  const requestedOrgId = text(source.orgId, 'orgId', 128)
  const authOrgId = text(authContext.orgId, 'authContext.orgId', 128)
  if (authContext.role === 'super_admin') return requestedOrgId || null
  if (!authOrgId) invalid('当前账号未关联机构', 400, 'OPERATION_LOG_ORG_REQUIRED')
  if (requestedOrgId && requestedOrgId !== authOrgId) {
    invalid('无权查看其他机构日志', 403, 'OPERATION_LOG_SCOPE_FORBIDDEN')
  }
  return authOrgId
}

export function parseOperationLogFilters(value = {}) {
  const query = pickFields(
    value,
    [
      'page',
      'pageSize',
      'module',
      'businessType',
      'userId',
      'status',
      'startDate',
      'endDate',
      'keyword',
    ],
    { label: '查询参数' },
  )
  return compact({
    page: positiveInteger(query.page, 'page', 1),
    pageSize: Math.min(positiveInteger(query.pageSize, 'pageSize', 20), 200),
    module: text(query.module, 'module', 64),
    businessType: text(query.businessType, 'businessType', 32),
    userId: text(query.userId, 'userId', 128),
    status: text(query.status, 'status', 16),
    startDate: date(query.startDate, 'startDate'),
    endDate: date(query.endDate, 'endDate'),
    keyword: text(query.keyword, 'keyword', 200),
  })
}

export function parseOperationLogId(value) {
  return positiveInteger(value, 'id')
}

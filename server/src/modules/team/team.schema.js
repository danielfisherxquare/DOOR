import { pickFields, requireRecord, validationError } from '../../lib/http/validation.js'

const MEMBER_FIELDS = [
  'employeeCode',
  'employeeName',
  'position',
  'department',
  'memberType',
  'externalEngagementType',
  'idNumber',
  'contact',
]

function invalid(message, code = 'TEAM_INPUT_INVALID') {
  throw validationError(message, undefined, code)
}

function text(value, label, max = 200) {
  const parsed = String(value ?? '').trim()
  if (parsed.length > max) invalid(`${label} 最长 ${max} 个字符`)
  return parsed
}

function positiveInteger(value, label, fallback, max) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) {
    invalid(`${label} 必须是 1 到 ${max} 之间的整数`)
  }
  return parsed
}

export function resolveTeamOrgId(authContext, query = {}) {
  const orgId =
    authContext?.role === 'super_admin' && query.orgId
      ? text(query.orgId, 'orgId', 100)
      : authContext?.orgId || null
  if (!orgId) invalid('缺少机构上下文', 'TEAM_ORG_REQUIRED')
  return orgId
}

export function parseTeamListQuery(query = {}) {
  const data = requireRecord(query, '查询参数')
  return {
    page: positiveInteger(data.page, 'page', 1, 100000),
    limit: positiveInteger(data.limit, 'limit', 20, 100),
    keyword: text(data.keyword, 'keyword'),
    department: text(data.department, 'department'),
    memberType: text(data.memberType, 'memberType', 50),
    externalEngagementType: text(data.externalEngagementType, 'externalEngagementType', 50),
    status: text(data.status, 'status', 50),
    hasAccount: text(data.hasAccount, 'hasAccount', 20),
  }
}

function normalizeAliases(value) {
  const row = requireRecord(value, '团队成员')
  return {
    employeeCode: row.employeeCode ?? row.employee_code,
    employeeName: row.employeeName ?? row.employee_name,
    position: row.position,
    department: row.department,
    memberType: row.memberType ?? row.member_type,
    externalEngagementType: row.externalEngagementType ?? row.external_engagement_type,
    idNumber: row.idNumber ?? row.id_number,
    contact: row.contact,
  }
}

export function parseTeamMemberInput(value) {
  const aliases = normalizeAliases(value)
  const present = pickFields(aliases, MEMBER_FIELDS)
  const parsed = {}
  for (const field of MEMBER_FIELDS) {
    if (present[field] !== undefined) parsed[field] = text(present[field], field, 500)
  }
  return parsed
}

export function parseTeamImportRows(value) {
  const body = requireRecord(value)
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    invalid('rows 必须是非空数组', 'TEAM_IMPORT_ROWS_INVALID')
  }
  if (body.rows.length > 5000) invalid('rows 最多允许 5000 项', 'TEAM_IMPORT_ROWS_TOO_LARGE')
  return body.rows.map(parseTeamMemberInput)
}

export function parseTeamMemberId(value) {
  const memberId = text(value, 'teamMemberId', 100)
  if (!memberId) invalid('teamMemberId 不能为空', 'TEAM_MEMBER_ID_INVALID')
  return memberId
}

export function parseTeamKeyword(value) {
  return text(value, 'keyword')
}

import { pickFields, validationError } from '../../lib/http/validation.js'

const READ_SCOPES = new Set(['effective', 'user', 'org'])
const WRITE_SCOPES = new Set(['user', 'org'])

function invalid(message, status = 400, code = 'COLUMN_MAPPING_INPUT_INVALID') {
  const error = validationError(message, undefined, code)
  error.status = status
  throw error
}

function text(value, label, max) {
  if (value === undefined || value === null || value === '') invalid(`${label} 不能为空`)
  const parsed = String(value).trim()
  if (!parsed) invalid(`${label} 不能为空`)
  if (parsed.length > max) invalid(`${label} 最长 ${max} 个字符`)
  return parsed
}

function scope(value, allowed, fallback) {
  const parsed = value === undefined || value === null || value === '' ? fallback : String(value).trim()
  if (!allowed.has(parsed)) invalid(`不支持的列映射 scope: ${parsed}`)
  return parsed
}

export function parseColumnMappingReadScope(value) {
  return scope(value, READ_SCOPES, 'effective')
}

export function parseColumnMappingWriteScope(value, fallback = 'user') {
  return scope(value, WRITE_SCOPES, fallback)
}

export function assertColumnMappingScopeAllowed(authContext, requestedScope) {
  if (requestedScope === 'org' && !['org_admin', 'super_admin'].includes(authContext?.role)) {
    invalid('只有机构管理员可以管理机构列映射', 403, 'COLUMN_MAPPING_SCOPE_FORBIDDEN')
  }
}

export function parseColumnMappingPayload(value) {
  const body = pickFields(value, ['scope', 'mappings'])
  if (!Array.isArray(body.mappings) || body.mappings.length < 1 || body.mappings.length > 500) {
    invalid('mappings 必须是 1-500 项的数组')
  }
  const deduped = new Map()
  for (const raw of body.mappings) {
    const item = pickFields(raw, ['sourceColumn', 'targetFieldId'], { label: 'mapping' })
    const mapping = {
      sourceColumn: text(item.sourceColumn, 'sourceColumn', 255),
      targetFieldId: text(item.targetFieldId, 'targetFieldId', 255),
    }
    deduped.set(mapping.sourceColumn, mapping)
  }
  return {
    scope: parseColumnMappingWriteScope(body.scope),
    mappings: [...deduped.values()],
  }
}

export function parseColumnMappingDeletePayload(value) {
  const body = pickFields(value, ['scope', 'ids'])
  if (!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 500) {
    invalid('ids 必须是 1-500 项的数组')
  }
  const ids = [...new Set(body.ids.map((id) => {
    const parsed = Number(id)
    if (!Number.isInteger(parsed) || parsed <= 0) invalid('ids 必须全部是正整数')
    return parsed
  }))]
  return { scope: parseColumnMappingWriteScope(body.scope), ids }
}

export async function resolveColumnMappingOrgId(authContext = {}, source = {}, organizationExists) {
  const requestedOrgId = source.orgId ? String(source.orgId).trim() : null
  const authOrgId = authContext.orgId ? String(authContext.orgId).trim() : null
  if (authContext.role !== 'super_admin') {
    if (!authOrgId) invalid('当前账户缺少机构上下文', 400, 'COLUMN_MAPPING_ORG_REQUIRED')
    if (requestedOrgId && requestedOrgId !== authOrgId) {
      invalid('无权管理其他机构列映射', 403, 'COLUMN_MAPPING_ORG_FORBIDDEN')
    }
    return authOrgId
  }
  if (!requestedOrgId) invalid('超级管理员需要指定 orgId 参数', 400, 'COLUMN_MAPPING_ORG_REQUIRED')
  if (!(await organizationExists(requestedOrgId))) {
    invalid('目标机构不存在', 404, 'COLUMN_MAPPING_ORG_NOT_FOUND')
  }
  return requestedOrgId
}

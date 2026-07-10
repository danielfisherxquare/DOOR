import { requireRecord, validationError } from '../../lib/http/validation.js'

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ORG_ID_PATTERN = SESSION_ID_PATTERN
const CATEGORIES = new Set([
  'Mass',
  'Elite',
  'Permanent',
  'Pacer',
  'Medic',
  'Sponsor',
  'Performance',
])

function invalid(code, message, details) {
  throw validationError(message, details, code)
}

function positiveInteger(value, code, label, { optional = false, max } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined
    invalid(code, `${label} 不能为空`)
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0 || (max && parsed > max)) {
    invalid(code, `${label} 必须是有效的正整数${max ? `且不大于 ${max}` : ''}`)
  }
  return parsed
}

function nonNegativeInteger(value, code, label, { defaultValue, max } = {}) {
  if (value === undefined || value === null || value === '') return defaultValue
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || (max !== undefined && parsed > max)) {
    invalid(code, `${label} 必须是非负整数${max !== undefined ? `且不大于 ${max}` : ''}`)
  }
  return parsed
}

export function parseSessionId(value) {
  const sessionId = typeof value === 'string' ? value.trim() : ''
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    invalid('IMPORT_SESSION_ID_INVALID', 'sessionId 必须是有效的 UUID')
  }
  return sessionId
}

export function parseCreateImportSession(value = {}) {
  const input = requireRecord(value)
  const orgId = typeof input.orgId === 'string' ? input.orgId.trim() : undefined
  if (orgId && !ORG_ID_PATTERN.test(orgId)) {
    invalid('IMPORT_ORG_ID_INVALID', 'orgId 必须是有效的 UUID')
  }
  return {
    orgId,
    raceId: positiveInteger(input.raceId, 'IMPORT_RACE_ID_INVALID', 'raceId', { optional: true }),
  }
}

export function parseImportSummary(value) {
  const summary = requireRecord(value, 'summary')
  const rawPreview = summary.rawPreview ?? []
  const stats = summary.stats ?? {}
  if (!Array.isArray(rawPreview) || rawPreview.length > 100) {
    invalid('IMPORT_SUMMARY_INVALID', 'rawPreview 必须是最多 100 行的数组')
  }
  requireRecord(stats, 'stats')
  return {
    rawCount: nonNegativeInteger(summary.rawCount, 'IMPORT_SUMMARY_INVALID', 'rawCount', {
      defaultValue: 0,
    }),
    rawPreview: rawPreview.map((row, index) => ({ ...requireRecord(row, `rawPreview[${index}]`) })),
    stats: { ...stats },
  }
}

export function parseImportChunk(value) {
  if (!Array.isArray(value)) invalid('IMPORT_CHUNK_INVALID', 'rows 必须是数组')
  if (value.length === 0) invalid('IMPORT_CHUNK_EMPTY', 'rows 不能为空')
  if (value.length > 2000) invalid('IMPORT_CHUNK_TOO_LARGE', '单个 chunk 最多允许 2000 行')
  return value.map((row, index) => ({ ...requireRecord(row, `rows[${index}]`) }))
}

export function parseChunkPage(value = {}) {
  const query = requireRecord(value)
  return {
    offset: nonNegativeInteger(query.offset, 'IMPORT_CHUNK_PAGE_INVALID', 'offset', {
      defaultValue: 0,
    }),
    limit:
      positiveInteger(query.limit, 'IMPORT_CHUNK_PAGE_INVALID', 'limit', {
        optional: true,
        max: 5000,
      }) || 100,
  }
}

export function parseCommitImportSession(value) {
  const body = requireRecord(value)
  const rawCategory = body.category === 'Emergency' ? 'Medic' : body.category || 'Mass'
  const category = typeof rawCategory === 'string' ? rawCategory.trim() : ''
  if (!CATEGORIES.has(category)) {
    invalid('IMPORT_CATEGORY_INVALID', 'category 不在允许范围内')
  }
  return {
    raceId: positiveInteger(body.raceId, 'IMPORT_RACE_ID_INVALID', 'raceId'),
    category,
  }
}

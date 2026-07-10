import {
  RECORD_EXACT_FILTER_FIELDS,
  RECORD_FILTER_FIELDS,
  RECORD_PRESENCE_ONLY_FILTER_FIELDS,
  RECORD_SORT_FIELDS,
} from '@arcspro/contracts'
import { pickFields, requireRecord, validationError } from '../../lib/http/validation.js'

const FILTER_OPERATORS = new Set([
  'contains',
  'equals',
  'startsWith',
  'endsWith',
  'notEquals',
  'notEmpty',
  'empty',
  'in',
])

const MUTABLE_FIELDS = [
  'name',
  'namePinyin',
  'phone',
  'country',
  'idType',
  'idNumber',
  'gender',
  'age',
  'birthday',
  'event',
  'source',
  'clothingSize',
  'province',
  'city',
  'district',
  'address',
  'email',
  'emergencyName',
  'emergencyPhone',
  'bloodType',
  'orderGroupId',
  'paymentStatus',
  'mark',
  'lotteryStatus',
  'personalBestFull',
  'personalBestHalf',
  'lotteryZone',
  'bagWindowNo',
  'bagNo',
  'expoWindowNo',
  'bibNumber',
  'bibColor',
  '_source',
  'runnerCategory',
  'auditStatus',
  'rejectReason',
  'isLocked',
  'regionType',
  'duplicateCount',
  'duplicateSources',
]

const FILTER_FIELDS = new Set(RECORD_FILTER_FIELDS)
const SORT_FIELDS = new Set(RECORD_SORT_FIELDS)

const ENCRYPTED_FILTER_OPERATORS = new Map([
  ...RECORD_EXACT_FILTER_FIELDS.map((field) => [field, new Set(['equals', 'notEmpty', 'empty'])]),
  ...RECORD_PRESENCE_ONLY_FILTER_FIELDS.map((field) => [field, new Set(['notEmpty', 'empty'])]),
])

function invalid(code, message, details) {
  throw validationError(message, details, code)
}

function optionalPositiveInteger(value, { code, label, max } = {}) {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0 || (max && parsed > max)) {
    invalid(code, `${label}必须是正整数${max ? `且不大于 ${max}` : ''}`)
  }
  return parsed
}

function nonNegativeInteger(value, { code, label, defaultValue, max } = {}) {
  if (value === undefined || value === null || value === '') return defaultValue
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || (max !== undefined && parsed > max)) {
    invalid(code, `${label}必须是非负整数${max !== undefined ? `且不大于 ${max}` : ''}`)
  }
  return parsed
}

function parseFilters(value, code) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) invalid(code, 'filters 必须是数组')
  if (value.length > 100) invalid(code, 'filters 最多允许 100 项')

  return value.map((item, index) => {
    const filter = requireRecord(item, `filters[${index}]`)
    const field = typeof filter.field === 'string' ? filter.field.trim() : ''
    const operator = typeof filter.operator === 'string' ? filter.operator : ''
    if (!field || !FILTER_FIELDS.has(field) || !FILTER_OPERATORS.has(operator)) {
      invalid(code, `filters[${index}] 的 field 或 operator 无效`)
    }
    const encryptedOperators = ENCRYPTED_FILTER_OPERATORS.get(field)
    if (encryptedOperators && !encryptedOperators.has(operator)) {
      invalid(code, `filters[${index}] 不支持对加密字段执行 ${operator}`)
    }
    const hasValue = Object.prototype.hasOwnProperty.call(filter, 'value')
    if (operator === 'in') {
      if (!Array.isArray(filter.value) || filter.value.length === 0 || filter.value.length > 1000) {
        invalid(code, `filters[${index}].value 必须是 1 到 1000 项的数组`)
      }
    } else if (!['notEmpty', 'empty'].includes(operator)) {
      if (!hasValue || filter.value === null || typeof filter.value === 'object') {
        invalid(code, `filters[${index}].value 不能为空且必须是标量`)
      }
    }
    return hasValue ? { field, operator, value: filter.value } : { field, operator }
  })
}

function parseSort(value, code) {
  if (value === undefined || value === null) return undefined
  const sort = requireRecord(value, 'sort')
  const field = typeof sort.field === 'string' ? sort.field.trim() : ''
  if (!field || !SORT_FIELDS.has(field)) invalid(code, 'sort.field 不在允许范围内')
  if (sort.direction !== undefined && !['asc', 'desc'].includes(sort.direction)) {
    invalid(code, 'sort.direction 仅支持 asc 或 desc')
  }
  return { field, direction: sort.direction === 'asc' ? 'asc' : 'desc' }
}

export function parseRecordId(value) {
  return (
    optionalPositiveInteger(value, {
      code: 'RECORD_ID_INVALID',
      label: 'recordId',
    }) || invalid('RECORD_ID_INVALID', 'recordId 不能为空')
  )
}

export function parseRaceId(value) {
  return (
    optionalPositiveInteger(value, {
      code: 'RACE_ID_INVALID',
      label: 'raceId',
    }) || invalid('RACE_ID_INVALID', 'raceId 不能为空')
  )
}

export function parseRecordQuery(value) {
  const body = requireRecord(value)
  const code = 'RECORD_QUERY_INVALID'
  const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : ''
  if (keyword.length > 200) invalid(code, 'keyword 最多允许 200 个字符')
  return {
    raceId: optionalPositiveInteger(body.raceId, { code, label: 'raceId' }),
    keyword,
    filters: parseFilters(body.filters, code),
    offset: nonNegativeInteger(body.offset, {
      code,
      label: 'offset',
      defaultValue: 0,
    }),
    limit:
      optionalPositiveInteger(body.limit, {
        code,
        label: 'limit',
        max: 1000,
      }) || 50,
    sort: parseSort(body.sort, code),
  }
}

export function parseRecordAnalysis(value) {
  const query = parseRecordQuery(value)
  return {
    raceId: query.raceId,
    keyword: query.keyword,
    filters: query.filters,
  }
}

export function parseUniqueValues(value) {
  const body = requireRecord(value)
  const field = typeof body.field === 'string' ? body.field.trim() : ''
  if (!field) invalid('RECORD_UNIQUE_FIELD_REQUIRED', '缺少 field 参数')
  return {
    field,
    raceId: optionalPositiveInteger(body.raceId, {
      code: 'RECORD_UNIQUE_QUERY_INVALID',
      label: 'raceId',
    }),
    limit:
      optionalPositiveInteger(body.limit, {
        code: 'RECORD_UNIQUE_QUERY_INVALID',
        label: 'limit',
        max: 1000,
      }) || 500,
  }
}

export function parseRecordUpdate(value) {
  const data = pickFields(value, MUTABLE_FIELDS)
  if (Object.keys(data).length === 0) {
    invalid('RECORD_UPDATE_EMPTY', '没有可更新的记录字段')
  }
  return data
}

export function parseBulkRecordUpdate(value) {
  const body = requireRecord(value)
  if (!Array.isArray(body.updates) || body.updates.length === 0) {
    invalid('RECORD_BULK_UPDATE_INVALID', 'updates must be a non-empty array')
  }
  if (body.updates.length > 1000) {
    invalid('RECORD_BULK_UPDATE_INVALID', 'updates 最多允许 1000 项')
  }

  return {
    updates: body.updates.map((item, index) => {
      const update = requireRecord(item, `updates[${index}]`)
      return {
        id: parseRecordId(update.id),
        data: parseRecordUpdate(update.data),
      }
    }),
  }
}

export function parseWinnerStatuses(value) {
  if (value === undefined || value === null || value === '') return []
  if (typeof value !== 'string') invalid('RECORD_STATUSES_INVALID', 'statuses 必须是字符串')
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 50)
}

export function parseVerificationResults(value) {
  if (!Array.isArray(value)) {
    invalid('RECORD_VERIFICATION_INVALID', 'Body must be an array of verification results')
  }
  if (value.length > 10000) {
    invalid('RECORD_VERIFICATION_INVALID', 'verification results 最多允许 10000 项')
  }

  return value.map((item, index) =>
    pickFields(requireRecord(item, `results[${index}]`), [
      'idNumber',
      'netTime',
      'raceName',
      'raceDate',
      'event',
    ]),
  )
}

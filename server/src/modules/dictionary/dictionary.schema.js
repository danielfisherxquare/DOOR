import { pickFields, validationError } from '../../lib/http/validation.js'

function invalid(message) {
  throw validationError(message, undefined, 'DICTIONARY_INPUT_INVALID')
}

function text(value, label, { max, optional = false, nullable = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (nullable && value !== undefined) return null
    if (optional) return undefined
    invalid(`${label} 不能为空`)
  }
  const parsed = String(value).trim()
  if (!parsed) {
    if (nullable) return null
    invalid(`${label} 不能为空`)
  }
  if (parsed.length > max) invalid(`${label} 最长 ${max} 个字符`)
  return parsed
}

function flag(value, label, allowed, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = String(value)
  if (!allowed.has(parsed)) invalid(`${label} 无效`)
  return parsed
}

function sortOrder(value, { optional = false } = {}) {
  if ((value === undefined || value === null || value === '') && optional) return undefined
  if (value === undefined || value === null || value === '') return 0
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1_000_000) {
    invalid('sortOrder 必须是 0-1000000 之间的整数')
  }
  return parsed
}

function compact(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))
}

export function parseDictionaryType(value) {
  const parsed = text(value, 'dictType', { max: 100 })
  if (!/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(parsed)) invalid('dictType 格式无效')
  return parsed
}

export function parseDictionaryTypePayload(value, { partial = false } = {}) {
  const data = pickFields(value, ['dictType', 'dictName', 'status', 'remark'])
  return compact({
    dictType: partial
      ? undefined
      : parseDictionaryType(data.dictType),
    dictName: text(data.dictName, 'dictName', { max: 200, optional: partial }),
    status: flag(data.status, 'status', new Set(['0', '1']), partial ? undefined : '0'),
    remark: text(data.remark, 'remark', { max: 500, optional: true, nullable: true }),
  })
}

export function parseDictionaryDataPayload(value, { partial = false } = {}) {
  const data = pickFields(value, [
    'dictType',
    'dictLabel',
    'dictValue',
    'sortOrder',
    'cssClass',
    'listClass',
    'isDefault',
    'status',
    'remark',
  ])
  return compact({
    dictType: partial ? undefined : parseDictionaryType(data.dictType),
    dictLabel: text(data.dictLabel, 'dictLabel', { max: 200, optional: partial }),
    dictValue: text(data.dictValue, 'dictValue', { max: 200, optional: partial }),
    sortOrder: sortOrder(data.sortOrder, { optional: partial }),
    cssClass: text(data.cssClass, 'cssClass', { max: 100, optional: true, nullable: true }),
    listClass: text(data.listClass, 'listClass', { max: 100, optional: true, nullable: true }),
    isDefault: flag(data.isDefault, 'isDefault', new Set(['Y', 'N']), partial ? undefined : 'N'),
    status: flag(data.status, 'status', new Set(['0', '1']), partial ? undefined : '0'),
    remark: text(data.remark, 'remark', { max: 500, optional: true, nullable: true }),
  })
}

export function parseDictionaryId(value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) invalid('id 必须是正整数')
  return parsed
}

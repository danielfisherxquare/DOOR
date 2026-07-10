import { pickFields, requireRecord, validationError } from '../../lib/http/validation.js'

const LIST_TYPES = new Set(['whitelist', 'blacklist'])
const MATCH_TYPES = new Set(['exact', 'fuzzy'])
const LOTTERY_MODES = new Set(['inherit', 'direct', 'lottery'])

function invalid(code, message) {
  throw validationError(message, undefined, code)
}

function positiveInteger(value, code, label, { optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined
    invalid(code, `${label} 不能为空`)
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) invalid(code, `${label} 必须是正整数`)
  return parsed
}

function nonNegativeInteger(value, code, label, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) invalid(code, `${label} 必须是非负整数`)
  return parsed
}

function ratio(value, code, label, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    invalid(code, `${label} 必须在 0 到 1 之间`)
  }
  return parsed
}

function text(value, { fallback = '', max = 200, required = false, label, code }) {
  if (value === undefined || value === null) {
    if (required) invalid(code, `${label} 不能为空`)
    return fallback
  }
  const parsed = String(value).trim()
  if ((required && !parsed) || parsed.length > max) invalid(code, `${label} 无效`)
  return parsed
}

function listType(value, { optional = false } = {}) {
  if ((value === undefined || value === null || value === '') && optional) return undefined
  if (!LIST_TYPES.has(value))
    invalid('LOTTERY_LIST_TYPE_INVALID', 'listType 仅支持 whitelist 或 blacklist')
  return value
}

export function parseLotteryRaceId(value) {
  return positiveInteger(value, 'LOTTERY_RACE_ID_INVALID', 'raceId')
}

export function parseLotteryResourceId(value) {
  return positiveInteger(value, 'LOTTERY_RESOURCE_ID_INVALID', 'id')
}

export function parseLotteryRaceCapacity(raceIdValue, value) {
  const data = requireRecord(value)
  const code = 'LOTTERY_CAPACITY_INVALID'
  const lotteryModeOverride = data.lotteryModeOverride ?? 'inherit'
  if (!LOTTERY_MODES.has(lotteryModeOverride)) {
    invalid(code, 'lotteryModeOverride 不在允许范围内')
  }
  return {
    raceId: parseLotteryRaceId(raceIdValue),
    event: text(data.event, { required: true, max: 100, label: 'event', code }),
    targetCount: nonNegativeInteger(data.targetCount, code, 'targetCount'),
    drawRatio: ratio(data.drawRatio, code, 'drawRatio', 0.85),
    reservedRatio: ratio(data.reservedRatio, code, 'reservedRatio', 0.15),
    lotteryModeOverride,
  }
}

function parseListEntry(value, index) {
  const entry = requireRecord(value, `entries[${index}]`)
  const code = 'LOTTERY_LIST_INVALID'
  const parsed = {
    raceId: parseLotteryRaceId(entry.raceId),
    listType: listType(entry.listType),
    name: text(entry.name, { max: 200, label: 'name', code }),
    idNumber: text(entry.idNumber, {
      required: true,
      max: 100,
      label: 'idNumber',
      code,
    }),
  }
  if (entry.phone !== undefined) {
    parsed.phone = text(entry.phone, { max: 50, label: 'phone', code })
  }
  if (entry.matchedRecordId !== undefined && entry.matchedRecordId !== null) {
    parsed.matchedRecordId = positiveInteger(entry.matchedRecordId, code, 'matchedRecordId', {
      optional: true,
    })
  }
  if (entry.matchType !== undefined && entry.matchType !== null && entry.matchType !== '') {
    if (!MATCH_TYPES.has(entry.matchType)) invalid(code, 'matchType 仅支持 exact 或 fuzzy')
    parsed.matchType = entry.matchType
  }
  return parsed
}

export function parseLotteryListEntries(value) {
  const body = requireRecord(value)
  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    invalid('LOTTERY_LIST_INVALID', 'entries must be a non-empty array')
  }
  if (body.entries.length > 10000) invalid('LOTTERY_LIST_TOO_LARGE', 'entries 最多允许 10000 项')
  const entries = body.entries.map(parseListEntry)
  const raceIds = new Set(entries.map((entry) => entry.raceId))
  if (raceIds.size !== 1) invalid('LOTTERY_LIST_CROSS_RACE', '批量请求必须且只能包含一个 raceId')
  return { raceId: entries[0].raceId, entries }
}

export function parseLotteryListType(value, { optional = false } = {}) {
  return listType(value, { optional })
}

export function parseLotteryListUpdate(value) {
  const data = pickFields(value, ['name', 'idNumber', 'phone', 'matchedRecordId', 'matchType'])
  if (Object.keys(data).length === 0) invalid('LOTTERY_LIST_UPDATE_EMPTY', '没有可更新的名单字段')
  const parsed = {}
  if (data.name !== undefined) {
    parsed.name = text(data.name, { max: 200, label: 'name', code: 'LOTTERY_LIST_INVALID' })
  }
  if (data.idNumber !== undefined) {
    parsed.idNumber = text(data.idNumber, {
      required: true,
      max: 100,
      label: 'idNumber',
      code: 'LOTTERY_LIST_INVALID',
    })
  }
  if (data.phone !== undefined) {
    parsed.phone = text(data.phone, { max: 50, label: 'phone', code: 'LOTTERY_LIST_INVALID' })
  }
  if (data.matchedRecordId !== undefined) {
    parsed.matchedRecordId =
      data.matchedRecordId === null
        ? null
        : positiveInteger(data.matchedRecordId, 'LOTTERY_LIST_INVALID', 'matchedRecordId')
  }
  if (data.matchType !== undefined) {
    if (data.matchType !== null && data.matchType !== '' && !MATCH_TYPES.has(data.matchType)) {
      invalid('LOTTERY_LIST_INVALID', 'matchType 仅支持 exact 或 fuzzy')
    }
    parsed.matchType = data.matchType || null
  }
  return parsed
}

export function parseLotteryListIds(value) {
  const body = requireRecord(value)
  if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > 10000) {
    invalid('LOTTERY_LIST_IDS_INVALID', 'ids 必须是 1 到 10000 项的数组')
  }
  return [...new Set(body.ids.map((id) => parseLotteryResourceId(id)))]
}

export function parseLotteryRule(value) {
  const data = requireRecord(value)
  const code = 'LOTTERY_RULE_INVALID'
  return {
    raceId: parseLotteryRaceId(data.raceId),
    targetGroup: text(data.targetGroup, { required: true, max: 100, label: 'targetGroup', code }),
    targetCount: nonNegativeInteger(data.targetCount, code, 'targetCount'),
    drawRatio: ratio(data.drawRatio, code, 'drawRatio', 0.85),
    reservedRatio: ratio(data.reservedRatio, code, 'reservedRatio', 0.15),
    genderRatio: text(data.genderRatio, { max: 2000, label: 'genderRatio', code }),
    regionRatio: text(data.regionRatio, { max: 2000, label: 'regionRatio', code }),
  }
}

export function parseLotteryWeight(value) {
  const data = requireRecord(value)
  const code = 'LOTTERY_WEIGHT_INVALID'
  const weightConfig = data.weightConfig ?? {}
  if (!weightConfig || typeof weightConfig !== 'object' || Array.isArray(weightConfig)) {
    invalid(code, 'weightConfig 必须是对象')
  }
  return {
    raceId: parseLotteryRaceId(data.raceId),
    targetGroup: text(data.targetGroup, { fallback: 'ALL', max: 50, label: 'targetGroup', code }),
    weightType: text(data.weightType, {
      fallback: 'gender',
      max: 50,
      label: 'weightType',
      code,
    }),
    enabled: data.enabled === true || data.enabled === 1,
    weightConfig: { ...weightConfig },
    priority: nonNegativeInteger(data.priority, code, 'priority'),
  }
}

import { pickFields, validationError } from '../../lib/http/validation.js'

const MAX_BULK_ITEMS = 500

function invalid(message) {
  throw validationError(message, undefined, 'CLOTHING_INPUT_INVALID')
}

function text(value, label, max = 100) {
  if (value === undefined || value === null || value === '') invalid(`${label} 不能为空`)
  const parsed = String(value).trim()
  if (!parsed) invalid(`${label} 不能为空`)
  if (parsed.length > max) invalid(`${label} 最长 ${max} 个字符`)
  return parsed
}

function integer(value, label, { min = 0, max = 1_000_000 } = {}) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) invalid(`${label} 数值无效`)
  return parsed
}

function gender(value) {
  const parsed = text(value, 'gender', 1).toUpperCase()
  if (!['M', 'F', 'U'].includes(parsed)) invalid('gender 必须是 M、F 或 U')
  return parsed
}

export function parseClothingRaceId(value) {
  return integer(value, 'raceId', { min: 1, max: Number.MAX_SAFE_INTEGER })
}

export function parseClothingLimitPayload(value) {
  const data = pickFields(value, [
    'raceId',
    'event',
    'gender',
    'size',
    'totalInventory',
    'usedCount',
  ])
  return {
    raceId: parseClothingRaceId(data.raceId),
    event: text(data.event, 'event'),
    gender: gender(data.gender),
    size: text(data.size, 'size', 50),
    totalInventory: data.totalInventory === undefined
      ? 0
      : integer(data.totalInventory, 'totalInventory'),
    usedCount: data.usedCount === undefined ? 0 : integer(data.usedCount, 'usedCount'),
  }
}

export function parseClothingBulkPayload(value) {
  const body = pickFields(value, ['items'])
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > MAX_BULK_ITEMS) {
    invalid(`items 必须是 1-${MAX_BULK_ITEMS} 项的数组`)
  }
  const items = body.items.map(parseClothingLimitPayload)
  const raceIds = new Set(items.map((item) => item.raceId))
  if (raceIds.size !== 1) invalid('批量请求必须且只能包含一个 raceId')
  return { raceId: items[0].raceId, items }
}

export function parseClothingIncrementPayload(value) {
  const data = pickFields(value, ['raceId', 'event', 'gender', 'size', 'delta'])
  const delta = data.delta === undefined ? 1 : integer(data.delta, 'delta', { min: -1_000_000 })
  if (delta === 0) invalid('delta 不能为 0')
  return {
    raceId: parseClothingRaceId(data.raceId),
    event: text(data.event, 'event'),
    gender: gender(data.gender),
    size: text(data.size, 'size', 50),
    delta,
  }
}

import { pickFields, requireRecord, validationError } from '../../lib/http/validation.js'

const APPAREL_SCOPES = new Set(['unisex_size', 'gender_size', 'event_gender_size'])
const REGION_DIMENSIONS = new Set(['province', 'city', 'district'])

function invalid(message) {
  throw validationError(message, undefined, 'LOTTERY_V2_CONFIG_INVALID')
}

function ratio(value, label) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    invalid(`${label} 必须在 0 到 1 之间`)
  }
  return parsed
}

function parseRatioMap(value, label, { requiredKeys = [] } = {}) {
  const record = requireRecord(value, label)
  const entries = Object.entries(record)
  if (entries.length > 500) invalid(`${label} 最多允许 500 项`)

  const parsed = {}
  for (const [rawKey, rawValue] of entries) {
    const key = String(rawKey).trim()
    if (!key || key.length > 100) invalid(`${label} 包含无效键名`)
    parsed[key] = ratio(rawValue, `${label}.${key}`)
  }
  for (const key of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(parsed, key)) invalid(`${label}.${key} 不能为空`)
  }
  return parsed
}

export function parseLotteryV2RaceId(value) {
  const raceId = Number(value)
  if (!Number.isInteger(raceId) || raceId <= 0) {
    throw validationError('raceId 必须是正整数', undefined, 'LOTTERY_V2_RACE_ID_INVALID')
  }
  return raceId
}

export function parseLotteryV2Config(value) {
  const data = pickFields(value, [
    'apparelScopeMode',
    'sizeMatchPolicy',
    'performanceRatio',
    'genderRatio',
    'regionDimension',
    'regionRatios',
    'seed',
    'fallbackStrategy',
  ])
  const parsed = {}

  if (data.apparelScopeMode !== undefined) {
    if (!APPAREL_SCOPES.has(data.apparelScopeMode)) invalid('apparelScopeMode 不在允许范围内')
    parsed.apparelScopeMode = data.apparelScopeMode
  }
  if (data.sizeMatchPolicy !== undefined) {
    if (data.sizeMatchPolicy !== 'exact') invalid('sizeMatchPolicy 仅支持 exact')
    parsed.sizeMatchPolicy = 'exact'
  }
  if (data.performanceRatio !== undefined) {
    parsed.performanceRatio = ratio(data.performanceRatio, 'performanceRatio')
  }
  if (data.genderRatio !== undefined) {
    const genderRatio = parseRatioMap(data.genderRatio, 'genderRatio', {
      requiredKeys: ['M', 'F'],
    })
    if (Object.keys(genderRatio).some((key) => key !== 'M' && key !== 'F')) {
      invalid('genderRatio 仅支持 M 和 F')
    }
    if (genderRatio.M + genderRatio.F <= 0) invalid('genderRatio 至少需要一个正比例')
    parsed.genderRatio = genderRatio
  }
  if (data.regionDimension !== undefined) {
    if (!REGION_DIMENSIONS.has(data.regionDimension)) {
      invalid('regionDimension 仅支持 province、city 或 district')
    }
    parsed.regionDimension = data.regionDimension
  }
  if (data.regionRatios !== undefined) {
    parsed.regionRatios = parseRatioMap(data.regionRatios, 'regionRatios')
  }
  if (data.seed !== undefined) {
    if (typeof data.seed !== 'string') invalid('seed 必须是字符串')
    const seed = data.seed.trim()
    if (seed.length > 200) invalid('seed 最长 200 个字符')
    parsed.seed = seed
  }
  if (data.fallbackStrategy !== undefined) {
    if (data.fallbackStrategy !== 'same_pool') invalid('fallbackStrategy 仅支持 same_pool')
    parsed.fallbackStrategy = 'same_pool'
  }

  return parsed
}

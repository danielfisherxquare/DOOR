import { pickFields, validationError } from '../../lib/http/validation.js'

function invalid(message) {
  throw validationError(message, undefined, 'PIPELINE_CONFIG_INPUT_INVALID')
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

function number(value, label, { optional = false, min = 0, max = Infinity, integer = false } = {}) {
  if ((value === undefined || value === null || value === '') && optional) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) {
    invalid(`${label} 数值无效`)
  }
  return parsed
}

function nullableInteger(value, label) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  return number(value, label, { min: 0, integer: true })
}

function compact(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))
}

export function parsePipelineId(value, label = 'id') {
  return number(value, label, { min: 1, integer: true })
}

function parseTime(value, label) {
  const parsed = text(value, label, { max: 12, optional: true })
  if (parsed === undefined) return undefined
  const match = /^(\d{1,3}):([0-5]\d):([0-5]\d)$/.exec(parsed)
  if (!match) invalid(`${label} 必须是 HH:MM:SS`)
  return { value: parsed, seconds: Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) }
}

export function parseStartZonePayload(value) {
  const data = pickFields(value, [
    'id',
    'raceId',
    'zoneName',
    'width',
    'length',
    'density',
    'calculatedCapacity',
    'color',
    'sortOrder',
    'gapDistance',
    'event',
    'capacityRatio',
    'scoreUpperSeconds',
  ])
  const color = text(data.color, 'color', { max: 20, optional: true })
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) invalid('color 必须是 6 位十六进制颜色')
  return compact({
    id: data.id === undefined ? undefined : parsePipelineId(data.id),
    raceId: parsePipelineId(data.raceId, 'raceId'),
    zoneName: text(data.zoneName, 'zoneName', { max: 100 }),
    width: number(data.width, 'width', { optional: true, min: 0 }),
    length: number(data.length, 'length', { optional: true, min: 0 }),
    density: number(data.density, 'density', { optional: true, min: 0 }),
    calculatedCapacity: number(data.calculatedCapacity, 'calculatedCapacity', {
      optional: true,
      min: 0,
      integer: true,
    }),
    color,
    sortOrder: number(data.sortOrder, 'sortOrder', { optional: true, min: 0, integer: true }),
    gapDistance: number(data.gapDistance, 'gapDistance', { optional: true, min: 0 }),
    event: text(data.event, 'event', { max: 100, optional: true }),
    capacityRatio: number(data.capacityRatio, 'capacityRatio', { optional: true, min: 0, max: 1 }),
    scoreUpperSeconds: nullableInteger(data.scoreUpperSeconds, 'scoreUpperSeconds'),
  })
}

export function parsePerformanceRulePayload(value) {
  const data = pickFields(value, [
    'id',
    'raceId',
    'event',
    'minTime',
    'maxTime',
    'priorityRatio',
  ])
  const minTime = parseTime(data.minTime, 'minTime')
  const maxTime = parseTime(data.maxTime, 'maxTime')
  if (minTime && maxTime && minTime.seconds > maxTime.seconds) {
    invalid('minTime 不能晚于 maxTime')
  }
  return compact({
    id: data.id === undefined ? undefined : parsePipelineId(data.id),
    raceId: parsePipelineId(data.raceId, 'raceId'),
    event: text(data.event, 'event', { max: 100 }),
    minTime: minTime?.value,
    maxTime: maxTime?.value,
    priorityRatio: number(data.priorityRatio, 'priorityRatio', { optional: true, min: 0, max: 1 }),
  })
}

import { pickFields, requireRecord, validationError } from '../../lib/http/validation.js'

const MAX_JSON_BYTES = 2_000_000
const MAX_BATCH_LOCATIONS = 1000

const PAYLOAD_FIELDS = {
  warehouse: [
    'code',
    'name',
    'address',
    'contact',
    'isDefault',
    'status',
    'dimensionsMm',
    'origin',
    'floorCount',
    'layoutJson',
  ],
  zone: ['warehouseId', 'code', 'name', 'zoneType', 'boundsMm', 'metadata', 'status'],
  rackTemplate: [
    'code',
    'name',
    'shapeType',
    'outerDimensionsMm',
    'levels',
    'bays',
    'maxLoadKg',
    'slotRule',
    'allowedShapeTypes',
    'status',
  ],
  rackInstance: [
    'warehouseId',
    'rackTemplateId',
    'code',
    'name',
    'positionMm',
    'rotationDeg',
    'scale',
    'status',
    'metadata',
  ],
  location: [
    'warehouseId',
    'code',
    'zone',
    'aisle',
    'shelf',
    'position',
    'qrCode',
    'capacity',
    'itemTypes',
    'status',
    'transform',
    'dimensionsMm',
    'maxWeightKg',
    'occupancyMode',
    'rackInstanceCode',
    'slotPath',
  ],
  itemShape: [
    'code',
    'name',
    'shapeType',
    'dimensionsMm',
    'geometryProfile',
    'defaultWeightKg',
    'stackable',
    'orientationRules',
    'status',
  ],
  object: [
    'legacyUnitId',
    'batchId',
    'shapeTemplateId',
    'objectCode',
    'objectLevel',
    'shapeType',
    'dimensionsMm',
    'weightKg',
    'stackable',
    'orientationRules',
    'parentObjectId',
    'currentWarehouseId',
    'currentLocationId',
    'status',
  ],
  binding: ['objectQr', 'locationQr', 'bindingMode', 'reason'],
  qrPreview: ['warehouseId', 'codes'],
}

const FILTER_FIELDS = {
  zones: ['warehouseId'],
  rackInstances: ['warehouseId'],
  locations: ['warehouseId', 'rackInstanceCode', 'status'],
  objects: ['warehouseId', 'locationId', 'batchId', 'objectLevel', 'status'],
  events: ['warehouseId', 'objectId', 'limit'],
}

function invalid(message) {
  throw validationError(message, undefined, 'INVENTORY_TWIN_INPUT_INVALID')
}

function assertJsonSize(value, label = '请求体') {
  let encoded
  try {
    encoded = JSON.stringify(value)
  } catch {
    invalid(`${label} 必须是可序列化的 JSON`)
  }
  if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > MAX_JSON_BYTES) {
    invalid(`${label} 不能超过 ${MAX_JSON_BYTES} 字节`)
  }
}

export function parseTwinPayload(kind, value) {
  if (kind === 'layout') {
    const body = requireRecord(value)
    const layoutJson = Object.prototype.hasOwnProperty.call(body, 'layoutJson')
      ? body.layoutJson
      : body
    assertJsonSize(layoutJson, 'layoutJson')
    return { layoutJson: structuredClone(layoutJson) }
  }

  if (kind === 'batchLocations') {
    const body = pickFields(value, [...PAYLOAD_FIELDS.location, 'slots'])
    if (!Array.isArray(body.slots) || body.slots.length < 1 || body.slots.length > MAX_BATCH_LOCATIONS) {
      invalid(`slots 必须是 1-${MAX_BATCH_LOCATIONS} 项的数组`)
    }
    const slots = body.slots.map((slot, index) =>
      pickFields(slot, PAYLOAD_FIELDS.location, { label: `slots[${index}]` }),
    )
    const result = { ...body, slots }
    assertJsonSize(result)
    return structuredClone(result)
  }

  const fields = PAYLOAD_FIELDS[kind]
  if (!fields) throw new TypeError(`Unknown inventory twin payload kind: ${kind}`)
  const result = pickFields(value, fields)
  if (kind === 'qrPreview') {
    if (!Array.isArray(result.codes) || result.codes.length < 1 || result.codes.length > 1000) {
      invalid('codes 必须是 1-1000 项的数组')
    }
  }
  assertJsonSize(result)
  return structuredClone(result)
}

export function parseTwinFilters(kind, value = {}) {
  const fields = FILTER_FIELDS[kind]
  if (!fields) throw new TypeError(`Unknown inventory twin filter kind: ${kind}`)
  return pickFields(value, fields, { label: '查询参数' })
}

export function parseTwinId(value, label = 'id') {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) invalid(`${label} 必须是正整数`)
  return parsed
}

import { pickFields, validationError } from '../../lib/http/validation.js'

const MAX_BATCH_UNITS = 10000
const PRE_INBOUND_STAGES = new Set([
  'pending',
  'confirmed',
  'communication',
  'ordered',
  'sampling',
  'production',
  'shipped',
  'logistics',
  'arrived',
  'inbound',
])
const INVENTORY_UNIT_STATUSES = new Set([
  'in_stock',
  'allocated',
  'picked',
  'returned',
  'damaged',
  'lost',
])
const INVENTORY_HOLDER_TYPES = new Set(['org', 'race', 'runner', 'external'])

function invalid(message, code = 'INVENTORY_INPUT_INVALID', status = 400) {
  const error = validationError(message, undefined, code)
  error.status = status
  throw error
}

function text(value, label, { max = 500, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined
    invalid(`${label} 不能为空`)
  }
  const parsed = String(value).trim()
  if (!parsed) invalid(`${label} 不能为空`)
  if (parsed.length > max) invalid(`${label} 最长 ${max} 个字符`)
  return parsed
}

function nullableText(value, label, { max = 500 } = {}) {
  if (value === undefined) return undefined
  if (value === null || String(value).trim() === '') return null
  return text(value, label, { max })
}

function positiveInteger(value, label, { optional = false } = {}) {
  if ((value === undefined || value === null || value === '') && optional) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) invalid(`${label} 必须是正整数`)
  return parsed
}

function nullablePositiveInteger(value, label) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  return positiveInteger(value, label)
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} 必须是对象`)
  if (JSON.stringify(value).length > 100000) invalid(`${label} 内容过大`)
  return structuredClone(value)
}

function nonNegativeInteger(value, label, { optional = false } = {}) {
  if ((value === undefined || value === null || value === '') && optional) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) invalid(`${label} 必须是非负整数`)
  return parsed
}

function boolean(value, label, { optional = false } = {}) {
  if ((value === undefined || value === null || value === '') && optional) return undefined
  if (value === true || value === 'true' || value === '1') return true
  if (value === false || value === 'false' || value === '0') return false
  invalid(`${label} 必须是布尔值`)
}

function compact(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))
}

export function resolveInventoryOrgId(authContext = {}, source = {}) {
  const requestedOrgId = text(source.orgId, 'orgId', { max: 128, optional: true })
  const authOrgId = text(authContext.orgId, 'authContext.orgId', { max: 128, optional: true })

  if (authContext.role === 'super_admin') return requestedOrgId
  if (!authOrgId) return undefined
  if (requestedOrgId && requestedOrgId !== authOrgId) {
    invalid('无权访问其他机构的仓储数据', 'INVENTORY_SCOPE_FORBIDDEN', 403)
  }
  return authOrgId
}

export function parseBatchUnitPayload(value) {
  const body = pickFields(value, ['batchId', 'warehouseId', 'items'])
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 500) {
    invalid('items 必须是 1-500 项的数组')
  }

  let totalQuantity = 0
  const items = body.items.map((rawItem, index) => {
    const item = pickFields(
      rawItem,
      ['itemType', 'itemCategory', 'itemSpec', 'quantity', 'warehouseId', 'locationId'],
      { label: `items[${index}]` },
    )
    const quantity = positiveInteger(item.quantity, `items[${index}].quantity`)
    totalQuantity += quantity
    if (totalQuantity > MAX_BATCH_UNITS) invalid(`单次入库总数不能超过 ${MAX_BATCH_UNITS}`)

    const warehouseId = positiveInteger(item.warehouseId, 'warehouseId', { optional: true })
    const locationId = positiveInteger(item.locationId, 'locationId', { optional: true })
    return {
      itemType: text(item.itemType, `items[${index}].itemType`, { max: 100 }),
      itemCategory: text(item.itemCategory, `items[${index}].itemCategory`, {
        max: 200,
        optional: true,
      }),
      itemSpec: item.itemSpec === undefined ? undefined : plainObject(item.itemSpec, 'itemSpec'),
      quantity,
      ...(warehouseId ? { warehouseId } : {}),
      ...(locationId ? { locationId } : {}),
    }
  })

  return {
    batchId: positiveInteger(body.batchId, 'batchId'),
    warehouseId: positiveInteger(body.warehouseId, 'warehouseId', { optional: true }),
    items,
  }
}

export function parseUnitScanPayload(value) {
  const body = pickFields(value, ['qrCode', 'action', 'raceId', 'runnerId'])
  const action = text(body.action, 'action', { max: 30, optional: true }) || 'lookup'
  if (!['lookup', 'pickup'].includes(action)) invalid('action 仅支持 lookup 或 pickup')
  const runnerId = text(body.runnerId, 'runnerId', { max: 128, optional: true })
  if (action === 'pickup' && (!runnerId || runnerId === 'current_runner_id')) {
    invalid('pickup 操作必须提供真实 runnerId')
  }
  return {
    qrCode: text(body.qrCode, 'qrCode', { max: 200 }),
    action,
    ...(body.raceId !== undefined
      ? { raceId: text(body.raceId, 'raceId', { max: 128, optional: true }) }
      : {}),
    ...(runnerId ? { runnerId } : {}),
  }
}

export function parseInventoryFilters(kind, value = {}) {
  const fields = {
    preInbound: ['stage', 'priority', 'search', 'onlyActive', 'limit'],
    batches: ['batchType', 'status'],
    units: ['batchId', 'itemType', 'status', 'warehouseId', 'limit'],
  }[kind]
  if (!fields) throw new TypeError(`Unknown inventory filter kind: ${kind}`)
  const query = pickFields(value, fields, { label: '查询参数' })
  const limit = nonNegativeInteger(query.limit, 'limit', { optional: true })
  if (limit !== undefined && (limit < 1 || limit > 500)) invalid('limit 必须在 1-500 之间')
  return compact({
    stage: text(query.stage, 'stage', { max: 50, optional: true }),
    priority: text(query.priority, 'priority', { max: 50, optional: true }),
    search: text(query.search, 'search', { max: 200, optional: true }),
    onlyActive: boolean(query.onlyActive, 'onlyActive', { optional: true }),
    limit,
    batchType: text(query.batchType, 'batchType', { max: 100, optional: true }),
    status: text(query.status, 'status', { max: 50, optional: true }),
    batchId: positiveInteger(query.batchId, 'batchId', { optional: true }),
    itemType: text(query.itemType, 'itemType', { max: 100, optional: true }),
    warehouseId: positiveInteger(query.warehouseId, 'warehouseId', { optional: true }),
  })
}

const PRE_INBOUND_FIELDS = [
  'referenceNo',
  'itemName',
  'itemType',
  'itemCategory',
  'itemSpec',
  'plannedQuantity',
  'confirmedQuantity',
  'supplier',
  'ownerName',
  'contactName',
  'contactPhone',
  'expectedArrivalDate',
  'priority',
  'remarks',
  'currentStage',
]

export function parsePreInboundPayload(value, { partial = false } = {}) {
  const data = pickFields(value, PRE_INBOUND_FIELDS)
  const currentStage = text(data.currentStage, 'currentStage', { max: 50, optional: true })
  if (currentStage && !PRE_INBOUND_STAGES.has(currentStage)) invalid('currentStage 无效')
  return compact({
    referenceNo: text(data.referenceNo, 'referenceNo', { max: 100, optional: true }),
    itemName: text(data.itemName, 'itemName', { max: 200, optional: partial }),
    itemType: text(data.itemType, 'itemType', { max: 100, optional: true }),
    itemCategory: nullableText(data.itemCategory, 'itemCategory', { max: 200 }),
    itemSpec: data.itemSpec === undefined ? undefined : plainObject(data.itemSpec, 'itemSpec'),
    plannedQuantity: nonNegativeInteger(data.plannedQuantity, 'plannedQuantity', { optional: true }),
    confirmedQuantity: nonNegativeInteger(data.confirmedQuantity, 'confirmedQuantity', {
      optional: true,
    }),
    supplier: nullableText(data.supplier, 'supplier', { max: 200 }),
    ownerName: nullableText(data.ownerName, 'ownerName', { max: 100 }),
    contactName: nullableText(data.contactName, 'contactName', { max: 100 }),
    contactPhone: nullableText(data.contactPhone, 'contactPhone', { max: 50 }),
    expectedArrivalDate: nullableText(data.expectedArrivalDate, 'expectedArrivalDate', { max: 50 }),
    priority: text(data.priority, 'priority', { max: 50, optional: true }),
    remarks: nullableText(data.remarks, 'remarks', { max: 5000 }),
    currentStage,
  })
}

export function parseInventoryNote(value) {
  const body = pickFields(value, ['note'])
  return text(body.note, 'note', { max: 5000 })
}

export function parsePreInboundAdvance(value) {
  const body = pickFields(value, ['stage', 'note'])
  const stage = text(body.stage, 'stage', { max: 50 })
  if (!PRE_INBOUND_STAGES.has(stage)) invalid('stage 无效')
  return {
    stage,
    note: text(body.note, 'note', { max: 5000, optional: true }),
  }
}

export function parseBatchPayload(value, { partial = false } = {}) {
  const data = pickFields(value, ['batchName', 'batchType', 'supplier', 'purchaseDate', 'status'])
  return compact({
    batchName: text(data.batchName, 'batchName', { max: 100, optional: partial }),
    batchType: text(data.batchType, 'batchType', { max: 50, optional: partial }),
    supplier: nullableText(data.supplier, 'supplier', { max: 200 }),
    purchaseDate: nullableText(data.purchaseDate, 'purchaseDate', { max: 50 }),
    status: text(data.status, 'status', { max: 50, optional: true }),
  })
}

export function parseWarehousePayload(value, { partial = false } = {}) {
  const data = pickFields(value, ['code', 'name', 'address', 'contact', 'isDefault', 'status'])
  return compact({
    code: text(data.code, 'code', { max: 50, optional: partial }),
    name: text(data.name, 'name', { max: 100, optional: partial }),
    address: nullableText(data.address, 'address', { max: 1000 }),
    contact: nullableText(data.contact, 'contact', { max: 100 }),
    isDefault: boolean(data.isDefault, 'isDefault', { optional: true }),
    status: text(data.status, 'status', { max: 50, optional: true }),
  })
}

export function parseLocationPayload(value) {
  const data = pickFields(value, [
    'warehouseId',
    'code',
    'zone',
    'aisle',
    'shelf',
    'position',
    'qrCode',
    'capacity',
    'itemTypes',
  ])
  if (data.itemTypes !== undefined && !Array.isArray(data.itemTypes)) {
    invalid('itemTypes 必须是数组')
  }
  return compact({
    warehouseId: positiveInteger(data.warehouseId, 'warehouseId', { optional: true }),
    code: text(data.code, 'code', { max: 100, optional: true }),
    zone: text(data.zone, 'zone', { max: 100, optional: true }),
    aisle: text(data.aisle, 'aisle', { max: 100, optional: true }),
    shelf: text(data.shelf, 'shelf', { max: 100, optional: true }),
    position: text(data.position, 'position', { max: 100, optional: true }),
    qrCode: text(data.qrCode, 'qrCode', { max: 200, optional: true }),
    capacity: nonNegativeInteger(data.capacity, 'capacity', { optional: true }),
    itemTypes: data.itemTypes?.map((item) => text(item, 'itemTypes', { max: 100 })),
  })
}

export function parseMaterialRequestPayload(value) {
  const data = pickFields(value, ['raceId', 'itemType', 'itemSpec', 'requestedQuantity'])
  return {
    raceId: positiveInteger(data.raceId, 'raceId'),
    itemType: text(data.itemType, 'itemType', { max: 100 }),
    itemSpec: plainObject(data.itemSpec, 'itemSpec'),
    requestedQuantity: positiveInteger(data.requestedQuantity, 'requestedQuantity'),
  }
}

export function parseUnitStatusPayload(value) {
  const data = pickFields(value, [
    'status',
    'warehouseId',
    'locationId',
    'currentHolderType',
    'currentHolderId',
  ])
  const status = text(data.status, 'status', { max: 20 })
  if (!INVENTORY_UNIT_STATUSES.has(status)) invalid('status 无效')
  const currentHolderType = text(data.currentHolderType, 'currentHolderType', {
    max: 20,
    optional: true,
  })
  if (currentHolderType && !INVENTORY_HOLDER_TYPES.has(currentHolderType)) {
    invalid('currentHolderType 无效')
  }
  return {
    status,
    extra: compact({
      warehouse_id: nullablePositiveInteger(data.warehouseId, 'warehouseId'),
      location_id: nullablePositiveInteger(data.locationId, 'locationId'),
      current_holder_type: currentHolderType,
      current_holder_id: nullableText(data.currentHolderId, 'currentHolderId', { max: 36 }),
    }),
  }
}

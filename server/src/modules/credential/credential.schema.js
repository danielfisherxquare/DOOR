import { normalizeIdNumber } from '../../utils/crypto.js'
import { pickFields, requireRecord, validationError } from '../../lib/http/validation.js'

const PAYLOAD_FIELDS = {
  accessArea: [
    'accessCode',
    'accessName',
    'accessColor',
    'sortOrder',
    'geometry',
    'description',
    'isActive',
  ],
  category: [
    'categoryName',
    'categoryCode',
    'cardColor',
    'requiresReview',
    'isActive',
    'defaultStyleTemplateId',
    'description',
    'sortOrder',
    'accessAreaIds',
  ],
  styleTemplate: [
    'templateName',
    'templateCode',
    'frontLayoutJson',
    'backLayoutJson',
    'pageWidth',
    'pageHeight',
    'version',
    'status',
    'description',
  ],
  request: [
    'sourceMode',
    'categoryId',
    'applicantUserId',
    'personName',
    'orgName',
    'jobTitle',
    'remark',
    'customFields',
    'accessCodes',
  ],
  review: ['approved', 'categoryId', 'accessCodes', 'remark', 'rejectReason', 'jobTitle'],
  qr: ['qrPayload'],
  void: ['voidReason', 'remark'],
  reissue: ['reissueReason', 'remark'],
  issue: ['recipientName', 'recipientIdCard', 'remark'],
}

const INTEGER_FIELDS = new Set(['version', 'categoryId'])
const NUMBER_FIELDS = new Set(['pageWidth', 'pageHeight'])
const BOOLEAN_FIELDS = new Set(['isActive', 'requiresReview', 'approved'])
const OBJECT_FIELDS = new Set(['geometry', 'frontLayoutJson', 'backLayoutJson', 'customFields'])

function invalid(message, code = 'CREDENTIAL_INPUT_INVALID') {
  throw validationError(message, undefined, code)
}

function positiveInteger(value, label) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) invalid(`${label} 必须是正整数`)
  return parsed
}

function nonNegativeInteger(value, label) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) invalid(`${label} 必须是非负整数`)
  return parsed
}

function positiveNumber(value, label) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) invalid(`${label} 必须是正数`)
  return parsed
}

function text(value, label, max = 5000) {
  if (value === null) return null
  const parsed = String(value ?? '').trim()
  if (parsed.length > max) invalid(`${label} 最长 ${max} 个字符`)
  return parsed
}

function arrayOfPositiveIntegers(value, label) {
  if (!Array.isArray(value) || value.length > 1000) invalid(`${label} 必须是最多 1000 项的数组`)
  return [...new Set(value.map((item) => positiveInteger(item, label)))]
}

function arrayOfCodes(value, label) {
  if (!Array.isArray(value) || value.length > 1000) invalid(`${label} 必须是最多 1000 项的数组`)
  return [...new Set(value.map((item) => text(item, label, 50)))]
}

export function parseCredentialRaceId(value) {
  return positiveInteger(value, 'raceId')
}

export function parseCredentialResourceId(value) {
  return positiveInteger(value, 'id')
}

export function parseCredentialStatusFilter(value = {}) {
  const query = requireRecord(value, '查询参数')
  const status = text(query.status, 'status', 50)
  return status ? { status } : {}
}

export function parseCredentialPayload(kind, value) {
  const fields = PAYLOAD_FIELDS[kind]
  if (!fields) throw new TypeError(`Unknown credential payload kind: ${kind}`)
  const data = pickFields(value, fields)
  const parsed = {}

  for (const field of fields) {
    if (data[field] === undefined) continue
    if (INTEGER_FIELDS.has(field)) parsed[field] = positiveInteger(data[field], field)
    else if (NUMBER_FIELDS.has(field)) parsed[field] = positiveNumber(data[field], field)
    else if (field === 'sortOrder') parsed[field] = nonNegativeInteger(data[field], field)
    else if (field === 'defaultStyleTemplateId') {
      parsed[field] = data[field] === null ? null : positiveInteger(data[field], field)
    } else if (BOOLEAN_FIELDS.has(field)) {
      if (typeof data[field] !== 'boolean') invalid(`${field} 必须是布尔值`)
      parsed[field] = data[field]
    } else if (OBJECT_FIELDS.has(field)) {
      if (data[field] === null) parsed[field] = null
      else {
        if (typeof data[field] !== 'object') invalid(`${field} 必须是对象或数组`)
        if (JSON.stringify(data[field]).length > 200000) invalid(`${field} 内容过大`)
        parsed[field] = structuredClone(data[field])
      }
    } else if (field === 'accessAreaIds') {
      parsed[field] = arrayOfPositiveIntegers(data[field], field)
    } else if (field === 'accessCodes') {
      parsed[field] = arrayOfCodes(data[field], field)
    } else {
      parsed[field] = text(data[field], field)
    }
  }

  if (kind === 'issue') {
    if (!parsed.recipientName) invalid('recipientName 不能为空', 'CREDENTIAL_ISSUE_INVALID')
    if (parsed.recipientIdCard) {
      parsed.recipientIdCard = normalizeIdNumber(parsed.recipientIdCard)
      if (!/^(?:\d{15}|\d{17}[\dX])$/u.test(parsed.recipientIdCard)) {
        invalid('recipientIdCard 格式无效', 'CREDENTIAL_ISSUE_INVALID')
      }
    }
  }

  return parsed
}

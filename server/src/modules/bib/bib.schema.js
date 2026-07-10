import { pickFields, requireRecord, validationError } from '../../lib/http/validation.js'

function invalid(code, message) {
  throw validationError(message, undefined, code)
}

function positiveInteger(value, code, label) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) invalid(code, `${label} 必须是正整数`)
  return parsed
}

function text(value, { code, label, max, fallback = '' }) {
  const parsed = value === undefined || value === null ? fallback : String(value).trim()
  if (parsed.length > max) invalid(code, `${label} 最长 ${max} 个字符`)
  return parsed
}

export function parseBibRaceId(value) {
  return positiveInteger(value, 'BIB_RACE_ID_INVALID', 'raceId')
}

export function parseBibResourceId(value) {
  return positiveInteger(value, 'BIB_RESOURCE_ID_INVALID', 'id')
}

export function parseBibTemplate(value) {
  const data = pickFields(value, [
    'raceId',
    'event',
    'prefix',
    'startNumber',
    'endNumber',
    'padding',
  ])
  const code = 'BIB_TEMPLATE_INVALID'
  const startNumber = positiveInteger(data.startNumber ?? 1, code, 'startNumber')
  const endNumber = positiveInteger(data.endNumber ?? 9999, code, 'endNumber')
  if (endNumber < startNumber) invalid(code, 'endNumber 不能小于 startNumber')
  const padding = positiveInteger(data.padding ?? 4, code, 'padding')
  if (padding > 12) invalid(code, 'padding 最大为 12')

  return {
    raceId: parseBibRaceId(data.raceId),
    event: text(data.event, { code, label: 'event', max: 100 }),
    prefix: text(data.prefix, { code, label: 'prefix', max: 20 }),
    startNumber,
    endNumber,
    padding,
  }
}

function parseAssignment(value, index) {
  const data = pickFields(value, [
    'recordId',
    'bibNumber',
    'bagWindowNo',
    'bagNo',
    'expoWindowNo',
    'bibColor',
  ], { label: `assignments[${index}]` })
  const code = 'BIB_ASSIGNMENTS_INVALID'
  return {
    recordId: positiveInteger(data.recordId, code, `assignments[${index}].recordId`),
    bibNumber: text(data.bibNumber, { code, label: 'bibNumber', max: 50 }),
    bagWindowNo: text(data.bagWindowNo, { code, label: 'bagWindowNo', max: 100 }),
    bagNo: text(data.bagNo, { code, label: 'bagNo', max: 100 }),
    expoWindowNo: text(data.expoWindowNo, { code, label: 'expoWindowNo', max: 100 }),
    bibColor: text(data.bibColor, { code, label: 'bibColor', max: 30 }),
  }
}

export function parseBibAssignments(value) {
  const body = requireRecord(value)
  if (!Array.isArray(body.assignments) || body.assignments.length === 0) {
    invalid('BIB_ASSIGNMENTS_INVALID', 'assignments 必须是非空数组')
  }
  if (body.assignments.length > 10000) {
    invalid('BIB_ASSIGNMENTS_TOO_LARGE', 'assignments 最多允许 10000 项')
  }
  const assignments = body.assignments.map(parseAssignment)
  const recordIds = new Set()
  const bibNumbers = new Set()
  for (const assignment of assignments) {
    if (recordIds.has(assignment.recordId)) {
      invalid('BIB_ASSIGNMENTS_DUPLICATE_RECORD', `recordId ${assignment.recordId} 重复`)
    }
    recordIds.add(assignment.recordId)
    if (assignment.bibNumber) {
      if (bibNumbers.has(assignment.bibNumber)) {
        invalid('BIB_ASSIGNMENTS_DUPLICATE_NUMBER', `bibNumber ${assignment.bibNumber} 重复`)
      }
      bibNumbers.add(assignment.bibNumber)
    }
  }
  return assignments
}

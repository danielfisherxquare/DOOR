import { requireRecord, validationError } from '../../lib/http/validation.js'

const AUDIT_STEP_DEFINITIONS = {
  underage: { stepNumber: 1, jobName: 'underage' },
  blacklist: { stepNumber: 2, jobName: 'blacklist' },
  'fake-elite': { stepNumber: 3, jobName: 'fake_elite' },
  'direct-lock': { stepNumber: 4, jobName: 'direct_lock' },
  'mass-pool': { stepNumber: 5, jobName: 'mass_pool' },
}

function invalid(code, message) {
  throw validationError(message, undefined, code)
}

export function getAuditStepDefinition(stepName) {
  const definition = AUDIT_STEP_DEFINITIONS[stepName]
  if (!definition) invalid('AUDIT_STEP_INVALID', '未知审核步骤')
  return { routeName: stepName, ...definition }
}

export function parseAuditRaceId(value) {
  const raceId = Number(value)
  if (!Number.isInteger(raceId) || raceId <= 0) {
    invalid('AUDIT_RACE_ID_INVALID', 'raceId 必须是有效的正整数')
  }
  return raceId
}

function parseDateOnly(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') invalid('AUDIT_RACE_DATE_INVALID', 'raceDate 必须是 YYYY-MM-DD')
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) invalid('AUDIT_RACE_DATE_INVALID', 'raceDate 必须是 YYYY-MM-DD')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    invalid('AUDIT_RACE_DATE_INVALID', 'raceDate 不是有效日期')
  }
  return value
}

export function parseAuditStepInput(stepName, value = {}) {
  getAuditStepDefinition(stepName)
  const input = requireRecord(value)
  if (stepName !== 'underage') return {}
  const raceDate = parseDateOnly(input.raceDate)
  return raceDate ? { raceDate } : {}
}

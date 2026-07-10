import { CronPattern } from 'croner'
import { pickFields, validationError } from '../../lib/http/validation.js'

function invalid(message) {
  throw validationError(message, undefined, 'SYS_JOB_INPUT_INVALID')
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

function option(value, label, allowed, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = String(value)
  if (!allowed.has(parsed)) invalid(`${label} 无效`)
  return parsed
}

function compact(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))
}

function cronExpression(value, { optional = false } = {}) {
  const parsed = text(value, 'cronExpression', { max: 100, optional })
  if (parsed === undefined) return undefined
  try {
    new CronPattern(parsed)
  } catch {
    invalid('cronExpression 格式无效')
  }
  return parsed
}

export function parseSysJobPayload(value, { partial = false } = {}) {
  const data = pickFields(value, [
    'jobName',
    'jobGroup',
    'cronExpression',
    'invokeTarget',
    'concurrent',
    'misfirePolicy',
    'remark',
  ])
  return compact({
    jobName: text(data.jobName, 'jobName', { max: 200, optional: partial }),
    jobGroup: text(data.jobGroup, 'jobGroup', { max: 100, optional: true }) ||
      (partial ? undefined : 'default'),
    cronExpression: cronExpression(data.cronExpression, { optional: partial }),
    invokeTarget: text(data.invokeTarget, 'invokeTarget', { max: 500, optional: partial }),
    concurrent: option(data.concurrent, 'concurrent', new Set(['0', '1']), partial ? undefined : '1'),
    misfirePolicy: option(
      data.misfirePolicy,
      'misfirePolicy',
      new Set(['skip', 'fire_once', 'ignore']),
      partial ? undefined : 'skip',
    ),
    remark: text(data.remark, 'remark', { max: 500, optional: true, nullable: true }),
  })
}

export function parseSysJobId(value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) invalid('id 必须是正整数')
  return parsed
}

export function parseSysJobLogFilters(value = {}) {
  const query = pickFields(value, ['page', 'pageSize'], { label: '查询参数' })
  const parsePage = (raw, label, fallback, max) => {
    if (raw === undefined || raw === null || raw === '') return fallback
    const parsed = Number(raw)
    if (!Number.isInteger(parsed) || parsed <= 0) invalid(`${label} 必须是正整数`)
    return Math.min(parsed, max)
  }
  return {
    page: parsePage(query.page, 'page', 1, 1_000_000),
    pageSize: parsePage(query.pageSize, 'pageSize', 20, 200),
  }
}

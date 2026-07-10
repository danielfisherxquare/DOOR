import { pickFields, requireRecord, validationError } from '../../lib/http/validation.js'

function invalid(message, code = 'PROFILE_UPDATE_INVALID') {
  throw validationError(message, undefined, code)
}

function optionalId(value, label) {
  if (value === undefined || value === null || value === '') return null
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = String(raw).trim()
  if (!parsed || parsed.length > 100) invalid(`${label} 无效`, 'PROFILE_CONTEXT_INVALID')
  return parsed
}

function optionalText(value, label, max) {
  if (value === null) return null
  const parsed = String(value ?? '').trim()
  if (parsed.length > max) invalid(`${label} 最长 ${max} 个字符`)
  return parsed
}

export function parseProfileContextQuery(value = {}) {
  const query = requireRecord(value, '查询参数')
  const orgId = optionalId(query.orgId, 'orgId')
  const rawRaceId = optionalId(query.raceId, 'raceId')
  let raceId = null
  if (rawRaceId) {
    const parsed = Number(rawRaceId)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      invalid('raceId 必须是正整数', 'PROFILE_CONTEXT_INVALID')
    }
    raceId = String(parsed)
  }
  return { orgId, raceId }
}

export function parseProfileUserId(value) {
  const userId = optionalId(value, 'userId')
  if (!userId) invalid('userId 不能为空', 'PROFILE_USER_ID_INVALID')
  return userId
}

export function parseProfileUpdate(value) {
  const data = pickFields(value, ['phone', 'bio', 'skills', 'preferences'])
  if (Object.keys(data).length === 0) invalid('没有可更新的个人信息字段')
  const parsed = {}
  if (data.phone !== undefined) parsed.phone = optionalText(data.phone, 'phone', 50)
  if (data.bio !== undefined) parsed.bio = optionalText(data.bio, 'bio', 5000)
  if (data.skills !== undefined) {
    if (!Array.isArray(data.skills) || data.skills.length > 50) {
      invalid('skills 必须是最多 50 项的数组')
    }
    parsed.skills = data.skills.map((skill) => optionalText(skill, 'skill', 100))
  }
  if (data.preferences !== undefined) {
    if (!data.preferences || typeof data.preferences !== 'object' || Array.isArray(data.preferences)) {
      invalid('preferences 必须是对象')
    }
    if (JSON.stringify(data.preferences).length > 20000) invalid('preferences 内容过大')
    parsed.preferences = structuredClone(data.preferences)
  }
  return parsed
}

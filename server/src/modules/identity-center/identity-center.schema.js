import { pickFields, requireRecord, validationError } from '../../lib/http/validation.js'

const ACCESS_LEVELS = new Set(['viewer', 'editor'])

function invalid(message) {
  throw validationError(message, undefined, 'IDENTITY_CENTER_INPUT_INVALID')
}

function text(value, label, { max = 200, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined
    invalid(`${label} 不能为空`)
  }
  const parsed = String(value).trim()
  if (!parsed) invalid(`${label} 不能为空`)
  if (parsed.length > max) invalid(`${label} 最长 ${max} 个字符`)
  return parsed
}

function positiveInteger(value, label) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) invalid(`${label} 必须是正整数`)
  return parsed
}

function boundedArray(value, label, { min = 0, max }) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    const range = min > 0 ? `${min}-${max}` : `最多 ${max}`
    invalid(`${label} 必须是${range}项的数组`)
  }
  return value
}

function accessLevel(value, label) {
  const parsed = text(value, label, { max: 20 })
  if (!ACCESS_LEVELS.has(parsed)) invalid(`${label} 必须是 viewer 或 editor`)
  return parsed
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) invalid(`${label} 存在重复项`)
}

function parseScopedQuery(value = {}) {
  const query = requireRecord(value, '查询参数')
  return {
    orgId: text(query.orgId, 'orgId', { max: 128, optional: true }),
  }
}

export function parseIdentityScopeQuery(value = {}) {
  return parseScopedQuery(value)
}

export function parseIdentityListQuery(value = {}) {
  const query = requireRecord(value, '查询参数')
  const page = query.page === undefined ? 1 : positiveInteger(query.page, 'page')
  const limit = query.limit === undefined ? 20 : positiveInteger(query.limit, 'limit')
  if (limit > 100) invalid('limit 不能超过 100')
  return {
    orgId: text(query.orgId, 'orgId', { max: 128, optional: true }),
    page,
    limit,
    keyword: text(query.keyword, 'keyword', { max: 200, optional: true }) || '',
  }
}

export function parseIdentityModuleQuery(value = {}) {
  const query = parseIdentityListQuery(value)
  return { orgId: query.orgId, keyword: query.keyword }
}

export function parseIdentityModuleMatrixPayload(value) {
  const body = pickFields(value, ['updates'])
  const updates = boundedArray(body.updates, 'updates', { min: 1, max: 5000 }).map(
    (rawUpdate, index) => {
      const update = pickFields(rawUpdate, ['userId', 'modules'], {
        label: `updates[${index}]`,
      })
      const modules = boundedArray(update.modules, `updates[${index}].modules`, { max: 100 }).map(
        (moduleId) => text(moduleId, `updates[${index}].modules`, { max: 100 }),
      )
      return {
        userId: text(update.userId, `updates[${index}].userId`, { max: 128 }),
        modules: [...new Set(modules)],
      }
    },
  )
  assertUnique(
    updates.map((update) => update.userId),
    'updates.userId',
  )
  return updates
}

export function parseIdentityOrgRacePayload(value) {
  const body = pickFields(value, ['permissions'])
  const permissions = boundedArray(body.permissions, 'permissions', { max: 10000 }).map(
    (rawPermission, index) => {
      const permission = pickFields(rawPermission, ['raceId', 'accessLevel'], {
        label: `permissions[${index}]`,
      })
      return {
        raceId: positiveInteger(permission.raceId, `permissions[${index}].raceId`),
        accessLevel: accessLevel(permission.accessLevel, `permissions[${index}].accessLevel`),
      }
    },
  )
  assertUnique(
    permissions.map((permission) => permission.raceId),
    'permissions.raceId',
  )
  return permissions
}

export function parseIdentityUserRacePayload(value) {
  const body = pickFields(value, ['updates'])
  const updates = boundedArray(body.updates, 'updates', { min: 1, max: 5000 }).map(
    (rawUpdate, updateIndex) => {
      const update = pickFields(rawUpdate, ['userId', 'explicitPermissions'], {
        label: `updates[${updateIndex}]`,
      })
      const explicitPermissions = boundedArray(
        update.explicitPermissions,
        `updates[${updateIndex}].explicitPermissions`,
        { max: 10000 },
      ).map((rawPermission, permissionIndex) => {
        const label = `updates[${updateIndex}].explicitPermissions[${permissionIndex}]`
        const permission = pickFields(rawPermission, ['raceId', 'accessLevel'], { label })
        return {
          raceId: positiveInteger(permission.raceId, `${label}.raceId`),
          accessLevel: accessLevel(permission.accessLevel, `${label}.accessLevel`),
        }
      })
      assertUnique(
        explicitPermissions.map((permission) => permission.raceId),
        `updates[${updateIndex}].explicitPermissions.raceId`,
      )
      return {
        userId: text(update.userId, `updates[${updateIndex}].userId`, { max: 128 }),
        explicitPermissions,
      }
    },
  )
  assertUnique(
    updates.map((update) => update.userId),
    'updates.userId',
  )
  return updates
}

export const ROLE_LABELS = {
  super_admin: '超级管理员',
  org_admin: '机构管理员',
  race_admin: '赛事管理员',
  user: '普通用户',
}

export const ACCOUNT_SOURCE_LABELS = {
  manual: '手工创建',
  team_member_auto: '团队自动创建',
  team_member_manual_enable: '外援手动启用',
}

export const VIEW_OPTIONS = [
  { key: 'accounts', label: '账号状态' },
  { key: 'module-matrix', label: '模块权限' },
  { key: 'user-race', label: '用户赛事授权' },
  { key: 'org-race', label: '机构赛事范围', superAdminOnly: true },
]

export function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}

export function cloneData(value) {
  return JSON.parse(JSON.stringify(value))
}

export function getUserRaceState(inheritedAccessLevel, explicitAccessLevel, effectiveAccessLevel) {
  if (!effectiveAccessLevel) return 'none'
  if (explicitAccessLevel === 'editor') return 'explicit_editor'
  if (explicitAccessLevel === 'viewer') return 'explicit_viewer'
  if (inheritedAccessLevel === 'editor') return 'inherited_editor'
  if (inheritedAccessLevel === 'viewer') return 'inherited_viewer'
  return 'none'
}

export function getUserRaceChoice(cell) {
  if (cell.explicitAccessLevel === 'editor') return 'explicit_editor'
  if (cell.explicitAccessLevel === 'viewer') return 'explicit_viewer'
  return 'inherit'
}

export function getUserRaceOptions(role, cell) {
  const options = [{
    value: 'inherit',
    label: cell.inheritedAccessLevel ? `继承 ${cell.inheritedAccessLevel}` : '无权限',
  }]

  if (role === 'user' || cell.inheritedAccessLevel === 'viewer') {
    options.push({ value: 'explicit_viewer', label: '显式 viewer' })
    return options
  }

  options.push({ value: 'explicit_editor', label: '显式 editor' })
  options.push({ value: 'explicit_viewer', label: '显式 viewer' })
  return options
}

export function buildUserRaceCell(role, race, previousCell, choice) {
  const inheritedAccessLevel = previousCell.inheritedAccessLevel
  const source = choice === 'inherit' ? race.source : 'user_assignment'
  let explicitAccessLevel = null

  if (choice === 'explicit_editor') explicitAccessLevel = 'editor'
  if (choice === 'explicit_viewer') explicitAccessLevel = 'viewer'

  const rawEffectiveAccessLevel = explicitAccessLevel || inheritedAccessLevel || null
  const effectiveAccessLevel = role === 'user' && rawEffectiveAccessLevel === 'editor'
    ? 'viewer'
    : rawEffectiveAccessLevel

  return {
    ...previousCell,
    inheritedAccessLevel,
    explicitAccessLevel,
    effectiveAccessLevel,
    source,
    state: getUserRaceState(inheritedAccessLevel, explicitAccessLevel, effectiveAccessLevel),
  }
}

export function buildAccountRoleOptions(isSuperAdmin) {
  if (isSuperAdmin) {
    return [
      { value: 'org_admin', label: '机构管理员' },
      { value: 'race_admin', label: '赛事管理员' },
      { value: 'user', label: '普通用户' },
    ]
  }
  return [
    { value: 'race_admin', label: '赛事管理员' },
    { value: 'user', label: '普通用户' },
  ]
}

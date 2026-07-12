export const MEMBER_TYPE_LABELS = {
  employee: '正式成员',
  external_support: '外援',
}

export const EXTERNAL_TYPE_LABELS = {
  temporary: '临时外援',
  long_term: '长期外援',
}

export const EMPTY_TEAM_MEMBER_FORM = {
  employeeCode: '',
  employeeName: '',
  position: '',
  department: '',
  memberType: 'employee',
  externalEngagementType: '',
  idNumber: '',
  contact: '',
  hasPhoto: false,
}

export const PAGE_LIMIT = 20
export const EMPLOYEE_CODE_PAGE_SIZE = 200
export const EMPLOYEE_CODE_SUGGESTION_LIMIT = 16

export function parseEmployeeCode(value) {
  const match = String(value || '')
    .trim()
    .match(/^(.*?)(\d+)$/)
  if (!match) return null
  return {
    prefix: match[1],
    number: Number(match[2]),
    width: match[2].length,
  }
}

export function buildEmployeeCodeOptions(codes, currentCode = '') {
  const occupiedCodes = new Set(
    (Array.isArray(codes) ? codes : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  )
  const groups = new Map()
  const plainCodes = []

  occupiedCodes.forEach((code) => {
    const parsed = parseEmployeeCode(code)
    if (!parsed) {
      plainCodes.push(code)
      return
    }
    const key = `${parsed.prefix}__${parsed.width}`
    const group = groups.get(key) || {
      prefix: parsed.prefix,
      width: parsed.width,
      max: 0,
      count: 0,
    }
    group.max = Math.max(group.max, parsed.number)
    group.count += 1
    groups.set(key, group)
  })

  const options = []
  groups.forEach((group) => {
    const upperBound = Math.max(group.max + 20, group.count + 20)
    for (let value = 1; value <= upperBound; value += 1) {
      const code = `${group.prefix}${String(value).padStart(group.width, '0')}`
      options.push({ code, occupied: occupiedCodes.has(code) })
    }
  })

  plainCodes
    .sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }),
    )
    .forEach((code) => options.push({ code, occupied: occupiedCodes.has(code) }))

  const normalizedCurrentCode = String(currentCode || '').trim()
  if (normalizedCurrentCode && !options.some((item) => item.code === normalizedCurrentCode)) {
    options.unshift({ code: normalizedCurrentCode, occupied: false })
  }

  return options.sort((left, right) =>
    left.code.localeCompare(right.code, undefined, { numeric: true, sensitivity: 'base' }),
  )
}

export function normalizeTeamImportRows(rows, columns) {
  const titleToKeyMap = new Map(columns.map((item) => [item.title, item.key]))
  return rows
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([title, value]) => [titleToKeyMap.get(title) || title, value]),
      ),
    )
    .filter((row) => Object.values(row).some((value) => String(value || '').trim()))
}

export function buildTeamMemberMetrics(items, total) {
  const activeCount = items.filter((item) => item.status === 'active').length
  const withPhotoCount = items.filter((item) => item.hasPhoto).length
  const accountCount = items.filter((item) => item.accountUsername).length
  return [
    {
      key: 'total',
      label: '当前成员',
      value: total || items.length,
      meta: '当前筛选条件下命中的成员总数',
      pill: 'TM',
    },
    {
      key: 'active',
      label: '启用成员',
      value: activeCount,
      meta: '当前页中仍处于启用状态的成员',
      pill: 'ON',
    },
    {
      key: 'photo',
      label: '已上传照片',
      value: withPhotoCount,
      meta: '当前页中已经补齐成员照片的数量',
      pill: 'PH',
    },
    {
      key: 'account',
      label: '已开通账号',
      value: accountCount,
      meta: '当前页中已绑定登录账号的成员数量',
      pill: 'AC',
    },
  ]
}

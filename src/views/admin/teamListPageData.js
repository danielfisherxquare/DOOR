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

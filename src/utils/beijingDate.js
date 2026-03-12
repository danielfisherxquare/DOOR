const BEIJING_TIME_ZONE = 'Asia/Shanghai'

function getDateParts(value) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BEIJING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })

  const parts = formatter.formatToParts(value)
  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const day = parts.find(part => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error('Unable to format Beijing date')
  }

  return { year, month, day }
}

export function getTodayInBeijing() {
  const { year, month, day } = getDateParts(new Date())
  return `${year}-${month}-${day}`
}

export function normalizeInterviewDate(value) {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (match) {
      return match[1]
    }
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const { year, month, day } = getDateParts(date)
  return `${year}-${month}-${day}`
}

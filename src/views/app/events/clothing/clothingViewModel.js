const CLOTHING_GENDERS = new Set(['M', 'F', 'U'])

function toCount(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function formatClothingGender(gender) {
  if (gender === 'M') return '男子'
  if (gender === 'F') return '女子'
  return '通用'
}

export function findClothingLimit(limits, event, gender, size) {
  if (!CLOTHING_GENDERS.has(gender)) return undefined
  return limits.find((item) => (
    item.event === event
    && item.gender === gender
    && item.size === size
  ))
}

export function buildClothingStatisticsRows(items) {
  return items.map((item) => {
    const totalInventory = toCount(item.totalInventory)
    const usedCount = toCount(item.usedCount)
    return {
      event: item.event,
      gender: item.gender,
      size: item.size,
      totalInventory,
      usedCount,
      remaining: Math.max(0, totalInventory - usedCount),
      overstock: Math.max(0, usedCount - totalInventory),
    }
  })
}

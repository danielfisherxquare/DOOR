export function getEventGroupKey(event) {
  const value = String(event || '').trim()
  const lower = value.toLowerCase()

  if (!value) return 'ALL'
  if (lower.includes('half') || value.includes('半')) return 'Half'
  if (lower.includes('full') || lower.includes('marathon') || value.includes('全') || value.includes('马拉松')) return 'Full'
  return value
}

export function getEventLabel(event) {
  const groupKey = getEventGroupKey(event)
  if (groupKey === 'Full') return '马拉松'
  if (groupKey === 'Half') return '半程马拉松'
  return String(event || '').trim() || '未命名项目'
}

export function resolveEffectiveMode(row, raceDefaultMode) {
  if (row?.lotteryModeOverride === 'direct' || row?.lotteryModeOverride === 'lottery') {
    return row.lotteryModeOverride
  }
  return raceDefaultMode === 'direct' ? 'direct' : 'lottery'
}

export function buildEventRows(raceDetail) {
  const events = Array.isArray(raceDetail?.events) ? raceDetail.events : []
  return events
    .map((event, index) => ({
      id: `default-${index}`,
      raceId: raceDetail?.id,
      event: getEventLabel(event?.name),
      targetCount: Number(event?.targetCount || 0),
      drawRatio: 0.85,
      reservedRatio: 0.15,
      lotteryModeOverride: 'inherit',
    }))
    .filter((item) => item.event)
}

export function toNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export function formatNumber(value) {
  return toNumber(value, 0).toLocaleString()
}

export function getCountFromMap(map, key) {
  if (!map || typeof map !== 'object') return 0
  return toNumber(map[key], 0)
}

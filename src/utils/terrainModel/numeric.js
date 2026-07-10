export function pickNumber(value, fallback = 0) {
  const nextValue = Number(value)
  return Number.isFinite(nextValue) ? nextValue : fallback
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function round(value, digits = 3) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function toFiniteElevation(value) {
  if (value === null || value === undefined || value === '') return null
  const nextValue = Number(value)
  return Number.isFinite(nextValue) ? nextValue : null
}

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

export function reducePeakPreserving(values) {
  const finite = Array.isArray(values)
    ? values.map((value) => Number(value)).filter(Number.isFinite)
    : []
  if (!finite.length) return null
  if (finite.length === 1) return finite[0]
  const center = median(finite)
  let minValue = Number.POSITIVE_INFINITY
  let maxValue = Number.NEGATIVE_INFINITY
  for (const value of finite) {
    if (value < minValue) minValue = value
    if (value > maxValue) maxValue = value
  }
  if (minValue === maxValue) return minValue
  return maxValue - center >= center - minValue ? maxValue : minValue
}

export function percentile(values, ratio) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right)
  if (!sorted.length) return null
  const position = clamp(ratio, 0, 1) * (sorted.length - 1)
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  if (lowerIndex === upperIndex) return sorted[lowerIndex]
  const t = position - lowerIndex
  return sorted[lowerIndex] * (1 - t) + sorted[upperIndex] * t
}

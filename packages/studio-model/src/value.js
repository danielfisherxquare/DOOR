export function cloneValue(value) {
  if (value === null || value === undefined) return value
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

export const asArray = (value) => (Array.isArray(value) ? value : [])

export const asString = (value, fallback = '') => (
  typeof value === 'string' && value.trim() ? value.trim() : fallback
)

export function asNumber(value, fallback = 0) {
  const nextValue = Number(value)
  return Number.isFinite(nextValue) ? nextValue : fallback
}

export function asOptionalNumber(value, fallback = Number.NaN) {
  if (value === null || value === undefined || value === '') return fallback
  return asNumber(value, fallback)
}

export const roundCoord = (value) => Math.round(asNumber(value, 0) * 1000) / 1000

export const pointKey = (x, z, y = 0) => `${roundCoord(x)}:${roundCoord(y)}:${roundCoord(z)}`

export const toPoint = (value, fallback = [0, 0]) => (
  Array.isArray(value) ? [roundCoord(value[0]), roundCoord(value[1])] : fallback
)

export function createId(prefix = 'doc') {
  if (typeof globalThis.crypto?.randomUUID === 'function') return `${prefix}-${globalThis.crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeVector3(value, fallback = [0, 0, 0]) {
  const items = asArray(value)
  return [
    roundCoord(items[0] ?? fallback[0]),
    roundCoord(items[1] ?? fallback[1]),
    roundCoord(items[2] ?? fallback[2]),
  ]
}

export function distance2D(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1])
}

export function normalizeCurvePoint(value, fallback = [0, 0]) {
  return toPoint(value, fallback)
}

import { asNumber } from './value.js'

export function polygonArea(points) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current[0] * next[1] - next[0] * current[1]
  }
  return Math.abs(area) / 2
}

export function boundsFromFootprint(points) {
  if (!points.length) return { width: 0, depth: 0 }
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  points.forEach((point) => {
    minX = Math.min(minX, asNumber(point?.[0], 0))
    maxX = Math.max(maxX, asNumber(point?.[0], 0))
    minZ = Math.min(minZ, asNumber(point?.[1], 0))
    maxZ = Math.max(maxZ, asNumber(point?.[1], 0))
  })
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: Math.max(maxX - minX, 0),
    depth: Math.max(maxZ - minZ, 0),
  }
}

export function segmentsIntersect(a1, a2, b1, b2) {
  const cross = (p1, p2, p3) => (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0])
  const onSegment = (p1, p2, p3) => (
    Math.min(p1[0], p2[0]) <= p3[0] && p3[0] <= Math.max(p1[0], p2[0])
    && Math.min(p1[1], p2[1]) <= p3[1] && p3[1] <= Math.max(p1[1], p2[1])
  )
  const d1 = cross(a1, a2, b1)
  const d2 = cross(a1, a2, b2)
  const d3 = cross(b1, b2, a1)
  const d4 = cross(b1, b2, a2)
  if (d1 === 0 && onSegment(a1, a2, b1)) return true
  if (d2 === 0 && onSegment(a1, a2, b2)) return true
  if (d3 === 0 && onSegment(b1, b2, a1)) return true
  if (d4 === 0 && onSegment(b1, b2, a2)) return true
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))
}

export function validatePolygon(points) {
  if (points.length < 3) return { valid: false, reason: '至少需要三个顶点' }
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      const neighbour = Math.abs(left - right) <= 1 || (left === 0 && right === points.length - 1)
      if (neighbour) continue
      if (segmentsIntersect(points[left], points[(left + 1) % points.length], points[right], points[(right + 1) % points.length])) {
        return { valid: false, reason: '轮廓存在自相交' }
      }
    }
  }
  if (polygonArea(points) < 0.01) return { valid: false, reason: '轮廓面积过小' }
  return { valid: true, reason: null }
}

export function buildWallFootprint(start, end, thickness) {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const length = Math.hypot(dx, dz)
  if (length < 0.001) return null
  const half = Math.max(thickness, 0.1) / 2
  const ox = (-dz / length) * half
  const oz = (dx / length) * half
  return [
    [start[0] + ox, start[1] + oz],
    [end[0] + ox, end[1] + oz],
    [end[0] - ox, end[1] - oz],
    [start[0] - ox, start[1] - oz],
  ]
}

import { asNumber, asString, normalizeVector3, roundCoord } from './value.js'

function dot3(left, right) {
  return asNumber(left?.[0], 0) * asNumber(right?.[0], 0)
    + asNumber(left?.[1], 0) * asNumber(right?.[1], 0)
    + asNumber(left?.[2], 0) * asNumber(right?.[2], 0)
}

function sub3(left, right) {
  return [
    asNumber(left?.[0], 0) - asNumber(right?.[0], 0),
    asNumber(left?.[1], 0) - asNumber(right?.[1], 0),
    asNumber(left?.[2], 0) - asNumber(right?.[2], 0),
  ]
}

function addScaled3(origin, xAxis, x, yAxis, y, normal = [0, 1, 0], offset = 0) {
  return [
    roundCoord(asNumber(origin?.[0], 0) + asNumber(xAxis?.[0], 0) * x + asNumber(yAxis?.[0], 0) * y + asNumber(normal?.[0], 0) * offset),
    roundCoord(asNumber(origin?.[1], 0) + asNumber(xAxis?.[1], 0) * x + asNumber(yAxis?.[1], 0) * y + asNumber(normal?.[1], 0) * offset),
    roundCoord(asNumber(origin?.[2], 0) + asNumber(xAxis?.[2], 0) * x + asNumber(yAxis?.[2], 0) * y + asNumber(normal?.[2], 0) * offset),
  ]
}

export function planeIsGroundLike(plane) {
  const normal = normalizeVector3(plane?.normal, [0, 1, 0])
  const xAxis = normalizeVector3(plane?.xAxis, [1, 0, 0])
  const yAxis = normalizeVector3(plane?.yAxis, [0, 0, 1])
  return Math.abs(normal[0]) < 0.001
    && Math.abs(normal[1] - 1) < 0.001
    && Math.abs(normal[2]) < 0.001
    && Math.abs(xAxis[0] - 1) < 0.001
    && Math.abs(xAxis[1]) < 0.001
    && Math.abs(xAxis[2]) < 0.001
    && Math.abs(yAxis[0]) < 0.001
    && Math.abs(yAxis[1]) < 0.001
    && Math.abs(yAxis[2] - 1) < 0.001
}

export function localPointToWorld(plane, point, offset = 0) {
  return addScaled3(
    normalizeVector3(plane?.origin, [0, 0, 0]),
    normalizeVector3(plane?.xAxis, [1, 0, 0]),
    asNumber(point?.[0], 0),
    normalizeVector3(plane?.yAxis, [0, 0, 1]),
    asNumber(point?.[1], 0),
    normalizeVector3(plane?.normal, [0, 1, 0]),
    offset,
  )
}

export function worldPointToLocal(plane, worldPoint) {
  const origin = normalizeVector3(plane?.origin, [0, 0, 0])
  const relative = sub3(worldPoint, origin)
  return [
    roundCoord(dot3(relative, normalizeVector3(plane?.xAxis, [1, 0, 0]))),
    roundCoord(dot3(relative, normalizeVector3(plane?.yAxis, [0, 0, 1]))),
  ]
}

export function planeDefinitionFromOptions(options = {}) {
  if (options.plane && typeof options.plane === 'object') {
    return {
      id: asString(options.plane.id, ''),
      kind: asString(options.plane.kind, 'custom'),
      name: asString(options.plane.name, 'Sketch Plane'),
      origin: normalizeVector3(options.plane.origin, [0, asNumber(options.plane.elevation, 0), 0]),
      normal: normalizeVector3(options.plane.normal, [0, 1, 0]),
      xAxis: normalizeVector3(options.plane.xAxis, [1, 0, 0]),
      yAxis: normalizeVector3(options.plane.yAxis, [0, 0, 1]),
    }
  }

  const planeId = asString(options.planeId, '')
  const elevation = asNumber(options.planeElevation, 0)
  if (!planeId && elevation === 0) return null

  return {
    id: planeId,
    kind: 'custom',
    name: planeId ? 'Sketch Plane' : 'Elevated Plane',
    origin: [0, elevation, 0],
    normal: [0, 1, 0],
    xAxis: [1, 0, 0],
    yAxis: [0, 0, 1],
  }
}

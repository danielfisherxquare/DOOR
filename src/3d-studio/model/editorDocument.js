const DEFAULT_WAREHOUSE_DIMENSIONS_MM = { width_mm: 24000, depth_mm: 18000, height_mm: 9000 }
const DEFAULT_CURVE_TOLERANCE = 0.08

const cloneValue = (value) => {
  if (value === null || value === undefined) return value
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

const asArray = (value) => (Array.isArray(value) ? value : [])
const asString = (value, fallback = '') => (typeof value === 'string' && value.trim() ? value.trim() : fallback)
const asNumber = (value, fallback = 0) => {
  const nextValue = Number(value)
  return Number.isFinite(nextValue) ? nextValue : fallback
}
const roundCoord = (value) => Math.round(asNumber(value, 0) * 1000) / 1000
const pointKey = (x, z, y = 0) => `${roundCoord(x)}:${roundCoord(y)}:${roundCoord(z)}`
const toPoint = (value, fallback = [0, 0]) => (Array.isArray(value) ? [roundCoord(value[0]), roundCoord(value[1])] : fallback)

function createId(prefix = 'doc') {
  if (typeof globalThis.crypto?.randomUUID === 'function') return `${prefix}-${globalThis.crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeVector3(value, fallback = [0, 0, 0]) {
  const items = asArray(value)
  return [roundCoord(items[0] ?? fallback[0]), roundCoord(items[1] ?? fallback[1]), roundCoord(items[2] ?? fallback[2])]
}

function distance2D(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1])
}

function normalizeCurvePoint(value, fallback = [0, 0]) {
  return toPoint(value, fallback)
}

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

function planeIsGroundLike(plane) {
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

function planeDefinitionFromOptions(options = {}) {
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

function polygonArea(points) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current[0] * next[1] - next[0] * current[1]
  }
  return Math.abs(area) / 2
}

function segmentsIntersect(a1, a2, b1, b2) {
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

function validatePolygon(points) {
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

function buildWallFootprint(start, end, thickness) {
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

function defaultPlane() {
  return { id: 'plane-ground', kind: 'ground', name: 'Ground', origin: [0, 0, 0], normal: [0, 1, 0], xAxis: [1, 0, 0], yAxis: [0, 0, 1] }
}

export function getSketchPlaneById(document, planeId = 'plane-ground') {
  const normalized = normalizeEditorDocument(document)
  return normalized.sketchPlanes.find((plane) => plane.id === planeId) || normalized.sketchPlanes[0] || defaultPlane()
}

export function getSketchPlaneElevation(document, planeId = 'plane-ground') {
  return asNumber(getSketchPlaneById(document, planeId)?.origin?.[1], 0)
}

export function createEmptyEditorDocument() {
  return {
    version: 2,
    units: 'meters',
    coordinateSystem: 'xz-ground',
    sketchPlanes: [defaultPlane()],
    vertices: [],
    segments: [],
    profiles: [],
    solids: [],
    surfaces: [],
    instances: [],
    openings: [],
    history: [],
    metadata: { source: 'door-modeling-v2' },
  }
}

export function normalizeEditorDocument(value) {
  const base = createEmptyEditorDocument()
  if (!value || typeof value !== 'object') return base
  return {
    ...base,
    ...cloneValue(value),
    version: 2,
    units: asString(value.units, 'meters'),
    coordinateSystem: asString(value.coordinateSystem, 'xz-ground'),
    sketchPlanes: asArray(value.sketchPlanes).map((plane, index) => ({
      id: asString(plane?.id, index === 0 ? 'plane-ground' : `plane:${index + 1}`),
      kind: asString(plane?.kind, index === 0 ? 'ground' : 'custom'),
      name: asString(plane?.name, index === 0 ? 'Ground' : `Plane ${index + 1}`),
      origin: normalizeVector3(plane?.origin),
      normal: normalizeVector3(plane?.normal, [0, 1, 0]),
      xAxis: normalizeVector3(plane?.xAxis, [1, 0, 0]),
      yAxis: normalizeVector3(plane?.yAxis, [0, 0, 1]),
    })).filter(Boolean),
    vertices: asArray(value.vertices).map((vertex, index) => ({
      id: asString(vertex?.id, `vertex:${index + 1}`),
      x: roundCoord(vertex?.x),
      y: roundCoord(vertex?.y),
      z: roundCoord(vertex?.z),
      metadata: cloneValue(vertex?.metadata || {}),
    })),
    segments: asArray(value.segments).map((segment, index) => ({
      id: asString(segment?.id, `segment:${index + 1}`),
      planeId: asString(segment?.planeId, 'plane-ground'),
      startVertexId: asString(segment?.startVertexId),
      endVertexId: asString(segment?.endVertexId),
      kind: asString(segment?.kind, 'line'),
      metadata: cloneValue(segment?.metadata || {}),
    })),
    profiles: asArray(value.profiles).map((profile, index) => ({
      id: asString(profile?.id, `profile:${index + 1}`),
      planeId: asString(profile?.planeId, 'plane-ground'),
      vertexIds: asArray(profile?.vertexIds).map((item) => asString(item)).filter(Boolean),
      segmentIds: asArray(profile?.segmentIds).map((item) => asString(item)).filter(Boolean),
      name: asString(profile?.name, `轮廓 ${index + 1}`),
      color: asString(profile?.color, '#7c93b8'),
      closed: profile?.closed !== false,
      solidId: asString(profile?.solidId, ''),
      metadata: cloneValue(profile?.metadata || {}),
    })),
    solids: asArray(value.solids).map((solid, index) => ({
      id: asString(solid?.id, `solid:${index + 1}`),
      profileId: asString(solid?.profileId),
      kind: asString(solid?.kind, 'extrude'),
      name: asString(solid?.name, `实体 ${index + 1}`),
      height: Math.max(asNumber(solid?.height, 3), 0.1),
      baseElevation: asNumber(solid?.baseElevation, 0),
      color: asString(solid?.color, '#d8dee8'),
      rotationY: asNumber(solid?.rotationY, 0),
      metadata: cloneValue(solid?.metadata || {}),
    })),
    surfaces: asArray(value.surfaces).map((surface, index) => ({
      id: asString(surface?.id, `surface:${index + 1}`),
      kind: asString(surface?.kind, 'sweep'),
      profileIds: asArray(surface?.profileIds).map((item) => asString(item)).filter(Boolean),
      pathSegmentIds: asArray(surface?.pathSegmentIds).map((item) => asString(item)).filter(Boolean),
      closed: Boolean(surface?.closed),
      meshTolerance: Math.max(asNumber(surface?.meshTolerance, DEFAULT_CURVE_TOLERANCE), 0.01),
      name: asString(surface?.name, `曲面 ${index + 1}`),
      color: asString(surface?.color, '#8ab6d6'),
      metadata: cloneValue(surface?.metadata || {}),
    })),
    instances: asArray(value.instances).map((instance, index) => ({
      id: asString(instance?.id, `instance:${index + 1}`),
      type: asString(instance?.type, 'item'),
      name: asString(instance?.name, `实例 ${index + 1}`),
      position: normalizeVector3(instance?.position),
      rotation: normalizeVector3(instance?.rotation),
      scale: normalizeVector3(instance?.scale, [1, 1, 1]),
      size: normalizeVector3(instance?.size, [1, 1, 1]),
      color: asString(instance?.color, '#8b9bb0'),
      metadata: cloneValue(instance?.metadata || {}),
    })),
    openings: asArray(value.openings).map((opening, index) => ({
      id: asString(opening?.id, `opening:${index + 1}`),
      solidId: asString(opening?.solidId),
      width: Math.max(asNumber(opening?.width, 0.9), 0.1),
      height: Math.max(asNumber(opening?.height, 2.1), 0.1),
      offset: asNumber(opening?.offset, 0),
      elevation: asNumber(opening?.elevation, 0),
      type: asString(opening?.type, 'door'),
      metadata: cloneValue(opening?.metadata || {}),
    })),
    history: asArray(value.history).map((entry, index) => ({
      id: asString(entry?.id, `history:${index + 1}`),
      label: asString(entry?.label, '编辑'),
      timestamp: asString(entry?.timestamp, new Date().toISOString()),
      metadata: cloneValue(entry?.metadata || {}),
    })),
    metadata: cloneValue(value.metadata || base.metadata),
  }
}

function ensureVertex(document, x, z, metadata = {}) {
  const planeId = asString(metadata?.planeId, '')
  const planeElevation = asNumber(metadata?.planeElevation, 0)
  const existing = document.vertices.find((vertex) => (
    pointKey(vertex.x, vertex.z, vertex.y) === pointKey(x, z, planeElevation)
      && (!planeId || asString(vertex.metadata?.planeId) === planeId)
  ))
  if (existing) return { document, vertexId: existing.id }
  const vertexId = createId('vertex')
  return {
    document: {
      ...document,
      vertices: [
        ...document.vertices,
        { id: vertexId, x: roundCoord(x), y: roundCoord(planeElevation), z: roundCoord(z), metadata: cloneValue(metadata) },
      ],
    },
    vertexId,
  }
}

function ensurePlaneVertex(document, point, plane, metadata = {}) {
  if (!plane || planeIsGroundLike(plane)) {
    return ensureVertex(document, point[0], point[1], metadata)
  }

  const planeId = asString(metadata?.planeId || plane.id, plane.id)
  const localPoint = [roundCoord(point[0]), roundCoord(point[1])]
  const worldPoint = localPointToWorld(plane, localPoint)
  const existing = document.vertices.find((vertex) => {
    if (asString(vertex.metadata?.planeId) !== planeId) return false
    const candidate = Array.isArray(vertex.metadata?.planeLocal)
      ? toPoint(vertex.metadata.planeLocal)
      : worldPointToLocal(plane, [vertex.x, vertex.y, vertex.z])
    return distance2D(candidate, localPoint) < 0.001
  })
  if (existing) return { document, vertexId: existing.id }

  const vertexId = createId('vertex')
  return {
    document: {
      ...document,
      vertices: [
        ...document.vertices,
        {
          id: vertexId,
          x: worldPoint[0],
          y: worldPoint[1],
          z: worldPoint[2],
          metadata: {
            ...cloneValue(metadata),
            planeId,
            planeLocal: localPoint,
          },
        },
      ],
    },
    vertexId,
  }
}

function findSegmentByVertices(document, startVertexId, endVertexId) {
  return document.segments.find((segment) => (
    (segment.startVertexId === startVertexId && segment.endVertexId === endVertexId)
    || (segment.startVertexId === endVertexId && segment.endVertexId === startVertexId)
  )) || null
}

function ensureSegment(document, startVertexId, endVertexId, metadata = {}, kind = 'line') {
  if (!startVertexId || !endVertexId || startVertexId === endVertexId) return { document, segmentId: null }
  const existing = findSegmentByVertices(document, startVertexId, endVertexId)
  if (existing) return { document, segmentId: existing.id }
  const segmentId = createId('segment')
  return {
    document: {
      ...document,
      segments: [
        ...document.segments,
        {
          id: segmentId,
          planeId: asString(metadata?.planeId, 'plane-ground'),
          startVertexId,
          endVertexId,
          kind,
          metadata: cloneValue(metadata),
        },
      ],
    },
    segmentId,
  }
}

function replaceProfileSplitSegment(profile, segment, firstSegmentId, secondSegmentId, splitVertexId) {
  const segmentIndex = asArray(profile.segmentIds).indexOf(segment.id)
  if (segmentIndex < 0) return profile

  const vertexIds = normalizeCycleVertexIds(profile.vertexIds)
  const segmentIds = asArray(profile.segmentIds)
  const fromVertexId = vertexIds[segmentIndex]
  const toVertexId = vertexIds[(segmentIndex + 1) % vertexIds.length]
  const reversed = fromVertexId === segment.endVertexId && toVertexId === segment.startVertexId
  const nextSegmentIds = [
    ...segmentIds.slice(0, segmentIndex),
    ...(reversed ? [secondSegmentId, firstSegmentId] : [firstSegmentId, secondSegmentId]),
    ...segmentIds.slice(segmentIndex + 1),
  ]

  if (vertexIds.includes(splitVertexId) || segmentIds.length !== vertexIds.length) {
    return { ...profile, segmentIds: nextSegmentIds }
  }

  const nextVertexIds = [
    ...vertexIds.slice(0, segmentIndex + 1),
    splitVertexId,
    ...vertexIds.slice(segmentIndex + 1),
  ]
  return { ...profile, vertexIds: nextVertexIds, segmentIds: nextSegmentIds }
}

function curveSplitMetadata(segment, startPoint, splitPoint, endPoint, t) {
  const curve = segment.metadata?.curve || {}
  if (segment.kind === 'arc') {
    const mid = normalizeCurvePoint(curve.mid, [(startPoint[0] + endPoint[0]) / 2, (startPoint[1] + endPoint[1]) / 2])
    return {
      splitPoint: arcPointAt(startPoint, mid, endPoint, t),
      firstMetadata: {
        ...(segment.metadata || {}),
        curve: { mid: arcPointAt(startPoint, mid, endPoint, t / 2) },
        splitFromSegmentId: segment.id,
      },
      secondMetadata: {
        ...(segment.metadata || {}),
        curve: { mid: arcPointAt(startPoint, mid, endPoint, (t + 1) / 2) },
        splitFromSegmentId: segment.id,
      },
    }
  }
  if (segment.kind === 'bezier') {
    const control1 = normalizeCurvePoint(curve.control1, startPoint)
    const control2 = normalizeCurvePoint(curve.control2, endPoint)
    const split = splitBezierCurve(startPoint, control1, control2, endPoint, t)
    return {
      splitPoint: split.split,
      firstMetadata: {
        ...(segment.metadata || {}),
        curve: split.first,
        splitFromSegmentId: segment.id,
      },
      secondMetadata: {
        ...(segment.metadata || {}),
        curve: split.second,
        splitFromSegmentId: segment.id,
      },
    }
  }
  return {
    splitPoint,
    firstMetadata: { ...(segment.metadata || {}), splitFromSegmentId: segment.id },
    secondMetadata: { ...(segment.metadata || {}), splitFromSegmentId: segment.id },
  }
}

function splitLineSegmentAtPoint(document, segmentId, point, options = {}) {
  const segment = document.segments.find((item) => item.id === segmentId)
  if (!segment || !['line', 'arc', 'bezier'].includes(segment.kind)) return { document, vertexId: null, split: false }
  const lookup = vertexLookup(document)
  const start = lookup.get(segment.startVertexId)
  const end = lookup.get(segment.endVertexId)
  if (!start || !end) return { document, vertexId: null, split: false }

  const plane = getSketchPlaneById(document, options.planeId || segment.planeId || segment.metadata?.planeId || 'plane-ground')
  const localStart = worldPointToLocal(plane, [start.x, start.y, start.z])
  const localEnd = worldPointToLocal(plane, [end.x, end.y, end.z])
  const projected = segment.kind === 'line'
    ? projectPointToSegment2D(point, localStart, localEnd)
    : { point, t: Math.max(0, Math.min(1, asNumber(options.curveT, 0.5))) }
  if (projected.t <= 0.001) return { document, vertexId: segment.startVertexId, split: false }
  if (projected.t >= 0.999) return { document, vertexId: segment.endVertexId, split: false }

  const curveSplit = curveSplitMetadata(segment, localStart, projected.point, localEnd, projected.t)
  const vertexResult = ensurePlaneVertex(document, curveSplit.splitPoint, plane, {
    role: 'edge-split-vertex',
    planeId: options.planeId || segment.planeId || segment.metadata?.planeId,
    planeElevation: options.planeElevation ?? segment.metadata?.planeElevation,
    planeLocal: curveSplit.splitPoint,
    sourceSegmentId: segment.id,
  })
  const splitVertexId = vertexResult.vertexId
  const firstSegmentId = createId('segment')
  const secondSegmentId = createId('segment')
  const firstSegment = {
    ...segment,
    id: firstSegmentId,
    endVertexId: splitVertexId,
    metadata: curveSplit.firstMetadata,
  }
  const secondSegment = {
    ...segment,
    id: secondSegmentId,
    startVertexId: splitVertexId,
    metadata: curveSplit.secondMetadata,
  }
  const withSplit = {
    ...vertexResult.document,
    segments: vertexResult.document.segments.flatMap((item) => (item.id === segment.id ? [firstSegment, secondSegment] : [item])),
    profiles: vertexResult.document.profiles.map((profile) => replaceProfileSplitSegment(profile, segment, firstSegmentId, secondSegmentId, splitVertexId)),
    surfaces: vertexResult.document.surfaces.map((surface) => ({
      ...surface,
      pathSegmentIds: asArray(surface.pathSegmentIds).flatMap((id) => (id === segment.id ? [firstSegmentId, secondSegmentId] : [id])),
    })),
  }
  return { document: withSplit, vertexId: splitVertexId, segmentIds: [firstSegmentId, secondSegmentId], split: true }
}

function appendSegment(document, startVertexId, endVertexId, metadata = {}, kind = 'line') {
  if (!startVertexId || !endVertexId || startVertexId === endVertexId) return { document, segmentId: null }
  const segmentId = createId('segment')
  return {
    document: {
      ...document,
      segments: [
        ...document.segments,
        {
          id: segmentId,
          planeId: asString(metadata?.planeId, 'plane-ground'),
          startVertexId,
          endVertexId,
          kind,
          metadata: cloneValue(metadata),
        },
      ],
    },
    segmentId,
  }
}

function sampledStepCount(length, tolerance = DEFAULT_CURVE_TOLERANCE, minimum = 8, maximum = 96) {
  return Math.max(minimum, Math.min(maximum, Math.ceil(Math.max(length, tolerance) / Math.max(tolerance, 0.01))))
}

function cubicBezierPoint(start, control1, control2, end, t) {
  const inv = 1 - t
  return [
    (inv ** 3) * start[0] + 3 * (inv ** 2) * t * control1[0] + 3 * inv * (t ** 2) * control2[0] + (t ** 3) * end[0],
    (inv ** 3) * start[1] + 3 * (inv ** 2) * t * control1[1] + 3 * inv * (t ** 2) * control2[1] + (t ** 3) * end[1],
  ]
}

function circleFromThreePoints(start, mid, end) {
  const ax = start[0]
  const ay = start[1]
  const bx = mid[0]
  const by = mid[1]
  const cx = end[0]
  const cy = end[1]
  const denominator = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
  if (Math.abs(denominator) < 1e-6) return null
  const ux = (((ax * ax + ay * ay) * (by - cy)) + ((bx * bx + by * by) * (cy - ay)) + ((cx * cx + cy * cy) * (ay - by))) / denominator
  const uy = (((ax * ax + ay * ay) * (cx - bx)) + ((bx * bx + by * by) * (ax - cx)) + ((cx * cx + cy * cy) * (bx - ax))) / denominator
  return {
    center: [ux, uy],
    radius: Math.hypot(ax - ux, ay - uy),
  }
}

function angleDeltaThroughMid(startAngle, midAngle, endAngle) {
  const normalize = (angle) => ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  const ccw = (normalize(endAngle) - normalize(startAngle) + Math.PI * 2) % (Math.PI * 2)
  const midCcw = (normalize(midAngle) - normalize(startAngle) + Math.PI * 2) % (Math.PI * 2)
  if (midCcw > 0 && midCcw < ccw) return ccw
  return ccw - Math.PI * 2
}

function sampleArc2D(start, mid, end, tolerance = DEFAULT_CURVE_TOLERANCE) {
  const circle = circleFromThreePoints(start, mid, end)
  if (!circle || circle.radius < 0.001) return [start, end]
  const startAngle = Math.atan2(start[1] - circle.center[1], start[0] - circle.center[0])
  const midAngle = Math.atan2(mid[1] - circle.center[1], mid[0] - circle.center[0])
  const endAngle = Math.atan2(end[1] - circle.center[1], end[0] - circle.center[0])
  const delta = angleDeltaThroughMid(startAngle, midAngle, endAngle)
  const count = sampledStepCount(Math.abs(delta) * circle.radius, tolerance, 6)
  const points = []
  for (let index = 0; index <= count; index += 1) {
    const t = index / count
    const angle = startAngle + delta * t
    points.push([roundCoord(circle.center[0] + Math.cos(angle) * circle.radius), roundCoord(circle.center[1] + Math.sin(angle) * circle.radius)])
  }
  return points
}

function arcPointAt(start, mid, end, t) {
  const circle = circleFromThreePoints(start, mid, end)
  if (!circle || circle.radius < 0.001) {
    return [
      roundCoord(start[0] + (end[0] - start[0]) * t),
      roundCoord(start[1] + (end[1] - start[1]) * t),
    ]
  }
  const startAngle = Math.atan2(start[1] - circle.center[1], start[0] - circle.center[0])
  const midAngle = Math.atan2(mid[1] - circle.center[1], mid[0] - circle.center[0])
  const endAngle = Math.atan2(end[1] - circle.center[1], end[0] - circle.center[0])
  const angle = startAngle + angleDeltaThroughMid(startAngle, midAngle, endAngle) * Math.max(0, Math.min(1, t))
  return [roundCoord(circle.center[0] + Math.cos(angle) * circle.radius), roundCoord(circle.center[1] + Math.sin(angle) * circle.radius)]
}

function lerpPoint(left, right, t) {
  return [
    left[0] + (right[0] - left[0]) * t,
    left[1] + (right[1] - left[1]) * t,
  ]
}

function splitBezierCurve(start, control1, control2, end, t) {
  const p01 = lerpPoint(start, control1, t)
  const p12 = lerpPoint(control1, control2, t)
  const p23 = lerpPoint(control2, end, t)
  const p012 = lerpPoint(p01, p12, t)
  const p123 = lerpPoint(p12, p23, t)
  const split = lerpPoint(p012, p123, t)
  return {
    split: [roundCoord(split[0]), roundCoord(split[1])],
    first: {
      control1: [roundCoord(p01[0]), roundCoord(p01[1])],
      control2: [roundCoord(p012[0]), roundCoord(p012[1])],
    },
    second: {
      control1: [roundCoord(p123[0]), roundCoord(p123[1])],
      control2: [roundCoord(p23[0]), roundCoord(p23[1])],
    },
  }
}

export function sampleSegment(document, segment, tolerance = DEFAULT_CURVE_TOLERANCE) {
  const normalized = normalizeEditorDocument(document)
  const lookup = vertexLookup(normalized)
  const start = lookup.get(segment?.startVertexId)
  const end = lookup.get(segment?.endVertexId)
  if (!start || !end) return []
  const plane = getSketchPlaneById(normalized, segment?.planeId || segment?.metadata?.planeId || 'plane-ground')
  const startPoint = worldPointToLocal(plane, [start.x, start.y, start.z])
  const endPoint = worldPointToLocal(plane, [end.x, end.y, end.z])
  const curve = segment?.metadata?.curve || {}
  if (segment.kind === 'arc') {
    return sampleArc2D(
      startPoint,
      normalizeCurvePoint(curve.mid, [(startPoint[0] + endPoint[0]) / 2, (startPoint[1] + endPoint[1]) / 2]),
      endPoint,
      tolerance,
    )
  }
  if (segment.kind === 'bezier') {
    const control1 = normalizeCurvePoint(curve.control1, startPoint)
    const control2 = normalizeCurvePoint(curve.control2, endPoint)
    const lengthHint = distance2D(startPoint, control1) + distance2D(control1, control2) + distance2D(control2, endPoint)
    const count = sampledStepCount(lengthHint, tolerance, 8)
    const points = []
    for (let index = 0; index <= count; index += 1) {
      const point = cubicBezierPoint(startPoint, control1, control2, endPoint, index / count)
      points.push([roundCoord(point[0]), roundCoord(point[1])])
    }
    return points
  }
  return [startPoint, endPoint]
}

export function sampleSegment3D(document, segment, tolerance = DEFAULT_CURVE_TOLERANCE) {
  const normalized = normalizeEditorDocument(document)
  const lookup = vertexLookup(normalized)
  const start = lookup.get(segment?.startVertexId)
  const end = lookup.get(segment?.endVertexId)
  if (!start || !end) return []
  if (segment.kind === 'line') return [[start.x, start.y, start.z], [end.x, end.y, end.z]]
  const plane = getSketchPlaneById(normalized, segment?.planeId || segment?.metadata?.planeId || 'plane-ground')
  const sampled2D = sampleSegment(normalized, segment, tolerance)
  if (!sampled2D.length) return []
  if (!planeIsGroundLike(plane)) return sampled2D.map((point) => localPointToWorld(plane, point))
  return sampled2D.map((point, index) => {
    const t = sampled2D.length <= 1 ? 0 : index / (sampled2D.length - 1)
    return [point[0], roundCoord(start.y + (end.y - start.y) * t), point[1]]
  })
}

function sampleProfilePoints(document, profile, tolerance = DEFAULT_CURVE_TOLERANCE) {
  const normalized = normalizeEditorDocument(document)
  const lookup = vertexLookup(normalized)
  const byId = new Map(normalized.segments.map((segment) => [segment.id, segment]))
  const sampled = []
  if (profile?.segmentIds?.length) {
    const vertexIds = normalizeCycleVertexIds(profile.vertexIds)
    profile.segmentIds.forEach((segmentId, segmentIndex) => {
      const segment = byId.get(segmentId)
      let points = segment ? sampleSegment(normalized, segment, tolerance) : []
      if (segment && vertexIds.length === profile.segmentIds.length) {
        const fromVertexId = vertexIds[segmentIndex]
        const toVertexId = vertexIds[(segmentIndex + 1) % vertexIds.length]
        if (segment.startVertexId === toVertexId && segment.endVertexId === fromVertexId) {
          points = [...points].reverse()
        }
      }
      points.forEach((point, index) => {
        if (sampled.length && index === 0 && distance2D(sampled[sampled.length - 1], point) < 0.001) return
        sampled.push(point)
      })
    })
  }
  if (sampled.length >= 3) {
    const first = sampled[0]
    const last = sampled[sampled.length - 1]
    return distance2D(first, last) < 0.001 ? sampled.slice(0, -1) : sampled
  }
  return asArray(profile?.vertexIds)
    .map((vertexId) => lookup.get(vertexId))
    .filter(Boolean)
    .map((vertex) => {
      const plane = getSketchPlaneById(normalized, profile?.planeId || vertex.metadata?.planeId || 'plane-ground')
      return worldPointToLocal(plane, [vertex.x, vertex.y, vertex.z])
    })
}

export function sampleProfile(document, profileId, tolerance = DEFAULT_CURVE_TOLERANCE) {
  const normalized = normalizeEditorDocument(document)
  const profile = normalized.profiles.find((item) => item.id === profileId)
  return profile ? sampleProfilePoints(normalized, profile, tolerance) : []
}

function ensureSketchPlane(document, options = {}) {
  const normalized = normalizeEditorDocument(document)
  const requestedPlane = planeDefinitionFromOptions(options)
  if (!requestedPlane) {
    return { document: normalized, plane: getSketchPlaneById(normalized, 'plane-ground') }
  }

  const nextPlaneId = asString(requestedPlane.id, requestedPlane.origin[1] === 0 ? 'plane-ground' : `plane-elev-${roundCoord(requestedPlane.origin[1])}`)
  const existing = normalized.sketchPlanes.find((plane) => plane.id === nextPlaneId)
  if (existing) {
    return { document: normalized, plane: existing }
  }

  const plane = {
    ...requestedPlane,
    id: nextPlaneId,
  }

  return {
    document: {
      ...normalized,
      sketchPlanes: [...normalized.sketchPlanes, plane],
    },
    plane,
  }
}

function normalizeCycleVertexIds(vertexIds) {
  const normalized = asArray(vertexIds).map((item) => asString(item)).filter(Boolean)
  if (normalized.length > 1 && normalized[0] === normalized[normalized.length - 1]) {
    return normalized.slice(0, -1)
  }
  return normalized
}

function cycleSequenceKey(items, minLength = 3) {
  const normalized = asArray(items).map((item) => asString(item)).filter(Boolean)
  if (normalized.length < minLength) return ''

  const variants = []
  const reversed = [...normalized].reverse()

  for (let index = 0; index < normalized.length; index += 1) {
    variants.push([...normalized.slice(index), ...normalized.slice(0, index)].join('|'))
    variants.push([...reversed.slice(index), ...reversed.slice(0, index)].join('|'))
  }

  variants.sort()
  return variants[0]
}

function cycleKey(vertexIds) {
  return cycleSequenceKey(normalizeCycleVertexIds(vertexIds), 3)
}

function profileMatchesCycle(document, vertexIds) {
  const nextKey = cycleKey(vertexIds)
  if (!nextKey) return null
  return document.profiles.find((profile) => cycleKey(profile.vertexIds) === nextKey) || null
}

function buildAdjacency(document, excludedSegmentIds = new Set()) {
  const adjacency = new Map()

  const link = (from, to, segmentId) => {
    if (!from || !to) return
    if (!adjacency.has(from)) adjacency.set(from, [])
    adjacency.get(from).push({ vertexId: to, segmentId })
  }

  document.segments.forEach((segment) => {
    if (excludedSegmentIds.has(segment.id)) return
    link(segment.startVertexId, segment.endVertexId, segment.id)
    link(segment.endVertexId, segment.startVertexId, segment.id)
  })

  return adjacency
}

function findSimplePaths(document, startVertexId, endVertexId, excludedSegmentIds = new Set(), { maxPaths = 6, maxDepth = 24 } = {}) {
  if (!startVertexId || !endVertexId || startVertexId === endVertexId) return []
  const adjacency = buildAdjacency(document, excludedSegmentIds)
  const results = []

  const walk = (currentVertexId, vertexIds, segmentIds, visited) => {
    if (results.length >= maxPaths) return
    if (segmentIds.length > maxDepth) return
    if (currentVertexId === endVertexId) {
      results.push({ vertexIds: [...vertexIds], segmentIds: [...segmentIds] })
      return
    }

    const neighbours = adjacency.get(currentVertexId) || []
    for (const neighbour of neighbours) {
      if (visited.has(neighbour.vertexId)) continue
      visited.add(neighbour.vertexId)
      vertexIds.push(neighbour.vertexId)
      segmentIds.push(neighbour.segmentId)
      walk(neighbour.vertexId, vertexIds, segmentIds, visited)
      segmentIds.pop()
      vertexIds.pop()
      visited.delete(neighbour.vertexId)
      if (results.length >= maxPaths) return
    }
  }

  walk(startVertexId, [startVertexId], [], new Set([startVertexId]))
  return results
}

function pointOnSegment(point, start, end, tolerance = 0.001) {
  const cross = Math.abs((end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0]))
  if (cross > tolerance) return false
  const dot = (point[0] - start[0]) * (end[0] - start[0]) + (point[1] - start[1]) * (end[1] - start[1])
  if (dot < -tolerance) return false
  const squaredLength = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2
  if (dot - squaredLength > tolerance) return false
  return true
}

function pointInPolygon(point, polygon) {
  let inside = false

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index]
    const prior = polygon[previous]

    if (pointOnSegment(point, current, prior)) return true

    const intersects = ((current[1] > point[1]) !== (prior[1] > point[1]))
      && (point[0] < ((prior[0] - current[0]) * (point[1] - current[1])) / ((prior[1] - current[1]) || Number.EPSILON) + current[0])

    if (intersects) inside = !inside
  }

  return inside
}

function polygonCentroid(points) {
  const total = points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0])
  return [total[0] / points.length, total[1] / points.length]
}

function projectPointToSegment2D(point, start, end) {
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared <= 1e-6) {
    return { point: [...start], t: 0, distance: Math.hypot(point[0] - start[0], point[1] - start[1]) }
  }
  const rawT = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / lengthSquared
  const t = Math.max(0, Math.min(1, rawT))
  const projected = [start[0] + dx * t, start[1] + dz * t]
  return {
    point: projected,
    t,
    distance: Math.hypot(point[0] - projected[0], point[1] - projected[1]),
  }
}

function edgeInfoFromPoints(points) {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length]
    const length = Math.hypot(next[0] - point[0], next[1] - point[1])
    return {
      index,
      start: point,
      end: next,
      length,
      midpoint: [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2],
    }
  })
}

function oppositeEdgeIndex(index, count) {
  if (count % 2 !== 0) return null
  return (index + count / 2) % count
}

function createProfileFromVertexIds(document, vertexIds, options = {}) {
  const planeResult = ensureSketchPlane(document, options)
  let nextDocument = planeResult.document
  const plane = planeResult.plane
  const planeId = plane.id
  const planeElevation = asNumber(plane.origin?.[1], 0)
  const normalizedVertexIds = normalizeCycleVertexIds(vertexIds)
  const segmentIds = asArray(options.segmentIds).map((item) => asString(item)).filter(Boolean)
  if (normalizedVertexIds.length < 3 && segmentIds.length < 2) {
    return { document: nextDocument, profileId: null, solidId: null, error: '至少需要三个顶点', duplicate: false }
  }

  const vertexCycleKey = cycleKey(normalizedVertexIds)
  const segmentCycleKey = cycleSequenceKey(segmentIds, 2)
  const existingProfile = nextDocument.profiles.find((profile) => (
    profile.planeId === planeId
    && (
      (vertexCycleKey && cycleKey(profile.vertexIds) === vertexCycleKey)
      || (segmentCycleKey && cycleSequenceKey(profile.segmentIds, 2) === segmentCycleKey)
    )
  ))
  if (existingProfile) {
    return { document: nextDocument, profileId: existingProfile.id, solidId: existingProfile.solidId || null, error: null, duplicate: true }
  }

  const lookup = vertexLookup(nextDocument)
  const localVertexPoints = normalizedVertexIds.map((vertexId) => lookup.get(vertexId)).filter(Boolean).map((vertex) => (
    worldPointToLocal(plane, [vertex.x, vertex.y, vertex.z])
  ))
  const points = options.segmentIds?.length
    ? sampleProfilePoints(nextDocument, { vertexIds: normalizedVertexIds, segmentIds: options.segmentIds }, options.meshTolerance || DEFAULT_CURVE_TOLERANCE)
    : localVertexPoints
  const validation = validatePolygon(points)
  if ((!options.segmentIds?.length && points.length !== normalizedVertexIds.length) || !validation.valid) {
    return { document: nextDocument, profileId: null, solidId: null, error: validation.reason || '轮廓无效', duplicate: false }
  }

  if (!segmentIds.length) {
    for (let index = 0; index < normalizedVertexIds.length; index += 1) {
      const segmentResult = ensureSegment(
        nextDocument,
        normalizedVertexIds[index],
        normalizedVertexIds[(index + 1) % normalizedVertexIds.length],
        { compatType: options.compatType || 'zone', sketchMode: options.sketchMode || 'line', planeId, planeElevation },
        'line',
      )
      nextDocument = segmentResult.document
      if (segmentResult.segmentId) segmentIds.push(segmentResult.segmentId)
    }
  }

  const profileId = createId('profile')
  const profile = {
    id: profileId,
    planeId,
    vertexIds: normalizedVertexIds,
    segmentIds,
    name: options.name || `轮廓 ${nextDocument.profiles.length + 1}`,
    color: options.color || '#7c93b8',
    closed: true,
    solidId: '',
    metadata: cloneValue(options.metadata || {}),
  }

  nextDocument = {
    ...nextDocument,
    profiles: [...nextDocument.profiles, profile],
  }

  if (!options.solidHeight) {
    return { document: nextDocument, profileId, solidId: null, error: null, duplicate: false }
  }

  const solidId = createId('solid')
  nextDocument = {
    ...nextDocument,
    profiles: nextDocument.profiles.map((item) => (item.id === profileId ? { ...item, solidId } : item)),
    solids: [
      ...nextDocument.solids,
      {
        id: solidId,
        profileId,
        kind: 'extrude',
        name: profile.name,
        height: Math.max(asNumber(options.solidHeight, 3), 0.1),
        baseElevation: planeElevation,
        color: options.solidColor || '#d8dee8',
        rotationY: 0,
        metadata: cloneValue(options.metadata || {}),
      },
    ],
  }

  return { document: nextDocument, profileId, solidId, error: null, duplicate: false }
}

function cleanupSplitProfiles(document, createdProfileIds) {
  if (createdProfileIds.length < 2) return document
  const lookup = vertexLookup(document)
  const createdProfiles = createdProfileIds
    .map((profileId) => document.profiles.find((profile) => profile.id === profileId))
    .filter((profile) => profile && !profile.solidId)

  if (createdProfiles.length < 2) return document

  const createdEntries = createdProfiles.map((profile) => ({
    profile,
    points: profilePoints(profile, lookup),
    area: polygonArea(profilePoints(profile, lookup)),
  })).filter((entry) => entry.points.length >= 3)

  const removableIds = document.profiles.filter((profile) => !profile.solidId && !createdProfileIds.includes(profile.id)).filter((profile) => {
    const containerPoints = profilePoints(profile, lookup)
    if (containerPoints.length < 3) return false
    const containerArea = polygonArea(containerPoints)
    if (containerArea < 0.01) return false

    const containedEntries = createdEntries.filter((entry) => {
      const centroid = polygonCentroid(entry.points)
      if (!pointInPolygon(centroid, containerPoints)) return false
      return entry.points.every((point) => pointInPolygon(point, containerPoints))
    })

    if (containedEntries.length < 2) return false
    const totalArea = containedEntries.reduce((sum, entry) => sum + entry.area, 0)
    return Math.abs(totalArea - containerArea) <= Math.max(0.01, containerArea * 0.02)
  }).map((profile) => profile.id)

  if (!removableIds.length) return document

  return {
    ...document,
    profiles: document.profiles.filter((profile) => !removableIds.includes(profile.id)),
  }
}

function cycleVerticesBetween(vertexIds, startIndex, endIndex) {
  const result = []
  for (let index = startIndex; ; index = (index + 1) % vertexIds.length) {
    result.push(vertexIds[index])
    if (index === endIndex) break
  }
  return result
}

function cycleSegmentsBetween(segmentIds, startIndex, endIndex) {
  const result = []
  for (let index = startIndex; index !== endIndex; index = (index + 1) % segmentIds.length) {
    result.push(segmentIds[index])
  }
  return result
}

function splitBoundaryProfilesByChord(document, newVertexIds, newSegmentIds, options = {}) {
  if (newVertexIds.length !== 2 || newSegmentIds.length !== 1) {
    return { document, profileIds: [], errors: [] }
  }

  const startVertexId = newVertexIds[0]
  const endVertexId = newVertexIds[1]
  const chordSegmentId = newSegmentIds[0]
  let nextDocument = document
  const profileIds = []
  const removedProfileIds = []
  const errors = []

  document.profiles.forEach((profile) => {
    if (profile.solidId) return
    if (options.planeId && profile.planeId !== options.planeId) return

    const vertexIds = normalizeCycleVertexIds(profile.vertexIds)
    const segmentIds = asArray(profile.segmentIds).map((item) => asString(item)).filter(Boolean)
    if (vertexIds.length < 4 || segmentIds.length !== vertexIds.length) return

    const startIndex = vertexIds.indexOf(startVertexId)
    const endIndex = vertexIds.indexOf(endVertexId)
    if (startIndex < 0 || endIndex < 0 || startIndex === endIndex) return

    const firstVertexIds = cycleVerticesBetween(vertexIds, startIndex, endIndex)
    const secondVertexIds = cycleVerticesBetween(vertexIds, endIndex, startIndex)
    if (firstVertexIds.length < 3 || secondVertexIds.length < 3) return

    const firstSegmentIds = [...cycleSegmentsBetween(segmentIds, startIndex, endIndex), chordSegmentId]
    const secondSegmentIds = [...cycleSegmentsBetween(segmentIds, endIndex, startIndex), chordSegmentId]

    const first = createProfileFromVertexIds(nextDocument, firstVertexIds, {
      ...options,
      segmentIds: firstSegmentIds,
      metadata: {
        ...(options.metadata || {}),
        autoClosed: true,
        splitFromProfileId: profile.id,
        sourceSegmentIds: [chordSegmentId],
      },
    })
    nextDocument = first.document
    if (first.error) {
      errors.push(first.error)
      return
    }

    const second = createProfileFromVertexIds(nextDocument, secondVertexIds, {
      ...options,
      segmentIds: secondSegmentIds,
      metadata: {
        ...(options.metadata || {}),
        autoClosed: true,
        splitFromProfileId: profile.id,
        sourceSegmentIds: [chordSegmentId],
      },
    })
    nextDocument = second.document
    if (second.error) {
      errors.push(second.error)
      return
    }

    const createdIds = [first.profileId, second.profileId].filter(Boolean)
    if (createdIds.length === 2) {
      profileIds.push(...createdIds)
      removedProfileIds.push(profile.id)
    }
  })

  if (removedProfileIds.length) {
    const removed = new Set(removedProfileIds)
    nextDocument = {
      ...nextDocument,
      profiles: nextDocument.profiles.filter((profile) => !removed.has(profile.id)),
    }
  }

  return {
    document: nextDocument,
    profileIds: [...new Set(profileIds)],
    errors,
  }
}

function wallBoundsForPlane(document, planeId) {
  const edgeKey = (start, end) => {
    const startFirst = start[0] < end[0] || (start[0] === end[0] && start[1] <= end[1])
    const first = startFirst ? start : end
    const second = startFirst ? end : start
    return `${first[0]}:${first[1]}|${second[0]}:${second[1]}`
  }
  const profileById = new Map(document.profiles.map((profile) => [profile.id, profile]))
  const wallLines = []
  const footprintPoints = []
  document.solids.forEach((solid) => {
    const profile = profileById.get(solid.profileId)
    if (!profile) return
    if (planeId && profile.planeId !== planeId) return
    if ((solid.metadata?.compatType || profile.metadata?.compatType) !== 'wall') return
    normalizeCycleVertexIds(profile.vertexIds).forEach((vertexId) => {
      const vertex = document.vertices.find((item) => item.id === vertexId)
      if (vertex) footprintPoints.push([roundCoord(vertex.x), roundCoord(vertex.z)])
    })
    const centerline = solid.metadata?.centerline || profile.metadata?.centerline
    if (!centerline?.start || !centerline?.end) return
    wallLines.push({
      start: [roundCoord(centerline.start[0]), roundCoord(centerline.start[1])],
      end: [roundCoord(centerline.end[0]), roundCoord(centerline.end[1])],
    })
  })
  if (wallLines.length !== 4) return null

  const points = wallLines.flatMap((line) => [line.start, line.end])
  const xs = [...new Set(points.map((point) => roundCoord(point[0])))]
  const zs = [...new Set(points.map((point) => roundCoord(point[1])))]
  if (xs.length !== 2 || zs.length !== 2) return null

  const [minX, maxX] = xs.sort((left, right) => left - right)
  const [minZ, maxZ] = zs.sort((left, right) => left - right)
  const requiredEdges = new Set([
    edgeKey([minX, minZ], [maxX, minZ]),
    edgeKey([maxX, minZ], [maxX, maxZ]),
    edgeKey([maxX, maxZ], [minX, maxZ]),
    edgeKey([minX, maxZ], [minX, minZ]),
  ])
  const actualEdges = new Set(wallLines.map((line) => {
    const horizontal = Math.abs(line.start[1] - line.end[1]) < 0.001
    const vertical = Math.abs(line.start[0] - line.end[0]) < 0.001
    if (!horizontal && !vertical) return ''
    return edgeKey(line.start, line.end)
  }))
  if ([...requiredEdges].some((edge) => !actualEdges.has(edge))) return null

  if (!footprintPoints.length) return { minX, maxX, minZ, maxZ }
  const footprintXs = footprintPoints.map((point) => point[0])
  const footprintZs = footprintPoints.map((point) => point[1])
  return {
    minX: Math.min(...footprintXs),
    maxX: Math.max(...footprintXs),
    minZ: Math.min(...footprintZs),
    maxZ: Math.max(...footprintZs),
  }
}

function projectPointToRectBoundary(point, bounds, tolerance = 0.8) {
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  if (width < 0.5 || depth < 0.5) return null

  const candidates = [
    {
      side: 'top',
      point: [Math.max(bounds.minX, Math.min(bounds.maxX, point[0])), bounds.minZ],
      distance: Math.abs(point[1] - bounds.minZ),
      t: Math.max(0, Math.min(width, point[0] - bounds.minX)),
    },
    {
      side: 'right',
      point: [bounds.maxX, Math.max(bounds.minZ, Math.min(bounds.maxZ, point[1]))],
      distance: Math.abs(point[0] - bounds.maxX),
      t: width + Math.max(0, Math.min(depth, point[1] - bounds.minZ)),
    },
    {
      side: 'bottom',
      point: [Math.max(bounds.minX, Math.min(bounds.maxX, point[0])), bounds.maxZ],
      distance: Math.abs(point[1] - bounds.maxZ),
      t: width + depth + Math.max(0, Math.min(width, bounds.maxX - point[0])),
    },
    {
      side: 'left',
      point: [bounds.minX, Math.max(bounds.minZ, Math.min(bounds.maxZ, point[1]))],
      distance: Math.abs(point[0] - bounds.minX),
      t: width * 2 + depth + Math.max(0, Math.min(depth, bounds.maxZ - point[1])),
    },
  ].map((candidate) => ({
    ...candidate,
    distance: Math.hypot(point[0] - candidate.point[0], point[1] - candidate.point[1]),
  })).sort((left, right) => left.distance - right.distance)

  const best = candidates[0]
  return best?.distance <= tolerance ? best : null
}

function canMoveChordEndpoint(document, vertexId, newSegmentIds) {
  const allowed = new Set(newSegmentIds)
  return !document.segments.some((segment) => (
    (segment.startVertexId === vertexId || segment.endVertexId === vertexId)
    && !allowed.has(segment.id)
  ))
}

function moveVertexTo2D(document, vertexId, point, planeElevation = 0) {
  return {
    ...document,
    vertices: document.vertices.map((vertex) => (
      vertex.id === vertexId
        ? { ...vertex, x: roundCoord(point[0]), y: roundCoord(planeElevation), z: roundCoord(point[1]) }
        : vertex
    )),
  }
}

function rectBoundaryParameter(point, bounds) {
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  if (Math.abs(point[1] - bounds.minZ) < 0.001) return Math.max(0, Math.min(width, point[0] - bounds.minX))
  if (Math.abs(point[0] - bounds.maxX) < 0.001) return width + Math.max(0, Math.min(depth, point[1] - bounds.minZ))
  if (Math.abs(point[1] - bounds.maxZ) < 0.001) return width + depth + Math.max(0, Math.min(width, bounds.maxX - point[0]))
  return width * 2 + depth + Math.max(0, Math.min(depth, bounds.maxZ - point[1]))
}

function createImpliedWallBoundarySplit(document, newVertexIds, newSegmentIds, options = {}) {
  if (newVertexIds.length !== 2 || newSegmentIds.length !== 1) {
    return { document, profileIds: [], errors: [] }
  }

  const bounds = wallBoundsForPlane(document, options.planeId)
  if (!bounds) return { document, profileIds: [], errors: [] }

  const planeElevation = asNumber(options.planeElevation, 0)
  const lookup = vertexLookup(document)
  let nextDocument = document
  const endpointItems = []

  for (const vertexId of newVertexIds) {
    const vertex = lookup.get(vertexId)
    if (!vertex) return { document, profileIds: [], errors: [] }
    const projected = projectPointToRectBoundary([vertex.x, vertex.z], bounds, options.impliedBoundaryTolerance ?? 1.2)
    if (!projected) return { document, profileIds: [], errors: [] }
    const projectedPoint = projected.point
    const alreadyOnBoundary = distance2D([vertex.x, vertex.z], projectedPoint) < 0.001
    let boundaryPoint = [vertex.x, vertex.z]
    if (!alreadyOnBoundary) {
      if (canMoveChordEndpoint(nextDocument, vertexId, newSegmentIds)) {
        nextDocument = moveVertexTo2D(nextDocument, vertexId, projectedPoint, planeElevation)
        boundaryPoint = projectedPoint
      }
    } else {
      boundaryPoint = projectedPoint
    }
    endpointItems.push({
      id: vertexId,
      point: boundaryPoint,
      t: rectBoundaryParameter(projectedPoint, bounds),
    })
  }

  if (Math.abs(endpointItems[0].t - endpointItems[1].t) < 0.001) {
    return { document, profileIds: [], errors: [] }
  }

  const corners = [
    { point: [bounds.minX, bounds.minZ], t: 0 },
    { point: [bounds.maxX, bounds.minZ], t: bounds.maxX - bounds.minX },
    { point: [bounds.maxX, bounds.maxZ], t: (bounds.maxX - bounds.minX) + (bounds.maxZ - bounds.minZ) },
    { point: [bounds.minX, bounds.maxZ], t: (bounds.maxX - bounds.minX) * 2 + (bounds.maxZ - bounds.minZ) },
  ]

  const boundaryItems = [...corners, ...endpointItems].sort((left, right) => left.t - right.t)
  const boundaryVertexIds = []
  boundaryItems.forEach((item) => {
    const existingEndpoint = endpointItems.find((endpoint) => distance2D(endpoint.point, item.point) < 0.001)
    if (existingEndpoint) {
      if (!boundaryVertexIds.includes(existingEndpoint.id)) boundaryVertexIds.push(existingEndpoint.id)
      return
    }
    const vertexResult = ensureVertex(nextDocument, item.point[0], item.point[1], {
      role: 'implied-wall-boundary-vertex',
      planeId: options.planeId || 'plane-ground',
      planeElevation,
    })
    nextDocument = vertexResult.document
    if (!boundaryVertexIds.includes(vertexResult.vertexId)) boundaryVertexIds.push(vertexResult.vertexId)
  })

  if (boundaryVertexIds.length < 4) return { document, profileIds: [], errors: [] }

  const boundary = createProfileFromVertexIds(nextDocument, boundaryVertexIds, {
    ...options,
    name: options.name || '自动地面切面',
    compatType: options.compatType || 'zone',
    metadata: {
      ...(options.metadata || {}),
      autoCreatedFromWallBoundary: true,
      sourceSegmentIds: [...newSegmentIds],
    },
  })
  nextDocument = boundary.document
  if (boundary.error || !boundary.profileId) {
    return { document: nextDocument, profileIds: [], errors: boundary.error ? [boundary.error] : [] }
  }

  return splitBoundaryProfilesByChord(nextDocument, newVertexIds, newSegmentIds, {
    ...options,
    metadata: {
      ...(options.metadata || {}),
      autoCreatedFromWallBoundary: true,
      sourceSegmentIds: [...newSegmentIds],
    },
  })
}

function autoCreateProfilesFromOpenPath(document, newVertexIds, newSegmentIds, options = {}) {
  if (newVertexIds.length < 2 || newSegmentIds.length === 0) {
    return { document, profileIds: [], errors: [] }
  }

  const startVertexId = newVertexIds[0]
  const endVertexId = newVertexIds[newVertexIds.length - 1]
  const pathCandidates = findSimplePaths(document, startVertexId, endVertexId, new Set(newSegmentIds), {
    maxPaths: 8,
    maxDepth: Math.max(document.segments.length, 12),
  })

  let nextDocument = document
  const profileIds = []
  const errors = []

  pathCandidates.forEach((candidate) => {
    const ringVertexIds = [
      ...newVertexIds,
      ...candidate.vertexIds.slice(1, -1).reverse(),
    ]
    const ringSegmentIds = [
      ...newSegmentIds,
      ...candidate.segmentIds.slice().reverse(),
    ]

    const result = createProfileFromVertexIds(nextDocument, ringVertexIds, {
      ...options,
      segmentIds: ringSegmentIds,
      metadata: {
        ...(options.metadata || {}),
        autoClosed: true,
        autoClosedByEdgeNetwork: true,
        sourceSegmentIds: [...newSegmentIds],
      },
    })

    nextDocument = result.document
    if (result.error) {
      errors.push(result.error)
      return
    }
    if (!result.duplicate && result.profileId) {
      profileIds.push(result.profileId)
    }
  })

  if (profileIds.length >= 2) {
    nextDocument = cleanupSplitProfiles(nextDocument, profileIds)
  }

  if (profileIds.length < 2) {
    const boundarySplit = splitBoundaryProfilesByChord(nextDocument, newVertexIds, newSegmentIds, options)
    nextDocument = boundarySplit.document
    profileIds.push(...boundarySplit.profileIds)
    errors.push(...boundarySplit.errors)
  }

  if (profileIds.length < 2) {
    const impliedBoundarySplit = createImpliedWallBoundarySplit(nextDocument, newVertexIds, newSegmentIds, options)
    nextDocument = impliedBoundarySplit.document
    profileIds.push(...impliedBoundarySplit.profileIds)
    errors.push(...impliedBoundarySplit.errors)
  }

  return {
    document: nextDocument,
    profileIds: [...new Set(profileIds)],
    errors,
  }
}

function createProfile(document, points, options = {}) {
  const validation = validatePolygon(points)
  if (!validation.valid) {
    return { document, profileId: null, solidId: null, error: validation.reason }
  }

  const planeResult = ensureSketchPlane(document, options)
  let nextDocument = planeResult.document
  const plane = planeResult.plane
  const planeId = plane.id
  const planeElevation = asNumber(plane.origin?.[1], 0)
  const vertexIds = []

  for (const [index, point] of points.entries()) {
    const vertexResult = ensurePlaneVertex(nextDocument, point, plane, {
      pointIndex: index,
      role: 'profile-vertex',
      planeId,
      planeElevation,
    })
    nextDocument = vertexResult.document
    vertexIds.push(vertexResult.vertexId)
  }

  return createProfileFromVertexIds(nextDocument, vertexIds, {
    ...options,
    planeId,
    planeElevation,
  })
}

export function insertSketchPath(document, points, options = {}) {
  const planeResult = ensureSketchPlane(document, options)
  let nextDocument = planeResult.document
  const plane = planeResult.plane
  const planeId = plane.id
  const planeElevation = asNumber(plane.origin?.[1], 0)
  const normalizedPoints = points.map((point) => toPoint(point)).filter(Boolean)
  if (normalizedPoints.length < 2) {
    return { document: nextDocument, profileId: null, solidId: null, error: '至少需要两个点', segmentIds: [] }
  }

  const vertexIds = []
  const segmentIds = []

  for (const [index, point] of normalizedPoints.entries()) {
    const nearestVertex = findNearestVertex(nextDocument, point, options.vertexSnapTolerance ?? 0.2, { planeId })
    if (nearestVertex) {
      vertexIds.push(nearestVertex.id)
      continue
    }

    const nearestEdge = findNearestEdgePoint(nextDocument, point, options.edgeSnapTolerance ?? 0.35, { planeId })
    if (nearestEdge) {
      const splitResult = splitLineSegmentAtPoint(nextDocument, nearestEdge.segmentId, [nearestEdge.x, nearestEdge.z], {
        planeId,
        planeElevation,
        curveT: nearestEdge.t,
      })
      nextDocument = splitResult.document
      if (splitResult.vertexId) {
        vertexIds.push(splitResult.vertexId)
        continue
      }
    }

    const vertexResult = ensurePlaneVertex(nextDocument, point, plane, {
      pointIndex: index,
      role: 'sketch-vertex',
      planeId,
      planeElevation,
    })
    nextDocument = vertexResult.document
    vertexIds.push(vertexResult.vertexId)
  }

  for (let index = 0; index < vertexIds.length - 1; index += 1) {
    const segmentResult = ensureSegment(
      nextDocument,
      vertexIds[index],
      vertexIds[index + 1],
      { compatType: options.compatType || 'sketch', sketchMode: options.sketchMode || 'line', planeId, planeElevation },
      'line',
    )
    nextDocument = segmentResult.document
    if (segmentResult.segmentId) segmentIds.push(segmentResult.segmentId)
  }

  if (!options.close) {
    const autoProfiles = autoCreateProfilesFromOpenPath(nextDocument, vertexIds, segmentIds, {
      name: options.name,
      color: options.color,
      compatType: options.compatType || 'zone',
      sketchMode: options.sketchMode || 'line',
      planeId,
      planeElevation,
      metadata: options.metadata || {},
      solidHeight: options.solidHeight,
      solidColor: options.solidColor,
    })
    return {
      document: autoProfiles.document,
      profileId: autoProfiles.profileIds[0] || null,
      profileIds: autoProfiles.profileIds,
      solidId: null,
      error: null,
      segmentIds,
    }
  }

  const profileResult = createProfile(nextDocument, normalizedPoints, {
    name: options.name,
    color: options.color,
    compatType: options.compatType || 'zone',
    sketchMode: options.sketchMode || 'line',
    planeId,
    planeElevation,
    metadata: options.metadata || {},
    solidHeight: options.solidHeight,
    solidColor: options.solidColor,
  })
  return {
    ...profileResult,
    profileIds: profileResult.profileId ? [profileResult.profileId] : [],
    segmentIds,
  }
}

export function insertSketchSegment3D(document, start, end, options = {}) {
  const normalized = normalizeEditorDocument(document)
  const startItems = asArray(start)
  const endItems = asArray(end)
  const startPoint = [
    roundCoord(startItems[0]),
    roundCoord(startItems[1]),
    roundCoord(startItems[2]),
  ]
  const endPoint = [
    roundCoord(endItems[0]),
    roundCoord(endItems[1]),
    roundCoord(endItems[2]),
  ]
  const length = Math.hypot(
    endPoint[0] - startPoint[0],
    endPoint[1] - startPoint[1],
    endPoint[2] - startPoint[2],
  )

  if (length < 0.001) {
    return { document: normalized, segmentId: null, error: '线段长度过短' }
  }

  let nextDocument = normalized
  const planeId = asString(options.planeId || options.plane?.id, 'plane-ground')
  const startVertex = ensureVertex(nextDocument, startPoint[0], startPoint[2], {
    role: 'sketch-vertex-3d',
    planeId,
    planeElevation: startPoint[1],
  })
  nextDocument = startVertex.document

  const endVertex = ensureVertex(nextDocument, endPoint[0], endPoint[2], {
    role: 'sketch-vertex-3d',
    planeId,
    planeElevation: endPoint[1],
  })
  nextDocument = endVertex.document

  const segmentResult = ensureSegment(nextDocument, startVertex.vertexId, endVertex.vertexId, {
    compatType: options.compatType || 'sketch',
    sketchMode: options.sketchMode || 'line',
    planeId,
    axisLock: options.axisLock || null,
  }, 'line')

  return {
    document: segmentResult.document,
    segmentId: segmentResult.segmentId,
    error: segmentResult.segmentId ? null : '线段无效',
  }
}

function insertCurveSegment(document, start, end, curve, kind, options = {}) {
  const planeResult = ensureSketchPlane(document, options)
  let nextDocument = planeResult.document
  const plane = planeResult.plane
  const planeId = plane.id
  const planeElevation = asNumber(plane.origin?.[1], 0)
  const startPoint = toPoint(start)
  const endPoint = toPoint(end)
  if (distance2D(startPoint, endPoint) < 0.001) {
    return { document: nextDocument, segmentId: null, profileId: null, profileIds: [], error: '曲线长度过短' }
  }

  const startVertex = ensurePlaneVertex(nextDocument, startPoint, plane, {
    role: 'curve-vertex',
    planeId,
    planeElevation,
    planeLocal: startPoint,
  })
  nextDocument = startVertex.document
  const endVertex = ensurePlaneVertex(nextDocument, endPoint, plane, {
    role: 'curve-vertex',
    planeId,
    planeElevation,
    planeLocal: endPoint,
  })
  nextDocument = endVertex.document
  const segmentResult = appendSegment(nextDocument, startVertex.vertexId, endVertex.vertexId, {
    compatType: options.compatType || 'sketch',
    sketchMode: options.sketchMode || kind,
    planeId,
    planeElevation,
    curve: cloneValue(curve),
  }, kind)
  nextDocument = segmentResult.document
  const autoProfiles = autoCreateProfilesFromOpenPath(nextDocument, [startVertex.vertexId, endVertex.vertexId], [segmentResult.segmentId], {
    name: options.name,
    color: options.color,
    compatType: options.compatType || 'zone',
    sketchMode: options.sketchMode || kind,
    planeId,
    planeElevation,
    metadata: options.metadata || {},
    solidHeight: options.solidHeight,
    solidColor: options.solidColor,
    meshTolerance: options.meshTolerance || DEFAULT_CURVE_TOLERANCE,
  })

  return {
    document: autoProfiles.document,
    segmentId: segmentResult.segmentId,
    profileId: autoProfiles.profileIds[0] || null,
    profileIds: autoProfiles.profileIds,
    error: null,
  }
}

export function insertArcSegment(document, start, mid, end, options = {}) {
  const startPoint = toPoint(start)
  const midPoint = toPoint(mid)
  const endPoint = toPoint(end)
  if (!circleFromThreePoints(startPoint, midPoint, endPoint)) {
    return { document: normalizeEditorDocument(document), segmentId: null, profileId: null, profileIds: [], error: '圆弧三点不能共线' }
  }
  return insertCurveSegment(document, startPoint, endPoint, { mid: midPoint }, 'arc', options)
}

export function insertBezierSegment(document, start, control1, control2, end, options = {}) {
  return insertCurveSegment(document, toPoint(start), toPoint(end), {
    control1: toPoint(control1),
    control2: toPoint(control2),
  }, 'bezier', options)
}

export function insertCircleProfile(document, center, radiusPoint, options = {}) {
  const planeResult = ensureSketchPlane(document, options)
  let nextDocument = planeResult.document
  const plane = planeResult.plane
  const planeId = plane.id
  const planeElevation = asNumber(plane.origin?.[1], 0)
  const centerPoint = toPoint(center)
  const rimPoint = toPoint(radiusPoint)
  const radius = distance2D(centerPoint, rimPoint)
  if (radius < 0.05) {
    return { document: nextDocument, profileId: null, solidId: null, segmentIds: [], error: '圆半径过小' }
  }

  const vertexPoints = [
    [centerPoint[0] + radius, centerPoint[1]],
    [centerPoint[0], centerPoint[1] + radius],
    [centerPoint[0] - radius, centerPoint[1]],
    [centerPoint[0], centerPoint[1] - radius],
  ]
  const midPoints = [
    [centerPoint[0] + radius * Math.SQRT1_2, centerPoint[1] + radius * Math.SQRT1_2],
    [centerPoint[0] - radius * Math.SQRT1_2, centerPoint[1] + radius * Math.SQRT1_2],
    [centerPoint[0] - radius * Math.SQRT1_2, centerPoint[1] - radius * Math.SQRT1_2],
    [centerPoint[0] + radius * Math.SQRT1_2, centerPoint[1] - radius * Math.SQRT1_2],
  ]
  const vertexIds = []
  const segmentIds = []

  for (const [index, point] of vertexPoints.entries()) {
    const vertexResult = ensurePlaneVertex(nextDocument, point, plane, {
      role: 'circle-vertex',
      pointIndex: index,
      planeId,
      planeElevation,
      planeLocal: point,
    })
    nextDocument = vertexResult.document
    vertexIds.push(vertexResult.vertexId)
  }

  for (let index = 0; index < vertexIds.length; index += 1) {
    const segmentResult = appendSegment(nextDocument, vertexIds[index], vertexIds[(index + 1) % vertexIds.length], {
      compatType: options.compatType || 'zone',
      sketchMode: 'circle',
      planeId,
      planeElevation,
      curve: { mid: [roundCoord(midPoints[index][0]), roundCoord(midPoints[index][1])], circleCenter: centerPoint, radius: roundCoord(radius) },
    }, 'arc')
    nextDocument = segmentResult.document
    segmentIds.push(segmentResult.segmentId)
  }

  return createProfileFromVertexIds(nextDocument, vertexIds, {
    ...options,
    name: options.name || '圆形轮廓',
    color: options.color || '#5b7bb2',
    compatType: options.compatType || 'zone',
    sketchMode: 'circle',
    plane,
    planeId,
    planeElevation,
    segmentIds,
    metadata: {
      ...(options.metadata || {}),
      curveType: 'circle',
      center: centerPoint,
      radius: roundCoord(radius),
    },
  })
}

export function insertRectangleProfile(document, start, end, options = {}) {
  const startPoint = toPoint(start)
  const endPoint = toPoint(end)
  const points = [
    [startPoint[0], startPoint[1]],
    [endPoint[0], startPoint[1]],
    [endPoint[0], endPoint[1]],
    [startPoint[0], endPoint[1]],
  ]
  return createProfile(normalizeEditorDocument(document), points, {
    name: options.name || '矩形轮廓',
    color: options.color || '#5b7bb2',
    compatType: options.compatType || 'zone',
    sketchMode: 'rect',
    planeId: options.planeId,
    planeElevation: options.planeElevation,
    plane: options.plane,
    metadata: options.metadata || {},
    solidHeight: options.solidHeight,
    solidColor: options.solidColor,
  })
}

export function extrudeProfileInDocument(document, profileId, height, options = {}) {
  const normalized = normalizeEditorDocument(document)
  const nextHeight = Math.max(asNumber(height, 3), 0.1)
  const profile = normalized.profiles.find((item) => item.id === profileId)
  if (!profile) return normalized
  const plane = getSketchPlaneById(normalized, profile.planeId || 'plane-ground')
  const extrudeMetadata = planeIsGroundLike(plane)
    ? {}
    : {
        extrudeMode: 'plane-normal',
        extrudePlane: {
          id: plane.id,
          origin: cloneValue(plane.origin),
          normal: cloneValue(plane.normal),
          xAxis: cloneValue(plane.xAxis),
          yAxis: cloneValue(plane.yAxis),
        },
      }
  const inheritedMetadata = {
    ...cloneValue(profile.metadata || {}),
    ...extrudeMetadata,
    ...cloneValue(options.metadata || {}),
  }
  const baseElevation = getSketchPlaneElevation(normalized, profile.planeId || 'plane-ground')
  const solid = normalized.solids.find((item) => item.profileId === profileId || item.id === options.solidId)
  if (solid) {
    return {
      ...normalized,
      profiles: normalized.profiles.map((item) => (item.id === profileId ? { ...item, solidId: solid.id } : item)),
      solids: normalized.solids.map((item) => (
        item.id === solid.id ? { ...item, height: nextHeight, baseElevation, color: options.color || item.color, metadata: { ...(item.metadata || {}), ...inheritedMetadata } } : item
      )),
    }
  }

  const solidId = createId('solid')
  return {
    ...normalized,
    profiles: normalized.profiles.map((item) => (item.id === profileId ? { ...item, solidId } : item)),
    solids: [
      ...normalized.solids,
      {
        id: solidId,
        profileId,
        kind: 'extrude',
        name: profile.name,
        height: nextHeight,
        baseElevation,
        color: options.color || '#d8dee8',
        rotationY: 0,
        metadata: inheritedMetadata,
      },
    ],
  }
}

export function updateCurveControlsInDocument(document, segmentId, patch = {}) {
  const normalized = normalizeEditorDocument(document)
  const existing = normalized.segments.find((segment) => segment.id === segmentId)
  if (!existing || !['arc', 'bezier'].includes(existing.kind)) {
    return { document: normalized, segment: existing || null, error: '曲线不存在' }
  }
  const curve = {
    ...(existing.metadata?.curve || {}),
  }
  if (patch.mid) curve.mid = normalizeCurvePoint(patch.mid)
  if (patch.control1) curve.control1 = normalizeCurvePoint(patch.control1)
  if (patch.control2) curve.control2 = normalizeCurvePoint(patch.control2)
  const segment = {
    ...existing,
    metadata: {
      ...(existing.metadata || {}),
      curve,
    },
  }
  return {
    document: {
      ...normalized,
      segments: normalized.segments.map((item) => (item.id === segmentId ? segment : item)),
    },
    segment,
    error: null,
  }
}

export function moveCurveHandleInDocument(document, segmentId, handle, point) {
  const normalized = normalizeEditorDocument(document)
  const existing = normalized.segments.find((segment) => segment.id === segmentId)
  if (!existing || !['arc', 'bezier'].includes(existing.kind)) {
    return { document: normalized, segment: existing || null, error: '曲线不存在' }
  }
  const nextPoint = toPoint(point)
  if (handle === 'start' || handle === 'end') {
    const vertexId = handle === 'start' ? existing.startVertexId : existing.endVertexId
    const vertex = normalized.vertices.find((item) => item.id === vertexId)
    if (!vertex) return { document: normalized, segment: existing, error: '曲线端点不存在' }
    return {
      document: {
        ...normalized,
        vertices: normalized.vertices.map((item) => (
          item.id === vertexId ? { ...item, x: nextPoint[0], z: nextPoint[1] } : item
        )),
      },
      segment: existing,
      error: null,
    }
  }
  return updateCurveControlsInDocument(normalized, segmentId, { [handle]: nextPoint })
}

function createSurface(document, options = {}) {
  const normalized = normalizeEditorDocument(document)
  const profileIds = asArray(options.profileIds).map((item) => asString(item)).filter(Boolean)
  const pathSegmentIds = asArray(options.pathSegmentIds).map((item) => asString(item)).filter(Boolean)
  if (!profileIds.length) return { document: normalized, surfaceId: null, error: '至少需要一个截面' }
  if (options.kind === 'sweep' && !pathSegmentIds.length) return { document: normalized, surfaceId: null, error: '扫掠至少需要一条路径' }
  if (options.kind === 'loft' && profileIds.length < 2) return { document: normalized, surfaceId: null, error: '放样至少需要两个截面' }
  const missingProfile = profileIds.find((profileId) => !normalized.profiles.some((profile) => profile.id === profileId))
  if (missingProfile) return { document: normalized, surfaceId: null, error: '截面不存在' }
  const missingPath = pathSegmentIds.find((segmentId) => !normalized.segments.some((segment) => segment.id === segmentId))
  if (missingPath) return { document: normalized, surfaceId: null, error: '路径不存在' }
  const surfaceId = createId('surface')
  const defaultClosed = normalized.profiles.find((profile) => profile.id === profileIds[0])?.closed !== false
  const surface = {
    id: surfaceId,
    kind: asString(options.kind, 'sweep'),
    profileIds,
    pathSegmentIds,
    closed: options.closed ?? defaultClosed,
    meshTolerance: Math.max(asNumber(options.meshTolerance, DEFAULT_CURVE_TOLERANCE), 0.01),
    name: options.name || (options.kind === 'loft' ? `放样曲面 ${normalized.surfaces.length + 1}` : `扫掠曲面 ${normalized.surfaces.length + 1}`),
    color: options.color || '#8ab6d6',
    metadata: cloneValue(options.metadata || {}),
  }
  return {
    document: {
      ...normalized,
      surfaces: [...normalized.surfaces, surface],
    },
    surfaceId,
    surface,
    error: null,
  }
}

export function createSweepSurfaceInDocument(document, profileId, pathSegmentIds, options = {}) {
  return createSurface(document, {
    ...options,
    kind: 'sweep',
    profileIds: [profileId],
    pathSegmentIds,
  })
}

export function createLoftSurfaceInDocument(document, profileIds, options = {}) {
  return createSurface(document, {
    ...options,
    kind: 'loft',
    profileIds,
    pathSegmentIds: [],
  })
}

function resampleRing(points, count) {
  if (!points.length || count <= 0) return []
  if (points.length === count) return points
  return Array.from({ length: count }, (_, index) => points[Math.min(points.length - 1, Math.floor((index / count) * points.length))])
}

export function sampleSurfaceMesh(document, surfaceId) {
  const normalized = normalizeEditorDocument(document)
  const surface = normalized.surfaces.find((item) => item.id === surfaceId)
  if (!surface) return { vertices: [], indices: [], surface: null }
  const profileById = new Map(normalized.profiles.map((profile) => [profile.id, profile]))
  const segmentById = new Map(normalized.segments.map((segment) => [segment.id, segment]))
  const vertices = []
  const indices = []

  if (surface.kind === 'loft') {
    const rings = surface.profileIds
      .map((profileId) => profileById.get(profileId))
      .filter(Boolean)
      .map((profile) => {
        const elevation = getSketchPlaneElevation(normalized, profile.planeId || 'plane-ground')
        return sampledProfilePointsFromDocument(normalized, profile).map((point) => [point[0], elevation, point[1]])
      })
      .filter((ring) => ring.length >= 3)
    if (rings.length < 2) return { vertices, indices, surface }
    const count = Math.min(...rings.map((ring) => ring.length))
    rings.forEach((ring) => resampleRing(ring, count).forEach((point) => vertices.push(point)))
    for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
      for (let pointIndex = 0; pointIndex < count; pointIndex += 1) {
        const a = ringIndex * count + pointIndex
        const b = ringIndex * count + ((pointIndex + 1) % count)
        const c = (ringIndex + 1) * count + ((pointIndex + 1) % count)
        const d = (ringIndex + 1) * count + pointIndex
        indices.push(a, b, d, b, c, d)
      }
    }
    return { vertices, indices, surface }
  }

  const profile = profileById.get(surface.profileIds[0])
  const pathPoints = surface.pathSegmentIds.flatMap((segmentId, index) => {
    const segment = segmentById.get(segmentId)
    const points = segment ? sampleSegment(normalized, segment, surface.meshTolerance) : []
    return index === 0 ? points : points.slice(1)
  })
  if (!profile || pathPoints.length < 2) return { vertices, indices, surface }
  const profilePoints2D = sampledProfilePointsFromDocument(normalized, profile)
  if (profilePoints2D.length < 2) return { vertices, indices, surface }
  const center = polygonCentroid(profilePoints2D)
  const localPoints = profilePoints2D.map((point) => [point[0] - center[0], point[1] - center[1]])
  pathPoints.forEach((pathPoint, index) => {
    const next = pathPoints[Math.min(index + 1, pathPoints.length - 1)]
    const prev = pathPoints[Math.max(index - 1, 0)]
    const dx = next[0] - prev[0]
    const dz = next[1] - prev[1]
    const length = Math.hypot(dx, dz) || 1
    const perp = [-dz / length, dx / length]
    localPoints.forEach((point) => {
      vertices.push([
        roundCoord(pathPoint[0] + perp[0] * point[0]),
        roundCoord(point[1]),
        roundCoord(pathPoint[1] + perp[1] * point[0]),
      ])
    })
  })
  const count = localPoints.length
  for (let pathIndex = 0; pathIndex < pathPoints.length - 1; pathIndex += 1) {
    for (let pointIndex = 0; pointIndex < count; pointIndex += 1) {
      const a = pathIndex * count + pointIndex
      const b = pathIndex * count + ((pointIndex + 1) % count)
      const c = (pathIndex + 1) * count + ((pointIndex + 1) % count)
      const d = (pathIndex + 1) * count + pointIndex
      indices.push(a, b, d, b, c, d)
    }
  }
  return { vertices, indices, surface }
}

function vertexLookup(document) {
  return new Map(document.vertices.map((vertex) => [vertex.id, vertex]))
}

function profilePoints(profile, lookup) {
  return asArray(profile?.vertexIds)
    .map((vertexId) => lookup.get(vertexId))
    .filter(Boolean)
    .map((vertex) => [vertex.x, vertex.z])
}

function sampledProfilePointsFromDocument(document, profile) {
  return sampleProfilePoints(document, profile, profile?.metadata?.meshTolerance || DEFAULT_CURVE_TOLERANCE)
}

function moveVertices(document, vertexIds, delta) {
  const ids = new Set(vertexIds)
  const hasVerticalDelta = delta.length >= 3
  return {
    ...document,
    vertices: document.vertices.map((vertex) => (
      ids.has(vertex.id)
        ? {
            ...vertex,
            x: roundCoord(vertex.x + delta[0]),
            y: roundCoord(vertex.y + (hasVerticalDelta ? delta[1] : 0)),
            z: roundCoord(vertex.z + (hasVerticalDelta ? delta[2] : delta[1])),
          }
        : vertex
    )),
  }
}

function selectionVertexIds(document, selection) {
  if (!selection) return []
  if (selection.kind === 'vertex') return [selection.entityId]
  if (selection.kind === 'edge') {
    const segment = document.segments.find((item) => item.id === selection.entityId)
    return segment ? [segment.startVertexId, segment.endVertexId] : []
  }
  if (selection.kind === 'face') {
    const profile = document.profiles.find((item) => item.id === selection.entityId)
    return profile?.vertexIds || []
  }
  if (selection.kind === 'object') {
    const solid = document.solids.find((item) => item.id === selection.entityId)
    if (!solid) return []
    const profile = document.profiles.find((item) => item.id === solid.profileId)
    return profile?.vertexIds || []
  }
  return []
}

export function moveSelectionInDocument(document, selection, delta) {
  const normalized = normalizeEditorDocument(document)
  const vertexIds = selectionVertexIds(normalized, selection)
  return vertexIds.length ? moveVertices(normalized, vertexIds, delta) : normalized
}

export function rotateSolidInDocument(document, solidId, angleDelta) {
  const normalized = normalizeEditorDocument(document)
  const solid = normalized.solids.find((item) => item.id === solidId)
  if (!solid) return normalized
  const profile = normalized.profiles.find((item) => item.id === solid.profileId)
  if (!profile) return normalized
  const lookup = vertexLookup(normalized)
  const points = profilePoints(profile, lookup)
  if (!points.length) return normalized
  const center = points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]).map((value) => value / points.length)
  const cos = Math.cos(angleDelta)
  const sin = Math.sin(angleDelta)
  const nextVertices = normalized.vertices.map((vertex) => {
    if (!profile.vertexIds.includes(vertex.id)) return vertex
    const dx = vertex.x - center[0]
    const dz = vertex.z - center[1]
    return {
      ...vertex,
      x: roundCoord(center[0] + dx * cos - dz * sin),
      z: roundCoord(center[1] + dx * sin + dz * cos),
    }
  })
  return {
    ...normalized,
    vertices: nextVertices,
    solids: normalized.solids.map((item) => (item.id === solidId ? { ...item, rotationY: roundCoord(item.rotationY + angleDelta) } : item)),
  }
}

function migrateLegacyScene(scene = {}) {
  let document = createEmptyEditorDocument()

  asArray(scene.lines).forEach((line) => {
    const result = insertSketchPath(document, [
      [asNumber(line?.start?.x, 0), asNumber(line?.start?.z, 0)],
      [asNumber(line?.end?.x, 0), asNumber(line?.end?.z, 0)],
    ], { close: false, compatType: 'line', sketchMode: 'line' })
    document = result.document
  })

  asArray(scene.zones).forEach((zone) => {
    const polygon = asArray(zone?.polygon).map((point) => toPoint(point)).filter(Boolean)
    if (polygon.length < 3) return
    const result = createProfile(document, polygon, {
      name: zone?.name || zone?.code || '区域',
      color: zone?.color || '#5b7bb2',
      compatType: 'zone',
      metadata: { zoneType: zone?.zone_type || zone?.metadata?.zoneType || 'general' },
    })
    document = result.document
  })

  asArray(scene.walls).forEach((wall) => {
    const footprint = buildWallFootprint(
      [asNumber(wall?.start?.x, 0), asNumber(wall?.start?.z, 0)],
      [asNumber(wall?.end?.x, 0), asNumber(wall?.end?.z, 0)],
      Math.max(asNumber(wall?.thickness, 0.2), 0.05),
    )
    if (!footprint) return
    const result = createProfile(document, footprint, {
      name: wall?.name || '墙体',
      color: '#d8dee8',
      compatType: 'wall',
      metadata: {
        compatType: 'wall',
        sourceWallId: wall?.id || null,
        centerline: {
          start: [asNumber(wall?.start?.x, 0), asNumber(wall?.start?.z, 0)],
          end: [asNumber(wall?.end?.x, 0), asNumber(wall?.end?.z, 0)],
          thickness: Math.max(asNumber(wall?.thickness, 0.2), 0.05),
        },
      },
      solidHeight: Math.max(asNumber(wall?.height, 3), 0.1),
      solidColor: '#d8dee8',
    })
    document = result.document
  })

  const instances = []
  asArray(scene.prefabs).forEach((prefab) => {
    instances.push({
      id: prefab?.id || createId('instance'),
      type: 'item',
      name: prefab?.name || '物件',
      position: [prefab?.position?.x || 0, prefab?.position?.y || 0, prefab?.position?.z || 0],
      rotation: [0, ((prefab?.rotationDeg || 0) * Math.PI) / 180, 0],
      scale: [1, 1, 1],
      size: [1.4, 1.4, 1.4],
      color: prefab?.color || '#8b9bb0',
      metadata: { compatType: 'prefab', prefabId: prefab?.prefabId || null, category: prefab?.category || 'generic' },
    })
  })

  asArray(scene.structures).forEach((structure) => {
    instances.push({
      id: structure?.id || createId('instance'),
      type: 'structure',
      name: structure?.name || structure?.type || '结构件',
      position: [structure?.position?.x || 0, structure?.position?.y || 0, structure?.position?.z || 0],
      rotation: [structure?.rotation?.x || 0, structure?.rotation?.y || 0, structure?.rotation?.z || 0],
      scale: [1, 1, 1],
      size: [structure?.dimensions?.width || 1, structure?.dimensions?.height || 1, structure?.dimensions?.depth || 1],
      color: '#8b9bb0',
      metadata: { compatType: 'structure', structureType: structure?.type || 'generic' },
    })
  })

  asArray(scene.racks).forEach((rack) => {
    instances.push({
      id: rack?.id || createId('instance'),
      type: 'rack',
      name: rack?.name || rack?.code || '货架',
      position: [asNumber(rack?.position_mm?.x, 0) / 1000, asNumber(rack?.position_mm?.y, 0) / 1000, asNumber(rack?.position_mm?.z, 0) / 1000],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      size: [
        Math.max(asNumber(rack?.outer_dimensions_mm?.width_mm, 2400) / 1000, 0.4),
        Math.max(asNumber(rack?.outer_dimensions_mm?.height_mm, 3200) / 1000, 0.4),
        Math.max(asNumber(rack?.outer_dimensions_mm?.depth_mm, 1000) / 1000, 0.4),
      ],
      color: '#98a6b5',
      metadata: { compatType: 'rack', rackTemplateId: rack?.rack_template_id || null },
    })
  })

  return normalizeEditorDocument({
    ...document,
    instances,
    metadata: { ...document.metadata, migratedFromLegacy: true },
  })
}

export function createEditorDocumentFromWarehouseScene(scene) {
  if (scene?.editorDocument?.version === 2) return normalizeEditorDocument(scene.editorDocument)
  return migrateLegacyScene(scene)
}

export function getEditorDocumentStats(document) {
  const normalized = normalizeEditorDocument(document)
  return {
    vertexCount: normalized.vertices.length,
    edgeCount: normalized.segments.length,
    faceCount: normalized.profiles.length,
    solidCount: normalized.solids.length,
    surfaceCount: normalized.surfaces.length,
    instanceCount: normalized.instances.length,
    openingCount: normalized.openings.length,
  }
}

export function createHistoryEntry(label, metadata = {}) {
  return { id: createId('history'), label: asString(label, '编辑'), timestamp: new Date().toISOString(), metadata: cloneValue(metadata) }
}

export function findNearestVertex(document, point, tolerance = 0.4, options = {}) {
  const normalized = normalizeEditorDocument(document)
  const planeId = asString(options.planeId, '')
  const plane = getSketchPlaneById(normalized, planeId || 'plane-ground')
  let nearest = null
  let nearestDistance = tolerance
  normalized.vertices.forEach((vertex) => {
    if (planeId && asString(vertex.metadata?.planeId) !== planeId) return
    const local = worldPointToLocal(plane, [vertex.x, vertex.y, vertex.z])
    const distance = Math.hypot(local[0] - point[0], local[1] - point[1])
    if (distance <= nearestDistance) {
      nearest = vertex
      nearestDistance = distance
    }
  })
  return nearest
}

export function findNearestMidpoint(document, point, tolerance = 0.35, options = {}) {
  const normalized = normalizeEditorDocument(document)
  const planeId = asString(options.planeId, '')
  const plane = getSketchPlaneById(normalized, planeId || 'plane-ground')
  const lookup = vertexLookup(normalized)
  let nearest = null
  let nearestDistance = tolerance
  normalized.segments.forEach((segment) => {
    if (planeId && asString(segment.planeId, 'plane-ground') !== planeId) return
    const start = lookup.get(segment.startVertexId)
    const end = lookup.get(segment.endVertexId)
    if (!start || !end) return
    const localStart = worldPointToLocal(plane, [start.x, start.y, start.z])
    const localEnd = worldPointToLocal(plane, [end.x, end.y, end.z])
    const midpoint = [(localStart[0] + localEnd[0]) / 2, (localStart[1] + localEnd[1]) / 2]
    const distance = Math.hypot(midpoint[0] - point[0], midpoint[1] - point[1])
    if (distance <= nearestDistance) {
      nearest = { id: `${segment.id}:mid`, x: midpoint[0], z: midpoint[1], segmentId: segment.id }
      nearestDistance = distance
    }
  })
  return nearest
}

export function findNearestEdgePoint(document, point, tolerance = 0.35, options = {}) {
  const normalized = normalizeEditorDocument(document)
  const planeId = asString(options.planeId, '')
  const plane = getSketchPlaneById(normalized, planeId || 'plane-ground')
  const lookup = vertexLookup(normalized)
  let nearest = null
  let nearestDistance = tolerance
  normalized.segments.forEach((segment) => {
    if (planeId && asString(segment.planeId, 'plane-ground') !== planeId) return
    const start = lookup.get(segment.startVertexId)
    const end = lookup.get(segment.endVertexId)
    if (!start || !end) return
    const localStart = worldPointToLocal(plane, [start.x, start.y, start.z])
    const localEnd = worldPointToLocal(plane, [end.x, end.y, end.z])
    const sampled = segment.kind === 'line' ? [localStart, localEnd] : sampleSegment(normalized, segment, DEFAULT_CURVE_TOLERANCE)
    let projected = null
    sampled.slice(0, -1).forEach((sample, sampleIndex) => {
      const candidate = projectPointToSegment2D(point, sample, sampled[sampleIndex + 1])
      if (!projected || candidate.distance < projected.distance) {
        projected = {
          ...candidate,
          t: sampled.length <= 1 ? 0 : (sampleIndex + candidate.t) / (sampled.length - 1),
        }
      }
    })
    if (!projected) return
    if (projected.t <= 0.001 || projected.t >= 0.999) return
    if (projected.distance <= nearestDistance) {
      nearest = {
        id: `${segment.id}:edge`,
        x: projected.point[0],
        y: localPointToWorld(plane, projected.point)[1],
        z: projected.point[1],
        segmentId: segment.id,
        t: projected.t,
        distance: projected.distance,
      }
      nearestDistance = projected.distance
    }
  })
  return nearest
}

export function findOverlappingSegment(document, start, end, options = {}) {
  const normalized = normalizeEditorDocument(document)
  const planeId = asString(options.planeId, '')
  const plane = getSketchPlaneById(normalized, planeId || 'plane-ground')
  const lookup = vertexLookup(normalized)
  return normalized.segments.find((segment) => {
    if (planeId && asString(segment.planeId, 'plane-ground') !== planeId) return false
    const left = lookup.get(segment.startVertexId)
    const right = lookup.get(segment.endVertexId)
    if (!left || !right) return false
    const leftPoint = worldPointToLocal(plane, [left.x, left.y, left.z])
    const rightPoint = worldPointToLocal(plane, [right.x, right.y, right.z])
    const same = Math.abs(leftPoint[0] - start[0]) < 0.001 && Math.abs(leftPoint[1] - start[1]) < 0.001 && Math.abs(rightPoint[0] - end[0]) < 0.001 && Math.abs(rightPoint[1] - end[1]) < 0.001
    const reverse = Math.abs(leftPoint[0] - end[0]) < 0.001 && Math.abs(leftPoint[1] - end[1]) < 0.001 && Math.abs(rightPoint[0] - start[0]) < 0.001 && Math.abs(rightPoint[1] - start[1]) < 0.001
    return same || reverse
  }) || null
}

export function resolveSketchPlaneForSelection(document, selection) {
  const normalized = normalizeEditorDocument(document)
  if (!selection) return getSketchPlaneById(normalized, 'plane-ground')

  if (selection.kind === 'face') {
    if (selection.meta?.faceKind === 'side') {
      const solidId = selection.meta?.solidId || selection.entityId
      const normal = normalizeVector3(selection.meta?.normal, [1, 0, 0])
      const horizontalLength = Math.hypot(normal[0], normal[2]) || 1
      const faceNormal = [roundCoord(normal[0] / horizontalLength), 0, roundCoord(normal[2] / horizontalLength)]
      const xAxis = [roundCoord(faceNormal[2]), 0, roundCoord(-faceNormal[0])]
      const yAxis = [0, 1, 0]
      const hitPoint = normalizeVector3(selection.meta?.hitPoint, [0, 0, 0])
      const planeId = `plane-solid-side:${solidId}:${faceNormal[0]}:${faceNormal[2]}`
      return normalized.sketchPlanes.find((plane) => plane.id === planeId) || {
        id: planeId,
        kind: 'solid-side',
        name: `${selection.label || '实体'} 草图面`,
        origin: hitPoint,
        normal: faceNormal,
        xAxis,
        yAxis,
      }
    }
    const profileId = selection.meta?.profileId || selection.entityId
    const profile = normalized.profiles.find((item) => item.id === profileId)
    const solidId = selection.meta?.solidId || profile?.solidId || null
    if (solidId) {
      const solid = normalized.solids.find((item) => item.id === solidId)
      if (solid) {
        const planeId = `plane-solid-top:${solid.id}`
        return {
          id: planeId,
          kind: 'solid-top',
          name: `${solid.name || '实体'} 顶面`,
          origin: [0, roundCoord(solid.baseElevation + solid.height), 0],
          normal: [0, 1, 0],
          xAxis: [1, 0, 0],
          yAxis: [0, 0, 1],
        }
      }
    }
    if (profile) return getSketchPlaneById(normalized, profile.planeId || 'plane-ground')
  }

  return getSketchPlaneById(normalized, 'plane-ground')
}

export function deriveWallOpeningHost(document, solidId) {
  const normalized = normalizeEditorDocument(document)
  const solid = normalized.solids.find((item) => item.id === solidId)
  if (!solid) return null
  const profile = normalized.profiles.find((item) => item.id === solid.profileId)
  if (!profile) return null
  const lookup = vertexLookup(normalized)
  const points = profilePoints(profile, lookup)
  if (points.length < 4) return null

  const centerline = solid.metadata?.centerline || profile.metadata?.centerline
  if (centerline?.start && centerline?.end) {
    const start = [asNumber(centerline.start[0], 0), asNumber(centerline.start[1], 0)]
    const end = [asNumber(centerline.end[0], 0), asNumber(centerline.end[1], 0)]
    const length = Math.hypot(end[0] - start[0], end[1] - start[1])
    const thickness = Math.max(asNumber(centerline.thickness, 0.2), 0.05)
    if (length <= 0.001) return null
    return {
      solidId: solid.id,
      profileId: profile.id,
      start,
      end,
      length,
      thickness,
      baseElevation: solid.baseElevation,
      height: solid.height,
      angle: Math.atan2(end[1] - start[1], end[0] - start[0]),
      center: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
      metadataSource: 'centerline',
    }
  }

  if (points.length !== 4) return null
  const edges = edgeInfoFromPoints(points)
  if (edges.length !== 4) return null
  const sortedByLength = [...edges].sort((left, right) => left.length - right.length)
  const shortEdge = sortedByLength[0]
  const oppositeIndex = oppositeEdgeIndex(shortEdge.index, edges.length)
  if (oppositeIndex === null) return null
  const oppositeShort = edges[oppositeIndex]
  const length = Math.max(edges[(shortEdge.index + 1) % edges.length].length, edges[(shortEdge.index + 3) % edges.length].length)
  const thickness = Math.max(shortEdge.length, 0.05)
  const start = shortEdge.midpoint
  const end = oppositeShort.midpoint
  const centerlineLength = Math.hypot(end[0] - start[0], end[1] - start[1])

  if (centerlineLength <= 0.001) return null

  return {
    solidId: solid.id,
    profileId: profile.id,
    start,
    end,
    length: centerlineLength || length,
    thickness,
    baseElevation: solid.baseElevation,
    height: solid.height,
    angle: Math.atan2(end[1] - start[1], end[0] - start[0]),
    center: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
    metadataSource: 'profile-rectangle',
  }
}

export function listOpeningsForSolid(document, solidId) {
  const normalized = normalizeEditorDocument(document)
  return normalized.openings.filter((opening) => opening.solidId === solidId)
}

export function resolveOpeningPose(host, opening) {
  if (!host || !opening) return null
  const directionX = Math.cos(host.angle)
  const directionZ = Math.sin(host.angle)
  const centerX = host.start[0] + directionX * opening.offset
  const centerZ = host.start[1] + directionZ * opening.offset
  const centerY = host.baseElevation + opening.elevation + opening.height / 2
  return {
    center: [roundCoord(centerX), roundCoord(centerY), roundCoord(centerZ)],
    rotation: [0, -host.angle, 0],
    size: [
      roundCoord(opening.width),
      roundCoord(opening.height),
      roundCoord(Math.max(host.thickness * 1.08, 0.12)),
    ],
    faceNormal: [roundCoord(-Math.sin(host.angle)), 0, roundCoord(Math.cos(host.angle))],
  }
}

export function resolveOpeningDraft(document, solidId, options = {}) {
  const normalized = normalizeEditorDocument(document)
  const host = deriveWallOpeningHost(normalized, solidId)
  if (!host) return { document: normalized, host: null, opening: null, error: '当前实体不支持开洞' }

  const type = asString(options.type, 'door')
  const requestedWidth = type === 'window' ? 1.6 : 1
  const requestedHeight = type === 'window' ? 1.2 : 2.1
  const width = Math.max(Math.min(asNumber(options.width, requestedWidth), Math.max(host.length - 0.2, 0.2)), 0.2)
  const height = Math.max(Math.min(asNumber(options.height, requestedHeight), Math.max(host.height - 0.2, 0.2)), 0.2)
  const defaultElevation = type === 'window' ? 0.9 : 0
  const elevation = Math.max(Math.min(asNumber(options.elevation, defaultElevation), Math.max(host.height - height - 0.05, 0)), 0)
  const fallbackPoint = [host.center[0], host.baseElevation + elevation + height / 2, host.center[1]]
  const point = Array.isArray(options.point) ? options.point : fallbackPoint
  const inferredElevation = asNumber(point[1], fallbackPoint[1]) - host.baseElevation - height / 2
  const effectiveElevation = Math.max(
    Math.min(
      Array.isArray(options.point) && options.elevation === undefined
        ? inferredElevation
        : asNumber(options.elevation, defaultElevation),
      Math.max(host.height - height - 0.05, 0),
    ),
    0,
  )
  const projection = projectPointToSegment2D([asNumber(point[0], host.center[0]), asNumber(point[2], host.center[1])], host.start, host.end)

  const halfWidth = width / 2
  let offset = Math.max(halfWidth + 0.05, Math.min(host.length - halfWidth - 0.05, projection.t * host.length))

  const existingOpenings = listOpeningsForSolid(normalized, solidId).filter((opening) => opening.id !== options.excludeOpeningId)
  const minGap = 0.08
  for (const existing of existingOpenings) {
    const existingStart = existing.offset - existing.width / 2 - minGap
    const existingEnd = existing.offset + existing.width / 2 + minGap
    if (offset >= existingStart && offset <= existingEnd) {
      offset = Math.min(host.length - halfWidth - 0.05, existing.offset + existing.width / 2 + halfWidth + minGap)
    }
  }
  offset = Math.max(halfWidth + 0.05, Math.min(host.length - halfWidth - 0.05, offset))

  const opening = {
    solidId,
    width: roundCoord(width),
    height: roundCoord(height),
    offset: roundCoord(offset),
    elevation: roundCoord(effectiveElevation),
    type,
    metadata: {
      hostStart: [...host.start],
      hostEnd: [...host.end],
      hostLength: roundCoord(host.length),
      hostThickness: roundCoord(host.thickness),
      positionRatio: roundCoord(offset / host.length),
      source: options.source || 'face-selection',
      metadataSource: host.metadataSource,
    },
  }

  return {
    document: normalized,
    host,
    opening,
    error: null,
  }
}

export function addOpeningToDocument(document, solidId, options = {}) {
  const result = resolveOpeningDraft(document, solidId, options)
  if (result.error) return result

  const opening = {
    ...result.opening,
    id: createId('opening'),
  }

  return {
    document: {
      ...result.document,
      openings: [...result.document.openings, opening],
    },
    host: result.host,
    opening,
    error: null,
  }
}

export function updateOpeningInDocument(document, openingId, options = {}) {
  const normalized = normalizeEditorDocument(document)
  const existing = normalized.openings.find((opening) => opening.id === openingId)
  if (!existing) return { document: normalized, opening: null, host: null, error: '开洞不存在' }

  const host = deriveWallOpeningHost(normalized, existing.solidId)
  if (!host) return { document: normalized, opening: null, host: null, error: '当前实体不支持开洞' }

  const fallbackPose = resolveOpeningPose(host, existing)
  const draft = resolveOpeningDraft(normalized, existing.solidId, {
    type: options.type ?? existing.type,
    width: options.width ?? existing.width,
    height: options.height ?? existing.height,
    elevation: options.elevation ?? existing.elevation,
    point: options.point ?? fallbackPose?.center,
    source: options.source ?? existing.metadata?.source ?? 'opening-update',
    excludeOpeningId: openingId,
  })
  if (draft.error) return draft

  const opening = {
    ...existing,
    ...draft.opening,
    id: openingId,
    metadata: {
      ...(existing.metadata || {}),
      ...(draft.opening.metadata || {}),
      source: options.source ?? existing.metadata?.source ?? draft.opening.metadata?.source,
    },
  }

  return {
    document: {
      ...normalized,
      openings: normalized.openings.map((item) => (item.id === openingId ? opening : item)),
    },
    opening,
    host: draft.host,
    error: null,
  }
}

export function resizeOpeningInDocument(document, openingId, handle, point, options = {}) {
  const normalized = normalizeEditorDocument(document)
  const existing = normalized.openings.find((opening) => opening.id === openingId)
  if (!existing) return { document: normalized, opening: null, host: null, error: '开洞不存在' }

  const host = deriveWallOpeningHost(normalized, existing.solidId)
  if (!host) return { document: normalized, opening: null, host: null, error: '当前实体不支持开洞' }

  const projected = Array.isArray(point)
    ? projectPointToSegment2D([asNumber(point[0], host.center[0]), asNumber(point[2], host.center[1])], host.start, host.end)
    : null
  const alongOffset = projected ? Math.max(0, Math.min(host.length, projected.t * host.length)) : existing.offset
  const localY = Array.isArray(point) ? asNumber(point[1], host.baseElevation + existing.elevation) - host.baseElevation : existing.elevation

  const leftEdge = existing.offset - existing.width / 2
  const rightEdge = existing.offset + existing.width / 2
  const bottomEdge = existing.elevation
  const topEdge = existing.elevation + existing.height
  const minWidth = 0.2
  const minHeight = 0.2
  const safeStart = 0.05
  const safeEnd = host.length - 0.05

  let width = existing.width
  let height = existing.height
  let offset = existing.offset
  let elevation = existing.elevation

  if (handle === 'left') {
    const nextLeft = Math.max(safeStart, Math.min(rightEdge - minWidth, alongOffset))
    width = rightEdge - nextLeft
    offset = nextLeft + width / 2
  } else if (handle === 'right') {
    const nextRight = Math.min(safeEnd, Math.max(leftEdge + minWidth, alongOffset))
    width = nextRight - leftEdge
    offset = leftEdge + width / 2
  } else if (handle === 'top') {
    const nextTop = Math.min(host.height - 0.05, Math.max(bottomEdge + minHeight, localY))
    height = nextTop - bottomEdge
  } else if (handle === 'bottom') {
    const nextBottom = Math.max(0, Math.min(topEdge - minHeight, localY))
    elevation = nextBottom
    height = topEdge - nextBottom
  }

  return updateOpeningInDocument(normalized, openingId, {
    width,
    height,
    elevation,
    point: [
      host.start[0] + Math.cos(host.angle) * offset,
      host.baseElevation + elevation + height / 2,
      host.start[1] + Math.sin(host.angle) * offset,
    ],
    source: options.source || `resize-${handle}`,
  })
}

export function removeOpeningFromDocument(document, openingId) {
  const normalized = normalizeEditorDocument(document)
  return {
    ...normalized,
    openings: normalized.openings.filter((opening) => opening.id !== openingId),
  }
}

function selectionItems(selection) {
  if (!selection) return []
  if (selection.meta?.entityType === 'multi') return asArray(selection.meta.items)
  return [selection]
}

export function deleteSelectionFromDocument(document, selection) {
  const normalized = normalizeEditorDocument(document)
  const items = selectionItems(selection)
  if (!items.length) return { document: normalized, deletedCount: 0 }

  const vertexIds = new Set()
  const segmentIds = new Set()
  const profileIds = new Set()
  const destructiveProfileIds = new Set()
  const solidIds = new Set()
  const surfaceIds = new Set()
  const openingIds = new Set()
  const instanceIds = new Set()

  items.forEach((item) => {
    const entityType = item?.meta?.entityType
    const entityId = asString(item?.entityId)
    if (!entityType || !entityId) return

    if (entityType === 'vertex') vertexIds.add(entityId)
    else if (entityType === 'segment') segmentIds.add(entityId)
    else if (entityType === 'curve-control') segmentIds.add(asString(item.meta?.segmentId, entityId.split(':')[0]))
    else if (entityType === 'profile') {
      profileIds.add(entityId)
      if (item.meta?.solidId) solidIds.add(item.meta.solidId)
    } else if (entityType === 'solid' || entityType === 'solid-face') {
      if (item.meta?.solidId) solidIds.add(item.meta.solidId)
      if (item.meta?.profileId) {
        profileIds.add(item.meta.profileId)
        destructiveProfileIds.add(item.meta.profileId)
      }
    } else if (entityType === 'opening' || entityType === 'opening-resize-handle') {
      openingIds.add(asString(item.meta?.openingId, entityId))
    } else if (entityType === 'surface') {
      surfaceIds.add(entityId)
    } else if (entityType === 'instance') {
      instanceIds.add(entityId)
    }
  })

  normalized.profiles.forEach((profile) => {
    if (!destructiveProfileIds.has(profile.id)) return
    asArray(profile.segmentIds).forEach((segmentId) => segmentIds.add(segmentId))
    asArray(profile.vertexIds).forEach((vertexId) => vertexIds.add(vertexId))
  })

  normalized.segments.forEach((segment) => {
    if (vertexIds.has(segment.startVertexId) || vertexIds.has(segment.endVertexId)) {
      segmentIds.add(segment.id)
    }
  })

  normalized.profiles.forEach((profile) => {
    if (
      asArray(profile.vertexIds).some((vertexId) => vertexIds.has(vertexId))
      || asArray(profile.segmentIds).some((segmentId) => segmentIds.has(segmentId))
    ) {
      profileIds.add(profile.id)
    }
  })

  normalized.solids.forEach((solid) => {
    if (profileIds.has(solid.profileId)) solidIds.add(solid.id)
  })

  normalized.profiles.forEach((profile) => {
    if (solidIds.has(profile.solidId)) profileIds.add(profile.id)
  })

  normalized.openings.forEach((opening) => {
    if (solidIds.has(opening.solidId)) openingIds.add(opening.id)
  })

  normalized.surfaces.forEach((surface) => {
    if (
      asArray(surface.profileIds).some((profileId) => profileIds.has(profileId))
      || asArray(surface.pathSegmentIds).some((segmentId) => segmentIds.has(segmentId))
    ) {
      surfaceIds.add(surface.id)
    }
  })

  const nextProfiles = normalized.profiles.filter((profile) => !profileIds.has(profile.id))
  const nextSegments = normalized.segments.filter((segment) => !segmentIds.has(segment.id))
  const remainingVertexIds = new Set(nextProfiles.flatMap((profile) => profile.vertexIds))
  nextSegments.forEach((segment) => {
    remainingVertexIds.add(segment.startVertexId)
    remainingVertexIds.add(segment.endVertexId)
  })

  const nextDocument = {
    ...normalized,
    vertices: normalized.vertices.filter((vertex) => !vertexIds.has(vertex.id) && remainingVertexIds.has(vertex.id)),
    segments: nextSegments,
    profiles: nextProfiles,
    solids: normalized.solids.filter((solid) => !solidIds.has(solid.id)),
    surfaces: normalized.surfaces.filter((surface) => !surfaceIds.has(surface.id)),
    openings: normalized.openings.filter((opening) => !openingIds.has(opening.id)),
    instances: normalized.instances.filter((instance) => !instanceIds.has(instance.id)),
  }

  return {
    document: nextDocument,
    deletedCount: vertexIds.size + segmentIds.size + profileIds.size + solidIds.size + surfaceIds.size + openingIds.size + instanceIds.size,
  }
}

function boundingBoxForProfile(profile, lookup, document = null) {
  const points = document ? sampledProfilePointsFromDocument(document, profile) : profilePoints(profile, lookup)
  const xs = points.map((point) => point[0])
  const zs = points.map((point) => point[1])
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
}

function boundingBoxForMeshPoints(points) {
  if (!points?.length) return null
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  const zs = points.map((point) => point[2])
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
}

function boundingBoxForSolid(document, profile, solid, lookup) {
  if (solid?.metadata?.extrudeMode === 'plane-normal') {
    const plane = getSketchPlaneById(document, profile.planeId || solid.metadata?.extrudePlane?.id || 'plane-ground')
    const depth = Math.max(asNumber(solid.height, 0.1), 0.1)
    const points = sampledProfilePointsFromDocument(document, profile)
      .flatMap((point) => [localPointToWorld(plane, point, 0), localPointToWorld(plane, point, depth)])
    return boundingBoxForMeshPoints(points)
  }
  const box = boundingBoxForProfile(profile, lookup, document)
  return {
    minX: box.minX,
    maxX: box.maxX,
    minY: asNumber(solid.baseElevation, 0),
    maxY: asNumber(solid.baseElevation, 0) + asNumber(solid.height, 0),
    minZ: box.minZ,
    maxZ: box.maxZ,
  }
}

export function convertEditorDocumentToLegacyScene(document, options = {}) {
  const normalized = normalizeEditorDocument(document)
  const lookup = vertexLookup(normalized)
  const profileById = new Map(normalized.profiles.map((profile) => [profile.id, profile]))
  const solidProfileIds = new Set(normalized.solids.map((solid) => solid.profileId))

  const lines = normalized.segments.flatMap((segment) => {
    const start = lookup.get(segment.startVertexId)
    const end = lookup.get(segment.endVertexId)
    if (!start || !end) return []
    const sampled = sampleSegment3D(normalized, segment, DEFAULT_CURVE_TOLERANCE)
    return sampled.slice(0, -1).map((point, index) => ({
      id: sampled.length > 2 ? `${segment.id}:sample:${index + 1}` : segment.id,
      start: { x: roundCoord(point[0]), y: roundCoord(point[1]), z: roundCoord(point[2]) },
      end: { x: roundCoord(sampled[index + 1][0]), y: roundCoord(sampled[index + 1][1]), z: roundCoord(sampled[index + 1][2]) },
      color: '#3767cf',
      metadata: segment.kind === 'line'
        ? Math.abs(point[1] - sampled[index + 1][1]) > 0.001 ? { is3D: true, sourceSegmentId: segment.id } : undefined
        : { sourceCurveSegmentId: segment.id, curveKind: segment.kind },
    }))
  }).filter(Boolean)

  const walls = normalized.solids.map((solid) => {
    const profile = profileById.get(solid.profileId)
    if (!profile || (solid.metadata?.compatType || profile.metadata?.compatType) !== 'wall') return null
    const centerline = solid.metadata?.centerline || profile.metadata?.centerline
    const solidOpenings = normalized.openings.filter((opening) => opening.solidId === solid.id).map((opening) => ({
      id: opening.id,
      type: opening.type,
      position: {
        x: roundCoord(opening.offset),
        y: roundCoord(opening.elevation),
      },
      width: roundCoord(opening.width),
      height: roundCoord(opening.height),
      sillHeight: roundCoord(opening.elevation),
      metadata: cloneValue(opening.metadata || {}),
    }))
    if (centerline?.start && centerline?.end) {
      return {
        id: solid.metadata?.sourceWallId || solid.id,
        start: { x: roundCoord(centerline.start[0]), z: roundCoord(centerline.start[1]) },
        end: { x: roundCoord(centerline.end[0]), z: roundCoord(centerline.end[1]) },
        height: roundCoord(solid.height),
        thickness: roundCoord(centerline.thickness || 0.2),
        openings: solidOpenings,
      }
    }
    const box = boundingBoxForProfile(profile, lookup, normalized)
    return {
      id: solid.id,
      start: { x: roundCoord(box.minX), z: roundCoord((box.minZ + box.maxZ) / 2) },
      end: { x: roundCoord(box.maxX), z: roundCoord((box.minZ + box.maxZ) / 2) },
      height: roundCoord(solid.height),
      thickness: roundCoord(Math.max(box.maxZ - box.minZ, 0.2)),
      openings: solidOpenings,
    }
  }).filter(Boolean)

  const zones = normalized.profiles.filter((profile) => !solidProfileIds.has(profile.id) && profile.metadata?.compatType !== 'wall').map((profile) => ({
    id: profile.id,
    name: profile.name,
    color: profile.color,
    polygon: sampledProfilePointsFromDocument(normalized, profile).map((point) => [roundCoord(point[0]), roundCoord(point[1])]),
    zone_type: profile.metadata?.zoneType || (profile.metadata?.autoCreatedFromWallBoundary ? 'auto_floor_split' : 'general'),
    metadata: cloneValue(profile.metadata || {}),
  }))

  const structures = normalized.solids.map((solid) => {
    const profile = profileById.get(solid.profileId)
    if (!profile || (solid.metadata?.compatType || profile.metadata?.compatType) === 'wall') return null
    const box = boundingBoxForSolid(normalized, profile, solid, lookup)
    return {
      id: solid.id,
      type: solid.metadata?.compatType || 'block',
      name: solid.name,
      position: { x: roundCoord((box.minX + box.maxX) / 2), y: roundCoord((box.minY + box.maxY) / 2), z: roundCoord((box.minZ + box.maxZ) / 2) },
      rotation: { x: 0, y: roundCoord(solid.rotationY || 0), z: 0 },
      dimensions: { width: roundCoord(box.maxX - box.minX), height: roundCoord(box.maxY - box.minY), depth: roundCoord(box.maxZ - box.minZ) },
      metadata: cloneValue(solid.metadata || {}),
    }
  }).filter(Boolean)

  const surfaceStructures = normalized.surfaces.map((surface) => {
    const mesh = sampleSurfaceMesh(normalized, surface.id)
    const box = boundingBoxForMeshPoints(mesh.vertices)
    if (!box) return null
    return {
      id: surface.id,
      type: surface.kind === 'loft' ? 'loft-surface' : 'sweep-surface',
      name: surface.name,
      position: {
        x: roundCoord((box.minX + box.maxX) / 2),
        y: roundCoord((box.minY + box.maxY) / 2),
        z: roundCoord((box.minZ + box.maxZ) / 2),
      },
      rotation: { x: 0, y: 0, z: 0 },
      dimensions: {
        width: roundCoord(Math.max(box.maxX - box.minX, 0.01)),
        height: roundCoord(Math.max(box.maxY - box.minY, 0.01)),
        depth: roundCoord(Math.max(box.maxZ - box.minZ, 0.01)),
      },
    }
  }).filter(Boolean)

  const prefabs = normalized.instances.filter((instance) => instance.metadata?.compatType === 'prefab').map((instance) => ({
    id: instance.id,
    prefabId: instance.metadata?.prefabId || null,
    category: instance.metadata?.category || 'generic',
    name: instance.name,
    position: { x: roundCoord(instance.position[0]), y: roundCoord(instance.position[1]), z: roundCoord(instance.position[2]) },
    rotationDeg: Math.round((instance.rotation[1] * 180) / Math.PI),
    color: instance.color,
  }))

  const racks = normalized.instances.filter((instance) => instance.metadata?.compatType === 'rack').map((instance) => ({
    id: instance.id,
    rack_template_id: instance.metadata?.rackTemplateId || null,
    name: instance.name,
    position_mm: { x: Math.round(instance.position[0] * 1000), y: Math.round(instance.position[1] * 1000), z: Math.round(instance.position[2] * 1000) },
    outer_dimensions_mm: { width_mm: Math.round(instance.size[0] * 1000), height_mm: Math.round(instance.size[1] * 1000), depth_mm: Math.round(instance.size[2] * 1000) },
  }))

  return {
    sceneType: options.sceneType || 'warehouse',
    warehouse: options.warehouse || { id: options.warehouseId || createId('warehouse'), name: options.name || '未命名项目', dimensions_mm: cloneValue(DEFAULT_WAREHOUSE_DIMENSIONS_MM) },
    activeLevelId: options.activeLevelId || null,
    lines,
    walls,
    zones,
    prefabs,
    racks,
    structures: [
      ...structures,
      ...surfaceStructures,
      ...normalized.instances.filter((instance) => instance.metadata?.compatType === 'structure').map((instance) => ({
        id: instance.id,
        type: instance.metadata?.structureType || 'generic',
        name: instance.name,
        position: { x: roundCoord(instance.position[0]), y: roundCoord(instance.position[1]), z: roundCoord(instance.position[2]) },
        rotation: { x: roundCoord(instance.rotation[0]), y: roundCoord(instance.rotation[1]), z: roundCoord(instance.rotation[2]) },
        dimensions: { width: roundCoord(instance.size[0]), height: roundCoord(instance.size[1]), depth: roundCoord(instance.size[2]) },
      })),
    ],
  }
}

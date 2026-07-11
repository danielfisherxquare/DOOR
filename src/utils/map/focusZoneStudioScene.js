import {
  createEmptyEditorDocument,
  extrudeProfileInDocument,
  insertCircleProfile,
  insertSketchPath,
  normalizeEditorDocument,
} from '../../3d-studio/model/editorDocument.js'
import {
  EXPORT_COORDINATE_SYSTEMS,
  buildExportManifest,
  buildTerrainPatchDiagnostics,
} from '../exportManifest.js'
import { buildFocusZoneWorkbenchContext } from './focusZoneContext.js'
import { buildFocusZoneObjectContext } from './focusZoneSpatialObjects.js'

const DEFAULT_MARGIN_METERS = 6
const DEFAULT_WAREHOUSE_HEIGHT_METERS = 12
const DEFAULT_SELECTION_FLOOR_HEIGHT_METERS = 0.08
const DEFAULT_MAX_OSM_BUILDING_MAJOR_METERS = 240
const DEFAULT_MAX_OSM_BUILDING_AREA_SQM = 20000
const DEFAULT_MAX_OSM_RIBBON_MAJOR_METERS = 120
const DEFAULT_MAX_OSM_RIBBON_ASPECT_RATIO = 12

const TYPE_COLORS = {
  boundary: '#6f7f92',
  terrain: '#d9e4d0',
  stage: '#d8d3c4',
  tent: '#e8e2d2',
  arch: '#d7d7d7',
  light_tower: '#cbd4df',
  supply_station: '#cfdcc7',
  medical_station: '#dce5ef',
  fence_segment: '#c9c9c9',
  route_sign: '#d7dcea',
  osm_building: '#d4d6d1',
  generic: '#d8dee8',
}

const FALLBACK_DIMENSIONS = {
  generic: { width: 2, depth: 2, height: 2.2 },
  stage: { width: 8, depth: 5, height: 1.2 },
  tent: { width: 4, depth: 4, height: 2.8 },
  supply_station: { width: 2.5, depth: 1.8, height: 1.8 },
  medical_station: { width: 4, depth: 3, height: 2.6 },
  fence_segment: { width: 3, depth: 0.18, height: 1.6 },
  arch: { width: 5, depth: 0.6, height: 4 },
  light_tower: { width: 0.36, depth: 0.36, height: 6 },
  route_sign: { width: 1.2, depth: 0.12, height: 2.4 },
}

const ensureArray = (value) => (Array.isArray(value) ? value : [])
const pickNumber = (value, fallback = 0) => {
  const nextValue = Number(value)
  return Number.isFinite(nextValue) ? nextValue : fallback
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function hashValue(value) {
  const input = stableStringify(value)
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function boundsFromPoints(points) {
  if (!points.length) return { minX: -4, maxX: 4, minZ: -3, maxZ: 3, width: 8, depth: 6 }
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  points.forEach((point) => {
    minX = Math.min(minX, pickNumber(point?.x, 0))
    maxX = Math.max(maxX, pickNumber(point?.x, 0))
    minZ = Math.min(minZ, pickNumber(point?.z, 0))
    maxZ = Math.max(maxZ, pickNumber(point?.z, 0))
  })
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: Math.max(maxX - minX, 1),
    depth: Math.max(maxZ - minZ, 1),
  }
}

function polygonAreaSqm(points) {
  let area = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += pickNumber(current?.[0], 0) * pickNumber(next?.[1], 0) - pickNumber(next?.[0], 0) * pickNumber(current?.[1], 0)
  }
  return Math.abs(area) / 2
}

function isUsableOsmBuildingFootprint(footprint) {
  const points = ensureArray(footprint)
    .map((point) => [pickNumber(point?.[0], Number.NaN), pickNumber(point?.[1], Number.NaN)])
    .filter(([x, z]) => Number.isFinite(x) && Number.isFinite(z))
  if (points.length < 3) return false
  const bounds = boundsFromPoints(points.map(([x, z]) => ({ x, z })))
  const major = Math.max(bounds.width, bounds.depth)
  const minor = Math.max(Math.min(bounds.width, bounds.depth), 0.01)
  const area = polygonAreaSqm(points)
  if (major > DEFAULT_MAX_OSM_BUILDING_MAJOR_METERS) return false
  if (area > DEFAULT_MAX_OSM_BUILDING_AREA_SQM) return false
  if (major > DEFAULT_MAX_OSM_RIBBON_MAJOR_METERS && major / minor > DEFAULT_MAX_OSM_RIBBON_ASPECT_RATIO) return false
  return true
}

function toLocalMeters(wgs84, originWgs84) {
  const origin = originWgs84 || { longitude: 0, latitude: 0 }
  const metersPerDegreeLat = 111320
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos((pickNumber(origin.latitude, 0) * Math.PI) / 180) || 1
  return {
    x: (pickNumber(wgs84?.longitude ?? wgs84?.[0], 0) - pickNumber(origin.longitude, 0)) * metersPerDegreeLng,
    z: (pickNumber(wgs84?.latitude ?? wgs84?.[1], 0) - pickNumber(origin.latitude, 0)) * metersPerDegreeLat,
  }
}

function terrainPatchToMesh(terrainPatch) {
  const rows = Math.max(Math.floor(pickNumber(terrainPatch?.rows, 0)), 0)
  const cols = Math.max(Math.floor(pickNumber(terrainPatch?.cols, 0)), 0)
  const heights = ensureArray(terrainPatch?.heightsRelative)
  const bounds = terrainPatch?.boundsMeters || {}
  if (rows < 2 || cols < 2 || heights.length < rows * cols) return null

  const minX = pickNumber(bounds.minX, -5)
  const maxX = pickNumber(bounds.maxX, 5)
  const minZ = pickNumber(bounds.minZ, -5)
  const maxZ = pickNumber(bounds.maxZ, 5)
  const stepX = (maxX - minX) / Math.max(cols - 1, 1)
  const stepZ = (maxZ - minZ) / Math.max(rows - 1, 1)
  const vertices = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col
      vertices.push(
        Number((minX + stepX * col).toFixed(4)),
        Number(pickNumber(heights[index], 0).toFixed(4)),
        Number((minZ + stepZ * row).toFixed(4)),
      )
    }
  }

  const indices = []
  const cellMask = ensureArray(terrainPatch?.cellMask)
  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const cellIndex = row * (cols - 1) + col
      if (cellMask.length && !cellMask[cellIndex]) continue
      const a = row * cols + col
      const b = a + 1
      const c = (row + 1) * cols + col
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  if (!indices.length) return null
  return {
    id: `terrain-mesh-${terrainPatch?.sampledAt || 'patch'}`.replace(/[^a-zA-Z0-9:_-]+/g, '-'),
    kind: 'terrain-grid',
    name: 'GIS 地形网格',
    color: TYPE_COLORS.terrain,
    vertices,
    indices,
    metadata: {
      importedFrom: 'gis-focus-zone',
      objectType: 'terrain_patch',
      compatType: 'terrain-patch',
      source: terrainPatch?.source || 'terrain-patch',
      sampledAt: terrainPatch?.sampledAt || null,
      rows,
      cols,
      resolutionMeters: terrainPatch?.resolutionMeters || null,
      elevationOffsetMeters: terrainPatch?.elevationOffsetMeters || 0,
      coordinateSystem: EXPORT_COORDINATE_SYSTEMS.ARCSPRO_LOCAL_Y_UP,
      diagnostics: buildTerrainPatchDiagnostics(terrainPatch),
    },
  }
}

function getOsmBuildingRecords(focusZone, options = {}) {
  const explicit = ensureArray(options.osmBuildings)
  if (explicit.length) return explicit
  const snapshotBuildings = focusZone?.snapshotJson?.osmBuildings
  return ensureArray(snapshotBuildings?.buildings || snapshotBuildings)
}

function osmBuildingFootprintLocal(building, originWgs84) {
  const ring = ensureArray(building?.footprintWgs84?.coordinates?.[0])
  const openRing = []
  for (const point of ring) {
    const longitude = pickNumber(point?.[0], null)
    const latitude = pickNumber(point?.[1], null)
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue
    const lastPoint = openRing[openRing.length - 1]
    if (lastPoint && lastPoint[0] === longitude && lastPoint[1] === latitude) continue
    openRing.push([longitude, latitude])
  }
  while (openRing.length > 1 && openRing[0]?.[0] === openRing[openRing.length - 1]?.[0] && openRing[0]?.[1] === openRing[openRing.length - 1]?.[1]) {
    openRing.pop()
  }
  return openRing
    .map(([longitude, latitude]) => toLocalMeters({ longitude, latitude }, originWgs84))
    .map((point) => [point.x, point.z])
}

function appendOsmBuildings(document, buildings, focusZoneContext, warnings) {
  let nextDocument = document
  let count = 0
  let skippedAbnormal = 0
  for (const building of ensureArray(buildings)) {
    const footprint = osmBuildingFootprintLocal(building, focusZoneContext?.originWgs84)
    if (footprint.length < 3) continue
    if (!isUsableOsmBuildingFootprint(footprint)) {
      skippedAbnormal += 1
      continue
    }
    const height = Math.max(pickNumber(building?.heightMeters, 9.6), 2.8)
    const baseElevation = Math.max(pickNumber(building?.minHeightMeters, 0), 0)
    const result = appendExtrudedFootprint(nextDocument, footprint, height, {
      id: building?.id || building?.osmId || `osm-building-${count + 1}`,
      name: building?.name || `OSM 建筑 ${count + 1}`,
      color: TYPE_COLORS.osm_building,
      compatType: 'osm-building',
      baseElevation,
      metadata: {
        importedFrom: 'osm-building',
        sourceObjectId: building?.id || null,
        osmId: building?.osmId || null,
        osmType: building?.osmType || 'way',
        objectType: 'osm_building',
        renderKind: building?.renderKind || 'building-outline',
        isBuildingPart: Boolean(building?.isBuildingPart),
        buildingType: building?.buildingType || 'yes',
        heightMeters: height,
        levels: building?.levels || null,
        compatType: 'osm-building',
      },
    })
    nextDocument = result.document
    if (result.error) {
      warnings.push(`${building?.name || building?.id || 'OSM 建筑'} 导入失败：${result.error}`)
    } else {
      count += 1
    }
  }
  if (skippedAbnormal > 0) {
    warnings.push(`已跳过 ${skippedAbnormal} 个异常 OSM 建筑轮廓（超大面或长条面），避免导入错误白模。`)
  }
  return { document: nextDocument, count, skippedAbnormal }
}

function rectangleAround(center, dimensions) {
  const halfWidth = Math.max(pickNumber(dimensions?.width, 1), 0.05) / 2
  const halfDepth = Math.max(pickNumber(dimensions?.depth, 1), 0.05) / 2
  return [
    [center.x - halfWidth, center.z - halfDepth],
    [center.x + halfWidth, center.z - halfDepth],
    [center.x + halfWidth, center.z + halfDepth],
    [center.x - halfWidth, center.z + halfDepth],
  ]
}

function segmentFootprint(start, end, depth) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const length = Math.hypot(dx, dz)
  if (length < 0.01) return rectangleAround(start, { width: 1, depth })
  const halfDepth = Math.max(depth, 0.05) / 2
  const ox = (-dz / length) * halfDepth
  const oz = (dx / length) * halfDepth
  return [
    [start.x + ox, start.z + oz],
    [end.x + ox, end.z + oz],
    [end.x - ox, end.z - oz],
    [start.x - ox, start.z - oz],
  ]
}

function normalizeObjectType(type) {
  if (type === 'supply') return 'supply_station'
  if (type === 'medical') return 'medical_station'
  return type || 'generic'
}

function objectDimensions(item) {
  const objectType = normalizeObjectType(item?.objectType)
  const fallback = FALLBACK_DIMENSIONS[objectType] || FALLBACK_DIMENSIONS.generic
  return {
    width: Math.max(pickNumber(item?.dimensions?.width, fallback.width), fallback.width),
    depth: Math.max(pickNumber(item?.dimensions?.depth, fallback.depth), fallback.depth),
    height: Math.max(pickNumber(item?.dimensions?.height, fallback.height), 0.1),
  }
}

function appendProfile(document, points, options = {}) {
  const validPoints = []
  for (const point of ensureArray(points)) {
    const x = pickNumber(point?.[0], null)
    const z = pickNumber(point?.[1], null)
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue
    const lastPoint = validPoints[validPoints.length - 1]
    if (lastPoint && lastPoint[0] === x && lastPoint[1] === z) continue
    validPoints.push([x, z])
  }
  while (validPoints.length > 1 && validPoints[0]?.[0] === validPoints[validPoints.length - 1]?.[0] && validPoints[0]?.[1] === validPoints[validPoints.length - 1]?.[1]) {
    validPoints.pop()
  }
  if (validPoints.length < 3) return { document, profileId: null, error: 'profile requires at least three points' }
  return insertSketchPath(document, validPoints, {
    close: true,
    compatType: options.compatType || 'zone',
    sketchMode: options.sketchMode || 'line',
    plane: options.plane,
    name: options.name,
    color: options.color,
    metadata: options.metadata || {},
  })
}

function appendExtrudedFootprint(document, points, height, options = {}) {
  const baseElevation = pickNumber(options.baseElevation, 0)
  const profile = appendProfile(document, points, {
    name: options.name,
    color: options.color,
    compatType: options.compatType || 'block',
    plane: {
      id: options.planeId || `plane-${options.id || 'solid'}`,
      name: options.planeName || `${options.name || 'Object'} Base`,
      origin: [0, baseElevation, 0],
    },
    metadata: {
      ...(options.metadata || {}),
      baseElevation,
    },
  })
  if (!profile.profileId || profile.error) return { document: profile.document, solidId: null, error: profile.error }
  const extruded = extrudeProfileInDocument(profile.document, profile.profileId, height, {
    color: options.color,
    metadata: {
      ...(options.metadata || {}),
      baseElevation,
    },
  })
  const solid = extruded.solids.find((item) => item.profileId === profile.profileId)
  return { document: extruded, profileId: profile.profileId, solidId: solid?.id || null, error: null }
}

function appendBox(document, center, dimensions, options = {}) {
  const size = objectDimensions({ objectType: options.objectType, dimensions })
  const baseElevation = pickNumber(options.baseElevation, pickNumber(center?.y, 0))
  const footprint = options.footprintPoints?.length
    ? options.footprintPoints.map((point) => [pickNumber(point.x, 0), pickNumber(point.z, 0)])
    : rectangleAround(center, size)
  return appendExtrudedFootprint(document, footprint, size.height, {
    ...options,
    baseElevation,
    metadata: {
      ...(options.metadata || {}),
      studioPrimitive: 'box',
      studioPrimitiveCenter: [pickNumber(center?.x, 0), baseElevation + size.height / 2, pickNumber(center?.z, 0)],
      studioPrimitiveSize: [size.width, size.height, size.depth],
      objectType: options.objectType || 'generic',
      compatType: 'block',
    },
  })
}

function appendCylinder(document, center, dimensions, options = {}) {
  const size = objectDimensions({ objectType: options.objectType, dimensions })
  const radius = Math.max(size.width, size.depth, 0.1) / 2
  const baseElevation = pickNumber(options.baseElevation, 0)
  const profile = insertCircleProfile(document, [center.x, center.z], [center.x + radius, center.z], {
    compatType: 'block',
    plane: {
      id: options.planeId || `plane-${options.id || 'cylinder'}`,
      name: options.planeName || `${options.name || 'Cylinder'} Base`,
      origin: [0, baseElevation, 0],
    },
    name: options.name,
    color: options.color,
    metadata: {
      ...(options.metadata || {}),
      studioPrimitive: 'cylinder',
      studioPrimitiveCenter: [pickNumber(center?.x, 0), baseElevation + size.height / 2, pickNumber(center?.z, 0)],
      studioPrimitiveSize: [radius * 2, size.height, radius * 2],
      objectType: options.objectType || 'generic',
      compatType: 'block',
    },
  })
  if (!profile.profileId || profile.error) return { document: profile.document, solidId: null, error: profile.error }
  const extruded = extrudeProfileInDocument(profile.document, profile.profileId, size.height, {
    color: options.color,
    metadata: {
      ...(options.metadata || {}),
      studioPrimitive: 'cylinder',
      studioPrimitiveCenter: [pickNumber(center?.x, 0), baseElevation + size.height / 2, pickNumber(center?.z, 0)],
      studioPrimitiveSize: [radius * 2, size.height, radius * 2],
      objectType: options.objectType || 'generic',
      compatType: 'block',
    },
  })
  const solid = extruded.solids.find((item) => item.profileId === profile.profileId)
  return { document: extruded, profileId: profile.profileId, solidId: solid?.id || null, error: null }
}

function appendFence(document, item, metadata) {
  const points = item.pathPoints?.length >= 2 ? item.pathPoints : item.footprintPoints
  if (!points?.length) {
    return appendBox(document, item.anchor, objectDimensions(item), {
      id: item.id,
      name: item.title,
      objectType: 'fence_segment',
      color: TYPE_COLORS.fence_segment,
      baseElevation: item.terrain?.avg || 0,
      metadata,
    })
  }

  let nextDocument = document
  const solids = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    const footprint = segmentFootprint(start, end, FALLBACK_DIMENSIONS.fence_segment.depth)
    const result = appendExtrudedFootprint(nextDocument, footprint, FALLBACK_DIMENSIONS.fence_segment.height, {
      id: `${item.id || 'fence'}-${index + 1}`,
      name: `${item.title || '围栏段'} ${index + 1}`,
      color: TYPE_COLORS.fence_segment,
      compatType: 'block',
      baseElevation: item.terrain?.avg || 0,
      metadata: {
        ...metadata,
        studioPrimitive: 'linear-box',
        studioPrimitiveStart: [start.x, item.terrain?.avg || 0, start.z],
        studioPrimitiveEnd: [end.x, item.terrain?.avg || 0, end.z],
        studioPrimitiveSize: [Math.hypot(end.x - start.x, end.z - start.z), FALLBACK_DIMENSIONS.fence_segment.height, FALLBACK_DIMENSIONS.fence_segment.depth],
        objectType: 'fence_segment',
      },
    })
    nextDocument = result.document
    if (result.solidId) solids.push(result.solidId)
  }
  return { document: nextDocument, solidIds: solids }
}

function appendArch(document, item, metadata) {
  const dims = objectDimensions(item)
  const legWidth = Math.max(dims.width * 0.12, 0.25)
  const beamHeight = Math.max(dims.height * 0.16, 0.3)
  const baseElevation = item.terrain?.avg || 0
  const left = { x: item.anchor.x - dims.width / 2 + legWidth / 2, z: item.anchor.z }
  const right = { x: item.anchor.x + dims.width / 2 - legWidth / 2, z: item.anchor.z }
  const beam = { x: item.anchor.x, z: item.anchor.z }
  let nextDocument = document
  ;[
    { name: `${item.title} 左柱`, center: left, size: { width: legWidth, depth: dims.depth, height: dims.height }, part: 'left-leg' },
    { name: `${item.title} 右柱`, center: right, size: { width: legWidth, depth: dims.depth, height: dims.height }, part: 'right-leg' },
    { name: `${item.title} 横梁`, center: beam, size: { width: dims.width, depth: dims.depth, height: beamHeight }, baseElevation: baseElevation + dims.height - beamHeight, part: 'beam' },
  ].forEach((part) => {
    const result = appendBox(nextDocument, part.center, part.size, {
      id: `${item.id || 'arch'}-${part.part}`,
      name: part.name,
      objectType: 'arch',
      color: TYPE_COLORS.arch,
      baseElevation: part.baseElevation ?? baseElevation,
      metadata: { ...metadata, archPart: part.part },
    })
    nextDocument = result.document
  })
  return { document: nextDocument }
}

function appendRouteSign(document, item, metadata) {
  const baseElevation = item.terrain?.avg || 0
  const pole = appendCylinder(document, item.anchor, { width: 0.16, depth: 0.16, height: 2.4 }, {
    id: `${item.id || 'route-sign'}-pole`,
    name: `${item.title || '路标'} 杆`,
    objectType: 'route_sign',
    color: TYPE_COLORS.route_sign,
    baseElevation,
    metadata: { ...metadata, signPart: 'pole' },
  })
  return appendBox(pole.document, { x: item.anchor.x, z: item.anchor.z }, { width: 1.2, depth: 0.12, height: 0.6 }, {
    id: `${item.id || 'route-sign'}-board`,
    name: `${item.title || '路标'} 牌面`,
    objectType: 'route_sign',
    color: TYPE_COLORS.route_sign,
    baseElevation: baseElevation + 1.65,
    metadata: { ...metadata, signPart: 'board' },
  })
}

function appendObject(document, item) {
  const objectType = normalizeObjectType(item.objectType)
  const metadata = {
    importedFrom: 'gis-focus-zone',
    sourceObjectId: item.id || null,
    sourceObjectTitle: item.title || null,
    objectType,
    placementMode: item.placementMode || 'follow-terrain',
  }

  if (objectType === 'fence_segment') return appendFence(document, item, metadata)
  if (objectType === 'arch') return appendArch(document, item, metadata)
  if (objectType === 'light_tower') {
    return appendCylinder(document, item.anchor, objectDimensions(item), {
      id: item.id,
      name: item.title,
      objectType,
      color: TYPE_COLORS.light_tower,
      baseElevation: item.terrain?.avg || 0,
      metadata,
    })
  }
  if (objectType === 'route_sign') return appendRouteSign(document, item, metadata)

  return appendBox(document, item.anchor, objectDimensions(item), {
    id: item.id,
    name: item.title,
    objectType,
    color: TYPE_COLORS[objectType] || TYPE_COLORS.generic,
    baseElevation: item.terrain?.avg || 0,
    footprintPoints: item.footprintPoints,
    metadata,
  })
}

export function computeFocusZoneSourceHash({ focusZone, objects = [] }) {
  return hashValue({
    focusZoneId: focusZone?.id || null,
    clipPolygonWgs84: focusZone?.clipPolygonWgs84 || null,
    originWgs84: focusZone?.originWgs84 || null,
    includedObjectIds: ensureArray(focusZone?.includedObjectIds).slice().sort(),
    terrainPatch: {
      sampledAt: focusZone?.snapshotJson?.terrainPatch?.sampledAt || null,
      boundsMeters: focusZone?.snapshotJson?.terrainPatch?.boundsMeters || null,
      resolutionMeters: focusZone?.snapshotJson?.terrainPatch?.resolutionMeters || null,
    },
    osmBuildings: ensureArray(focusZone?.snapshotJson?.osmBuildings?.buildings || focusZone?.snapshotJson?.osmBuildings).map((building) => ({
      id: building?.id || null,
      osmId: building?.osmId || null,
      heightMeters: building?.heightMeters || null,
      footprintWgs84: building?.footprintWgs84 || null,
    })).sort((left, right) => String(left.id || left.osmId).localeCompare(String(right.id || right.osmId))),
    objects: ensureArray(objects).map((object) => ({
      id: object?.id || null,
      objectType: object?.objectType || null,
      updatedAt: object?.updatedAt || null,
      anchorWgs84: object?.anchorWgs84 || null,
      footprint: object?.footprint || object?.metadata?.geometry || null,
      dimensions: object?.dimensions || null,
    })).sort((left, right) => String(left.id).localeCompare(String(right.id))),
  })
}

export function getFocusZoneSceneImportState({ scene, focusZone, objects = [] }) {
  if (!scene) return 'missing'
  const metadata = scene?.editorDocument?.metadata || scene?.metadata || {}
  const savedHash = metadata.focusZoneSourceHash || metadata.spatialObjectHash
  if (!savedHash) return 'unknown'
  return savedHash === computeFocusZoneSourceHash({ focusZone, objects }) ? 'current' : 'stale'
}

export function buildFocusZoneStudioScene({
  focusZone,
  objects = [],
  project = null,
  assetTemplates = [],
  options = {},
} = {}) {
  const focusZoneContext = buildFocusZoneWorkbenchContext(focusZone)
  const objectContext = buildFocusZoneObjectContext(objects, focusZoneContext)
  const osmBuildings = getOsmBuildingRecords(focusZone, options)
  const bounds = focusZoneContext?.boundsMeters || boundsFromPoints(focusZoneContext?.polygonLocalMeters || [])
  const margin = pickNumber(options.marginMeters, DEFAULT_MARGIN_METERS)
  const widthMeters = Math.max(bounds.width + margin * 2, 8)
  const depthMeters = Math.max(bounds.depth + margin * 2, 8)
  const sourceHash = computeFocusZoneSourceHash({ focusZone, objects })
  const importedAt = new Date().toISOString()
  const warnings = []
  const exportManifest = buildExportManifest({
    kind: 'focus-zone-studio-scene',
    name: focusZoneContext?.name || focusZone?.name || 'GIS 固定区域白模',
    source: 'gis-focus-zone',
    coordinateSystem: EXPORT_COORDINATE_SYSTEMS.ARCSPRO_LOCAL_Y_UP,
    input: {
      sourceWorkZoneId: focusZone?.id || null,
      sourceProjectId: focusZone?.projectId || project?.id || null,
      sourceObjectCount: objectContext.length,
      originWgs84: focusZone?.originWgs84 || null,
    },
    stats: {
      objectCount: objectContext.length,
      osmBuildingCount: osmBuildings.length,
      terrainMeshCount: focusZone?.snapshotJson?.terrainPatch ? 1 : 0,
    },
    diagnostics: {
      terrainPatch: buildTerrainPatchDiagnostics(focusZone?.snapshotJson?.terrainPatch || null),
    },
    generatedAt: importedAt,
  })

  let document = createEmptyEditorDocument()
  const terrainMesh = terrainPatchToMesh(focusZone?.snapshotJson?.terrainPatch)
  if (terrainMesh) {
    document = normalizeEditorDocument({
      ...document,
      terrainMeshes: [terrainMesh],
    })
  }

  const boundaryPoints = ensureArray(focusZoneContext?.polygonLocalMeters).map((point) => [point.x, point.z])
  if (boundaryPoints.length >= 3) {
    const boundary = appendProfile(document, boundaryPoints, {
      name: `${focusZoneContext.name || '重点区'} 边界`,
      color: TYPE_COLORS.boundary,
      compatType: 'focus-zone-boundary',
      metadata: {
        importedFrom: 'gis-focus-zone',
        focusZoneId: focusZone?.id || null,
        zoneType: focusZone?.zoneType || 'focus-zone',
        compatType: 'focus-zone-boundary',
      },
    })
    document = boundary.document
    if (boundary.error) warnings.push(`区域边界导入失败：${boundary.error}`)

    const floorHeight = Math.max(
      pickNumber(options.selectionFloorHeightMeters, DEFAULT_SELECTION_FLOOR_HEIGHT_METERS),
      0.01,
    )
    const floor = appendExtrudedFootprint(document, boundaryPoints, floorHeight, {
      id: `focus-zone-floor-${focusZone?.id || 'draft'}`,
      name: `${focusZoneContext.name || '重点区'} 选区白模底板`,
      color: TYPE_COLORS.terrain,
      compatType: 'focus-zone-floor',
      baseElevation: pickNumber(options.selectionFloorBaseElevationMeters, -floorHeight),
      metadata: {
        importedFrom: 'gis-focus-zone',
        focusZoneId: focusZone?.id || null,
        zoneType: focusZone?.zoneType || 'focus-zone',
        studioPrimitive: 'selection-floor',
        objectType: 'focus_zone_floor',
        compatType: 'focus-zone-floor',
      },
    })
    document = floor.document
    if (floor.error) warnings.push(`选区白模底板导入失败：${floor.error}`)
  }

  for (const item of objectContext) {
    try {
      const result = appendObject(document, item)
      document = result.document || document
      if (result.error) warnings.push(`${item.title || item.id || '空间对象'} 导入失败：${result.error}`)
    } catch (error) {
      warnings.push(`${item?.title || item?.id || '空间对象'} 导入失败：${error.message}`)
    }
  }

  const osmResult = appendOsmBuildings(document, osmBuildings, focusZoneContext, warnings)
  document = osmResult.document

  document = normalizeEditorDocument({
    ...document,
    metadata: {
      ...(document.metadata || {}),
      source: 'gis-focus-zone',
      sourceWorkZoneId: focusZone?.id || null,
      sourceProjectId: focusZone?.projectId || project?.id || null,
      sourceObjectIds: objectContext.map((item) => item.id).filter(Boolean),
      sourceObjectCount: objectContext.length,
      osmBuildingCount: osmResult.count,
      osmSkippedBuildingCount: osmResult.skippedAbnormal,
      assetTemplateCount: ensureArray(assetTemplates).length,
      focusZoneSourceHash: sourceHash,
      spatialObjectHash: sourceHash,
      terrainPatchHash: hashValue(focusZone?.snapshotJson?.terrainPatch || null),
      importedAt,
      export: exportManifest,
      warnings,
    },
  })

  return {
    id: `focus-zone-scene-${focusZone?.id || 'draft'}`,
    sceneType: 'focus-zone-studio-scene',
    name: focusZoneContext?.name || focusZone?.name || 'GIS 固定区域白模',
    warehouse: {
      id: `focus-zone-warehouse-${focusZone?.id || 'draft'}`,
      name: focusZoneContext?.name || focusZone?.name || 'GIS 固定区域白模',
      dimensions_mm: {
        width_mm: Math.round(widthMeters * 1000),
        depth_mm: Math.round(depthMeters * 1000),
        height_mm: Math.round(pickNumber(options.heightMeters, DEFAULT_WAREHOUSE_HEIGHT_METERS) * 1000),
      },
    },
    activeLevelId: 'focus-zone-ground',
    editorDocument: document,
    metadata: {
      source: 'gis-focus-zone',
      sourceWorkZoneId: focusZone?.id || null,
      sourceProjectId: focusZone?.projectId || project?.id || null,
      sourceObjectCount: objectContext.length,
      osmBuildingCount: osmResult.count,
      osmSkippedBuildingCount: osmResult.skippedAbnormal,
      focusZoneSourceHash: sourceHash,
      importedAt,
      export: exportManifest,
      warnings,
    },
  }
}

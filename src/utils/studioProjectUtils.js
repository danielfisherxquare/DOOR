import {
  createEditorDocumentFromWarehouseScene,
  normalizeEditorDocument,
} from '../3d-studio/model/editorDocument.js'

const DEFAULT_WAREHOUSE_DIMENSIONS_MM = {
  width_mm: 24000,
  depth_mm: 18000,
  height_mm: 9000,
}

const DEFAULT_EVENT_DIMENSIONS_MM = {
  width_mm: 32000,
  depth_mm: 24000,
  height_mm: 12000,
}

export const DEFAULT_STUDIO_LEVEL = {
  id: 'L001',
  name: '一层',
  elevation: 0,
  height: 4.5,
  sortOrder: 0,
  isDefault: true,
}

const DEFAULT_SITE_GEO = {
  latitude: 30.57,
  longitude: 104.07,
}

const DERIVED_LEVEL_FEATURE_PREFIX = 'building-floor:'

function generateStudioId(prefix = 'studio') {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function cloneStudioValue(value) {
  if (value === null || value === undefined) return value
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function pickNumber(value, fallback) {
  const nextValue = Number(value)
  return Number.isFinite(nextValue) ? nextValue : fallback
}

function pickString(value, fallback = '') {
  const nextValue = typeof value === 'string' ? value.trim() : ''
  return nextValue || fallback
}

function pickDefinedNumber(value) {
  const nextValue = Number(value)
  return Number.isFinite(nextValue) ? nextValue : null
}

function normalizeLevelMapStyleOverrides(value) {
  if (!isPlainObject(value)) return null

  const fillColor = pickString(value.fillColor, '')
  const strokeColor = pickString(value.strokeColor, '')
  const fillOpacity = pickDefinedNumber(value.fillOpacity)
  const strokeOpacity = pickDefinedNumber(value.strokeOpacity)
  const strokeWeight = pickDefinedNumber(value.strokeWeight)
  const overrides = {}

  if (fillColor) overrides.fillColor = fillColor
  if (strokeColor) overrides.strokeColor = strokeColor
  if (fillOpacity !== null) overrides.fillOpacity = Math.max(0, Math.min(1, fillOpacity))
  if (strokeOpacity !== null) overrides.strokeOpacity = Math.max(0, Math.min(1, strokeOpacity))
  if (strokeWeight !== null) overrides.strokeWeight = Math.max(0, strokeWeight)

  return Object.keys(overrides).length > 0 ? overrides : null
}

function getDerivedLevelDefaultStyle(level) {
  const warehouseCount = ensureArray(level?.warehouses).length
  return {
    warehouseCount,
    fillColor: warehouseCount > 0 ? '#c69214' : '#ffffff',
    fillOpacity: warehouseCount > 0 ? 0.68 : 0.28,
    strokeColor: warehouseCount > 0 ? '#7a5400' : '#cbd5e1',
    strokeOpacity: 0.92,
    strokeWeight: warehouseCount > 0 ? 2 : 1,
  }
}

function getDerivedLevelStyle(level) {
  return {
    ...getDerivedLevelDefaultStyle(level),
    ...(normalizeLevelMapStyleOverrides(level?.mapStyleOverrides) || {}),
  }
}

function isDerivedLevelFeatureRecord(record, source) {
  const recordId = typeof record?.id === 'string' ? record.id : ''
  const recordSource = typeof source === 'string' ? source : ''
  return recordId.startsWith(DERIVED_LEVEL_FEATURE_PREFIX)
    || recordSource === 'studio-building'
    || recordSource === 'studio-derived'
}

function collectDerivedLevelStyleOverrides(mapState) {
  const overrides = new Map()

  const registerOverride = (sourceRecord) => {
    const buildingId = pickString(sourceRecord?.buildingId, null)
    const levelId = pickString(sourceRecord?.levelId, null)
    const styleOverrides = normalizeLevelMapStyleOverrides(sourceRecord)

    if (!buildingId || !levelId || !styleOverrides) return
    overrides.set(`${buildingId}:${levelId}`, styleOverrides)
  }

  ensureArray(mapState?.drawnFeatures).forEach((feature) => {
    const props = isPlainObject(feature?.properties) ? feature.properties : {}
    if (!isDerivedLevelFeatureRecord(feature, props.source)) return
    registerOverride(props)
  })

  ensureArray(mapState?.treeNodes).forEach((node) => {
    if (!isDerivedLevelFeatureRecord(node, node?.source)) return
    registerOverride(node)
  })

  return overrides
}

function diffDerivedLevelStyleOverrides(level, nextStyleOverrides) {
  const normalizedOverrides = normalizeLevelMapStyleOverrides(nextStyleOverrides)
  if (!normalizedOverrides) return null

  const defaultStyle = getDerivedLevelDefaultStyle(level)
  const diff = {}

  if (normalizedOverrides.fillColor && normalizedOverrides.fillColor !== defaultStyle.fillColor) {
    diff.fillColor = normalizedOverrides.fillColor
  }

  if (normalizedOverrides.strokeColor && normalizedOverrides.strokeColor !== defaultStyle.strokeColor) {
    diff.strokeColor = normalizedOverrides.strokeColor
  }

  if (normalizedOverrides.fillOpacity !== undefined && normalizedOverrides.fillOpacity !== defaultStyle.fillOpacity) {
    diff.fillOpacity = normalizedOverrides.fillOpacity
  }

  if (normalizedOverrides.strokeOpacity !== undefined && normalizedOverrides.strokeOpacity !== defaultStyle.strokeOpacity) {
    diff.strokeOpacity = normalizedOverrides.strokeOpacity
  }

  if (normalizedOverrides.strokeWeight !== undefined && normalizedOverrides.strokeWeight !== defaultStyle.strokeWeight) {
    diff.strokeWeight = normalizedOverrides.strokeWeight
  }

  return Object.keys(diff).length > 0 ? diff : null
}

function applyDerivedLevelStyleOverrides(buildings, mapState) {
  const styleOverrideMap = collectDerivedLevelStyleOverrides(mapState)
  if (styleOverrideMap.size === 0) return ensureArray(buildings).map((building) => cloneStudioValue(building))

  return ensureArray(buildings).map((building) => ({
    ...cloneStudioValue(building),
    levels: ensureArray(building?.levels).map((level) => {
      const key = `${building.id}:${level.id}`
      if (!styleOverrideMap.has(key)) return cloneStudioValue(level)

      return {
        ...cloneStudioValue(level),
        mapStyleOverrides: diffDerivedLevelStyleOverrides(level, styleOverrideMap.get(key)),
      }
    }),
  }))
}

function normalizeDimensionRecord(value, sceneType = 'warehouse') {
  const defaults = sceneType === 'outdoor-event'
    ? DEFAULT_EVENT_DIMENSIONS_MM
    : DEFAULT_WAREHOUSE_DIMENSIONS_MM
  if (!isPlainObject(value)) return cloneStudioValue(defaults)
  return {
    width_mm: pickNumber(value.width_mm ?? value.widthMm, defaults.width_mm),
    depth_mm: pickNumber(value.depth_mm ?? value.depthMm, defaults.depth_mm),
    height_mm: pickNumber(value.height_mm ?? value.heightMm, defaults.height_mm),
  }
}

function mmToMeters(value, fallback = 0) {
  return pickNumber(value, fallback) / 1000
}

function createBuildingGeoAnchor(geoAnchor = null, { allowNull = false } = {}) {
  // 当明确允许 null 且传入值为 null/undefined 时，返回 null（未锚定建筑）
  if (allowNull && (geoAnchor === null || geoAnchor === undefined)) {
    return null
  }
  if (!isPlainObject(geoAnchor)) {
    return {
      ...DEFAULT_SITE_GEO,
      address: '',
    }
  }
  // 检查是否有有效的经纬度数值
  const lat = pickNumber(geoAnchor.latitude, null)
  const lng = pickNumber(geoAnchor.longitude, null)
  if (allowNull && lat === null && lng === null) {
    return null
  }
  return {
    latitude: lat ?? DEFAULT_SITE_GEO.latitude,
    longitude: lng ?? DEFAULT_SITE_GEO.longitude,
    address: pickString(geoAnchor.address, ''),
  }
}

export function isBuildingAnchored(building) {
  if (!isPlainObject(building)) return false
  const anchor = building.geoAnchor
  if (!isPlainObject(anchor)) return false
  return Number.isFinite(anchor.latitude) && Number.isFinite(anchor.longitude)
}

export function anchorBuilding(snapshot, buildingId, lngLat) {
  const normalized = normalizeStudioSnapshot(snapshot)
  const buildings = ensureArray(normalized.buildings).map((building) => {
    if (building.id !== buildingId) return building
    const geoAnchor = {
      latitude: lngLat.latitude,
      longitude: lngLat.longitude,
      address: building.address || '',
    }
    const footprint = createRectangleFootprint(
      geoAnchor,
      building.dimensionsMeters?.width ?? 36,
      building.dimensionsMeters?.depth ?? 24,
      building.headingDeg ?? 0,
    )
    return {
      ...building,
      geoAnchor,
      footprint,
      levels: ensureArray(building.levels).map((level) => ({
        ...level,
        footprint: level.footprint || footprint,
      })),
    }
  })
  return normalizeStudioSnapshot({
    ...normalized,
    buildings,
  }, {
    sceneType: normalized.sceneType,
    projectType: normalized.projectType,
    name: normalized.site?.name,
    geoAnchor: normalized.site?.geoAnchor,
  })
}

/**
 * 从 GeoJSON Polygon geometry 中提取中心经纬度。
 * 用于从拖拽后的 footprint 计算建筑新位置。
 */
export function extractFootprintCenter(geometry) {
  if (!isPlainObject(geometry) || geometry.type !== 'Polygon') return null
  const ring = ensureArray(geometry.coordinates?.[0])
  if (ring.length < 3) return null
  // 跳过尾部闭合点（最后一个点与第一个点相同）
  const pts = ring[ring.length - 1]?.[0] === ring[0]?.[0] && ring[ring.length - 1]?.[1] === ring[0]?.[1]
    ? ring.slice(0, -1)
    : ring
  if (pts.length === 0) return null
  let sumLng = 0
  let sumLat = 0
  for (const pt of pts) {
    sumLng += pt[0]
    sumLat += pt[1]
  }
  return {
    longitude: sumLng / pts.length,
    latitude: sumLat / pts.length,
  }
}

/**
 * 更新已锚定建筑的地理位置（拖拽平移后调用）。
 * - 重新设置 geoAnchor
 * - 用新中心点 + 原尺寸 + 原朝向 重建 footprint
 * - 同步更新所有楼层 footprint
 *
 * @param {object} snapshot   当前 studio snapshot
 * @param {string} buildingId 建筑ID
 * @param {{ latitude: number, longitude: number }} lngLat 新中心坐标
 * @param {number|null} headingDeg 新朝向角度（null 时保留原值）
 */
export function updateBuildingGeo(snapshot, buildingId, lngLat, headingDeg = null) {
  const normalized = normalizeStudioSnapshot(snapshot)
  const buildings = ensureArray(normalized.buildings).map((building) => {
    if (building.id !== buildingId) return building
    const geoAnchor = {
      latitude: lngLat.latitude,
      longitude: lngLat.longitude,
      address: building.geoAnchor?.address || building.address || '',
    }
    const nextHeading = headingDeg !== null ? headingDeg : (building.headingDeg ?? 0)
    const footprint = createRectangleFootprint(
      geoAnchor,
      building.dimensionsMeters?.width ?? 36,
      building.dimensionsMeters?.depth ?? 24,
      nextHeading,
    )
    return {
      ...building,
      geoAnchor,
      headingDeg: nextHeading,
      footprint,
      levels: ensureArray(building.levels).map((level) => ({
        ...level,
        footprint: footprint, // 楼层 footprint 跟随建筑
      })),
    }
  })
  return normalizeStudioSnapshot({
    ...normalized,
    buildings,
  }, {
    sceneType: normalized.sceneType,
    projectType: normalized.projectType,
    name: normalized.site?.name,
    geoAnchor: normalized.site?.geoAnchor,
  })
}

function createRectangleFootprint(geoAnchor, widthMeters = 36, depthMeters = 24, headingDeg = 0) {
  const latitude = pickNumber(geoAnchor?.latitude, DEFAULT_SITE_GEO.latitude)
  const longitude = pickNumber(geoAnchor?.longitude, DEFAULT_SITE_GEO.longitude)
  const halfWidth = widthMeters / 2
  const halfDepth = depthMeters / 2
  const headingRad = (pickNumber(headingDeg, 0) * Math.PI) / 180
  const cosHeading = Math.cos(headingRad)
  const sinHeading = Math.sin(headingRad)
  const metersPerDegreeLat = 111320
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos((latitude * Math.PI) / 180) || 1
  const corners = [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ].map(([x, y]) => {
    const rotatedX = x * cosHeading - y * sinHeading
    const rotatedY = x * sinHeading + y * cosHeading
    return [
      longitude + rotatedX / metersPerDegreeLng,
      latitude + rotatedY / metersPerDegreeLat,
    ]
  })

  return {
    type: 'Polygon',
    coordinates: [[...corners, corners[0]]],
  }
}

export function createDefaultMapState() {
  return {
    viewMode: '3DGlobe',
    tileStyle: 'satellite',
    browseState: {
      centerWgs84: [DEFAULT_SITE_GEO.latitude, DEFAULT_SITE_GEO.longitude],
      zoom: 16,
      headingDeg: 0,
      pitchDeg: 42,
      targetElevation: 0,
      cameraRangeMeters: 1600,
    },
    buildingStyle: 'none',
    hiddenOsmBuildings: [],
    treeNodes: [],
    drawnFeatures: [],
    models: [],
    placedModels: [],
  }
}

export function createSceneRoot(name = '未命名仓库', sceneType = 'warehouse', dimensionsMm = null, meta = {}) {
  return {
    id: meta.id || generateStudioId('warehouse-root'),
    code: meta.code || 'WH',
    name,
    dimensions_mm: normalizeDimensionRecord(dimensionsMm, sceneType),
    scene_version: 2,
    ...cloneStudioValue(meta.extra || {}),
  }
}

export function createBlankWarehouseScene({
  sceneType = 'warehouse',
  name = '未命名仓库',
  dimensionsMm = null,
  levelId = DEFAULT_STUDIO_LEVEL.id,
  warehouseId = null,
} = {}) {
  return {
    sceneType,
    warehouse: createSceneRoot(name, sceneType, dimensionsMm, {
      id: warehouseId || generateStudioId('warehouse'),
    }),
    zones: [],
    racks: [],
    locations: [],
    prefabs: [],
    walls: [],
    structures: [],
    levels: [cloneStudioValue({ ...DEFAULT_STUDIO_LEVEL, id: levelId })],
    activeLevelId: levelId,
    viewMode: 'single',
    measurements: [],
    assetPlacements: [],
  }
}

function createWhiteboxWalls(warehouseId, widthMeters, depthMeters, heightMeters) {
  const wallHeight = Math.max(pickNumber(heightMeters, 4.5), 2.8)
  const wallThickness = 0.2
  const wallPrefix = warehouseId || generateStudioId('warehouse')

  return [
    {
      id: `${wallPrefix}-wall-north`,
      start: { x: 0, z: 0 },
      end: { x: widthMeters, z: 0 },
      height: wallHeight,
      thickness: wallThickness,
      material: 'plaster',
      openings: [],
    },
    {
      id: `${wallPrefix}-wall-east`,
      start: { x: widthMeters, z: 0 },
      end: { x: widthMeters, z: depthMeters },
      height: wallHeight,
      thickness: wallThickness,
      material: 'plaster',
      openings: [],
    },
    {
      id: `${wallPrefix}-wall-south`,
      start: { x: widthMeters, z: depthMeters },
      end: { x: 0, z: depthMeters },
      height: wallHeight,
      thickness: wallThickness,
      material: 'plaster',
      openings: [],
    },
    {
      id: `${wallPrefix}-wall-west`,
      start: { x: 0, z: depthMeters },
      end: { x: 0, z: 0 },
      height: wallHeight,
      thickness: wallThickness,
      material: 'plaster',
      openings: [],
    },
  ]
}

function createWhiteboxWarehouseScene({
  sceneType = 'warehouse',
  name = '白模仓库',
  warehouseId = null,
  dimensionsMm = null,
  levelId = DEFAULT_STUDIO_LEVEL.id,
} = {}) {
  const nextDimensionsMm = normalizeDimensionRecord(dimensionsMm, sceneType)
  const widthMeters = mmToMeters(nextDimensionsMm.width_mm, DEFAULT_WAREHOUSE_DIMENSIONS_MM.width_mm)
  const depthMeters = mmToMeters(nextDimensionsMm.depth_mm, DEFAULT_WAREHOUSE_DIMENSIONS_MM.depth_mm)
  const heightMeters = mmToMeters(nextDimensionsMm.height_mm, DEFAULT_WAREHOUSE_DIMENSIONS_MM.height_mm)

  return {
    ...createBlankWarehouseScene({
      sceneType,
      name,
      warehouseId,
      dimensionsMm: nextDimensionsMm,
      levelId,
    }),
    walls: createWhiteboxWalls(warehouseId, widthMeters, depthMeters, heightMeters),
  }
}

function normalizeMapState(value) {
  const base = createDefaultMapState()
  if (!isPlainObject(value)) return base
  return {
    ...base,
    ...cloneStudioValue(value),
    browseState: {
      ...base.browseState,
      ...(isPlainObject(value.browseState) ? cloneStudioValue(value.browseState) : {}),
    },
    treeNodes: ensureArray(value.treeNodes).map((item) => cloneStudioValue(item)),
    drawnFeatures: ensureArray(value.drawnFeatures).map((item) => cloneStudioValue(item)),
    models: ensureArray(value.models).map((item) => cloneStudioValue(item)),
    placedModels: ensureArray(value.placedModels).map((item) => cloneStudioValue(item)),
  }
}

function derivePlacementsFromWarehouseScene(legacyScene, projectType) {
  const scene = isPlainObject(legacyScene) ? legacyScene : createBlankWarehouseScene()
  const rackPlacements = ensureArray(scene.racks).map((rack) => ({
    id: `rack:${rack.id}`,
    projectId: null,
    templateId: rack.rack_template_id || 'builtin-storage-rack',
    placementType: 'rack',
    parentNodeId: scene.warehouse?.id || 'warehouse-root',
    levelId: rack.levelId || scene.activeLevelId || DEFAULT_STUDIO_LEVEL.id,
    geoPosition: null,
    localTransform: {
      positionMm: cloneStudioValue(rack.position_mm || null),
      rotationDeg: cloneStudioValue(rack.rotation_deg ?? 0),
      scale: cloneStudioValue(rack.scale ?? 1),
    },
    quantity: 1,
    status: 'in-stock',
    inventoryAssetId: null,
    warehouseLocationId: null,
    metadata: {
      name: rack.name || rack.code || rack.id,
      kind: projectType === 'warehouse' ? 'storage' : 'structure',
    },
  }))

  const prefabPlacements = ensureArray(scene.prefabs).map((prefab) => ({
    id: `prefab:${prefab.id}`,
    projectId: null,
    templateId: prefab.prefabId || 'builtin-stage-platform',
    placementType: 'prefab',
    parentNodeId: scene.warehouse?.id || 'warehouse-root',
    levelId: prefab.levelId || scene.activeLevelId || DEFAULT_STUDIO_LEVEL.id,
    geoPosition: null,
    localTransform: {
      positionMm: prefab.position
        ? {
            x: Math.round((prefab.position.x || 0) * 1000),
            y: Math.round((prefab.position.y || 0) * 1000),
            z: Math.round((prefab.position.z || 0) * 1000),
          }
        : null,
      rotationDeg: prefab.rotationDeg ?? 0,
      scale: prefab.scale ?? 1,
    },
    quantity: 1,
    status: 'deployed',
    inventoryAssetId: null,
    warehouseLocationId: null,
    metadata: {
      name: prefab.name || prefab.prefabId || prefab.id,
      color: prefab.color || null,
    },
  }))

  const existing = ensureArray(scene.assetPlacements).filter((item) => item?.id)
  const derived = [...rackPlacements, ...prefabPlacements]
  const existingMap = new Map(existing.map((item) => [item.id, item]))

  return derived.map((placement) => {
    const previous = existingMap.get(placement.id)
    if (!previous) return placement
    return {
      ...previous,
      ...placement,
      metadata: {
        ...(previous.metadata || {}),
        ...(placement.metadata || {}),
      },
      inventoryAssetId: previous.inventoryAssetId ?? null,
      warehouseLocationId: previous.warehouseLocationId ?? null,
      quantity: previous.quantity ?? placement.quantity,
      status: previous.status || placement.status,
    }
  })
}

function deriveModelPlacementsFromMapState(mapState) {
  return ensureArray(mapState.placedModels).map((model) => ({
    id: `model:${model.id}`,
    projectId: null,
    templateId: model.modelId || model.id,
    placementType: 'model',
    parentNodeId: 'site-root',
    levelId: null,
    geoPosition: {
      longitude: model.placement?.longitude ?? 0,
      latitude: model.placement?.latitude ?? 0,
      height: model.placement?.height ?? 0,
    },
    localTransform: {
      heading: model.placement?.heading ?? 0,
      pitch: model.placement?.pitch ?? 0,
      roll: model.placement?.roll ?? 0,
      scale: model.placement?.scale ?? 1,
    },
    quantity: 1,
    status: 'deployed',
    inventoryAssetId: null,
    warehouseLocationId: null,
    metadata: {
      name: model.modelInfo?.name || model.id,
      modelUrl: model.modelInfo?.url || null,
      visible: model.visible !== false,
      locked: Boolean(model.locked),
    },
  }))
}

function deriveStructuresFromWarehouseScene(scene) {
  const currentScene = isPlainObject(scene) ? scene : createBlankWarehouseScene()
  const walls = ensureArray(currentScene.walls).map((wall) => ({
    id: `wall:${wall.id}`,
    structureType: 'wall',
    ...cloneStudioValue(wall),
  }))
  const structures = ensureArray(currentScene.structures).map((structure) => ({
    structureType: structure.structureType || structure.type || 'structure',
    ...cloneStudioValue(structure),
  }))
  return [...walls, ...structures]
}

export function normalizeWarehouseSceneSnapshot(snapshot, sceneType = 'warehouse', warehouseMeta = null) {
  const warehouseName = warehouseMeta?.name || snapshot?.warehouse?.name || '未命名仓库'
  const warehouseId = warehouseMeta?.id || snapshot?.warehouse?.id || generateStudioId('warehouse')
  const levelId = pickString(snapshot?.activeLevelId, warehouseMeta?.levelId || DEFAULT_STUDIO_LEVEL.id)
  const base = createBlankWarehouseScene({
    sceneType: snapshot?.sceneType || warehouseMeta?.sceneType || sceneType,
    name: warehouseName,
    warehouseId,
    dimensionsMm: warehouseMeta?.dimensionsMm || snapshot?.warehouse?.dimensions_mm || snapshot?.warehouse?.dimensionsMm,
    levelId,
  })

  if (!isPlainObject(snapshot)) return base

  const nextScene = {
    ...base,
    ...cloneStudioValue(snapshot),
    sceneType: snapshot.sceneType || base.sceneType,
    warehouse: {
      ...base.warehouse,
      ...(isPlainObject(snapshot.warehouse) ? cloneStudioValue(snapshot.warehouse) : {}),
      id: warehouseId,
      name: snapshot?.warehouse?.name || warehouseName,
      dimensions_mm: normalizeDimensionRecord(
        snapshot?.warehouse?.dimensions_mm || snapshot?.warehouse?.dimensionsMm || warehouseMeta?.dimensionsMm,
        snapshot.sceneType || base.sceneType,
      ),
    },
    zones: ensureArray(snapshot.zones).map((item) => cloneStudioValue(item)),
    racks: ensureArray(snapshot.racks).map((item) => cloneStudioValue(item)),
    locations: ensureArray(snapshot.locations).map((item) => cloneStudioValue(item)),
    prefabs: ensureArray(snapshot.prefabs).map((item) => cloneStudioValue(item)),
    walls: ensureArray(snapshot.walls).map((item) => cloneStudioValue(item)),
    structures: ensureArray(snapshot.structures).map((item) => cloneStudioValue(item)),
    levels: ensureArray(snapshot.levels).length > 0
      ? ensureArray(snapshot.levels).map((item, index) => ({
          ...cloneStudioValue(DEFAULT_STUDIO_LEVEL),
          ...cloneStudioValue(item),
          id: item?.id || `L${String(index + 1).padStart(3, '0')}`,
          elevation: pickNumber(item?.elevation, index * pickNumber(item?.height, DEFAULT_STUDIO_LEVEL.height)),
          height: pickNumber(item?.height, DEFAULT_STUDIO_LEVEL.height),
          sortOrder: pickNumber(item?.sortOrder, index),
        }))
      : [cloneStudioValue({ ...DEFAULT_STUDIO_LEVEL, id: levelId })],
    activeLevelId: levelId,
    viewMode: snapshot.viewMode || 'single',
    measurements: ensureArray(snapshot.measurements).map((item) => cloneStudioValue(item)),
    assetPlacements: ensureArray(snapshot.assetPlacements).map((item) => cloneStudioValue(item)),
  }

  nextScene.assetPlacements = derivePlacementsFromWarehouseScene(nextScene, 'warehouse')
  nextScene.editorDocument = snapshot?.editorDocument
    ? normalizeEditorDocument(snapshot.editorDocument)
    : createEditorDocumentFromWarehouseScene(nextScene)
  return nextScene
}

function createLevelRecord({
  id = null,
  name = '一层',
  elevation = 0,
  height = 4.5,
  sortOrder = 0,
  warehouses = [],
  footprint = null,
  mapStyleOverrides = null,
} = {}) {
  return {
    id: id || generateStudioId('level'),
    name,
    elevation: pickNumber(elevation, 0),
    height: pickNumber(height, DEFAULT_STUDIO_LEVEL.height),
    sortOrder: pickNumber(sortOrder, 0),
    footprint: isPlainObject(footprint) ? cloneStudioValue(footprint) : null,
    mapStyleOverrides: normalizeLevelMapStyleOverrides(mapStyleOverrides),
    warehouses: ensureArray(warehouses).map((item) => cloneStudioValue(item)),
  }
}

function createWarehouseRecord({
  id = null,
  name = '未命名仓库',
  code = '',
  sceneType = 'warehouse',
  dimensionsMm = null,
  levelId = DEFAULT_STUDIO_LEVEL.id,
  buildingId = null,
  sceneSnapshot = null,
} = {}) {
  const warehouseId = id || generateStudioId('warehouse')
  const nextDimensionsMm = normalizeDimensionRecord(dimensionsMm, sceneType)
  const seededSceneSnapshot = sceneSnapshot || createWhiteboxWarehouseScene({
    sceneType,
    name,
    warehouseId,
    dimensionsMm: nextDimensionsMm,
    levelId,
  })

  return {
    id: warehouseId,
    name,
    code: code || '',
    sceneType,
    buildingId: buildingId || null,
    levelId: levelId || DEFAULT_STUDIO_LEVEL.id,
    dimensionsMm: nextDimensionsMm,
    sceneSnapshot: normalizeWarehouseSceneSnapshot(seededSceneSnapshot, sceneType, {
      id: warehouseId,
      name,
      levelId,
      dimensionsMm: nextDimensionsMm,
      sceneType,
    }),
  }
}

function createBuildingRecord({
  id = null,
  name = '未命名建筑',
  address = '',
  geoAnchor = null,
  footprint = null,
  widthMeters = 36,
  depthMeters = 24,
  headingDeg = 0,
  floorCount = 1,
  floorHeight = 4.5,
  levels = [],
  sceneType = 'warehouse',
  orgId = null,
  allowNullGeoAnchor = false,
} = {}) {
  // 如果 allowNullGeoAnchor=true 且 geoAnchor 确实为 null，则保持为 null（未锚定建筑）
  const nextGeoAnchor = allowNullGeoAnchor
    ? createBuildingGeoAnchor(
        isPlainObject(geoAnchor) ? { ...geoAnchor, address } : geoAnchor,
        { allowNull: true },
      )
    : createBuildingGeoAnchor({
        ...createBuildingGeoAnchor(geoAnchor),
        address,
      })
  const nextWidth = pickNumber(widthMeters, 36)
  const nextDepth = pickNumber(depthMeters, 24)
  const buildingId = id || generateStudioId('building')
  const normalizedLevels = ensureArray(levels).length > 0
    ? ensureArray(levels).map((level, index) => createLevelRecord({
        ...level,
        sortOrder: pickNumber(level?.sortOrder, index),
      }))
    : Array.from({ length: Math.max(1, Math.round(pickNumber(floorCount, 1))) }, (_, index) => createLevelRecord({
        name: index === 0 ? '一层' : `${index + 1}层`,
        elevation: index * pickNumber(floorHeight, 4.5),
        height: pickNumber(floorHeight, 4.5),
        sortOrder: index,
      }))

  // 未锚定建筑不生成 footprint
  const needsFootprint = nextGeoAnchor !== null
  return {
    id: buildingId,
    orgId: orgId || null,
    name,
    address,
    geoAnchor: nextGeoAnchor,
    footprint: needsFootprint
      ? (isPlainObject(footprint) ? cloneStudioValue(footprint) : createRectangleFootprint(nextGeoAnchor, nextWidth, nextDepth, headingDeg))
      : null,
    dimensionsMeters: {
      width: nextWidth,
      depth: nextDepth,
      height: normalizedLevels.reduce((sum, level) => sum + pickNumber(level.height, 0), 0),
    },
    headingDeg: pickNumber(headingDeg, 0),
    levels: normalizedLevels.map((level, index) => ({
      ...level,
      sortOrder: pickNumber(level.sortOrder, index),
      warehouses: (ensureArray(level.warehouses).length > 0 ? ensureArray(level.warehouses) : [{
        id: `warehouse-${buildingId}-${level.id}`,
        name: `${level.name || `第${index + 1}层`}白模`,
        code: '',
        sceneType,
        dimensionsMm: {
          width_mm: Math.round(nextWidth * 1000),
          depth_mm: Math.round(nextDepth * 1000),
          height_mm: Math.round(pickNumber(level.height, DEFAULT_STUDIO_LEVEL.height) * 1000),
        },
      }]).map((warehouse) => createWarehouseRecord({
        ...warehouse,
        buildingId,
        levelId: warehouse.levelId || level.id,
        sceneType: warehouse.sceneType || sceneType,
        dimensionsMm: warehouse.dimensionsMm || {
          width_mm: Math.round(nextWidth * 1000),
          depth_mm: Math.round(nextDepth * 1000),
          height_mm: Math.round(pickNumber(level.height, DEFAULT_STUDIO_LEVEL.height) * 1000),
        },
      })),
    })),
  }
}

function isLegacyStudioSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) return false
  if (Array.isArray(snapshot.buildings) && snapshot.buildings.some((item) => Array.isArray(item?.levels))) return false
  return Boolean(snapshot.warehouse || snapshot.racks || snapshot.locations || snapshot.prefabs || snapshot.walls)
}

function hasUsableHierarchyBuildings(snapshot) {
  return ensureArray(snapshot?.buildings).some((building) =>
    ensureArray(building?.levels).some((level) => ensureArray(level?.warehouses).length > 0),
  )
}

function editorDocumentEntityCount(document) {
  if (!isPlainObject(document)) return 0
  return ensureArray(document.vertices).length
    + ensureArray(document.segments).length
    + ensureArray(document.profiles).length
    + ensureArray(document.solids).length
    + ensureArray(document.surfaces).length
    + ensureArray(document.instances).length
    + ensureArray(document.terrainMeshes).length
}

function hierarchyEditorDocumentEntityCount(snapshot) {
  let count = 0
  ensureArray(snapshot?.buildings).forEach((building) => {
    ensureArray(building?.levels).forEach((level) => {
      ensureArray(level?.warehouses).forEach((warehouse) => {
        count = Math.max(count, editorDocumentEntityCount(warehouse?.sceneSnapshot?.editorDocument))
      })
    })
  })
  return count
}

function isDirectEditorSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) return false
  if (hasUsableHierarchyBuildings(snapshot)) {
    return editorDocumentEntityCount(snapshot.editorDocument) > hierarchyEditorDocumentEntityCount(snapshot)
  }
  return isPlainObject(snapshot.editorDocument)
}

function wrapDirectEditorSnapshotAsHierarchy(snapshot, sceneType, projectType, projectName, geoAnchor = null) {
  const normalizedScene = normalizeWarehouseSceneSnapshot(snapshot, sceneType, {
    id: snapshot?.editorState?.activeWarehouseId || snapshot?.warehouse?.id,
    name: snapshot?.warehouse?.name || projectName,
  })
  const levelId = normalizedScene.activeLevelId || DEFAULT_STUDIO_LEVEL.id
  const building = createBuildingRecord({
    name: snapshot?.focusZoneName || snapshot?.warehouse?.name || projectName,
    address: '',
    geoAnchor,
    widthMeters: mmToMeters(normalizedScene.warehouse?.dimensions_mm?.width_mm, sceneType === 'outdoor-event' ? 32000 : 24000),
    depthMeters: mmToMeters(normalizedScene.warehouse?.dimensions_mm?.depth_mm, sceneType === 'outdoor-event' ? 24000 : 18000),
    floorCount: 1,
    floorHeight: mmToMeters(normalizedScene.warehouse?.dimensions_mm?.height_mm, sceneType === 'outdoor-event' ? 12000 : 9000),
    sceneType,
    allowNullGeoAnchor: geoAnchor === null,
    levels: [createLevelRecord({
      id: levelId,
      name: '一层',
      elevation: 0,
      height: mmToMeters(normalizedScene.warehouse?.dimensions_mm?.height_mm, sceneType === 'outdoor-event' ? 12000 : 9000),
      warehouses: [createWarehouseRecord({
        id: normalizedScene.warehouse?.id,
        name: normalizedScene.warehouse?.name || projectName,
        sceneType,
        dimensionsMm: normalizedScene.warehouse?.dimensions_mm,
        levelId,
        sceneSnapshot: normalizedScene,
      })],
    })],
  })

  return {
    ...createBlankStudioScene({ sceneType, projectType, name: projectName }),
    ...cloneStudioValue(snapshot),
    sceneType,
    projectType,
    site: {
      id: snapshot?.site?.id || 'site-root',
      name: projectName,
      projectType,
      geoAnchor: snapshot?.site?.geoAnchor || geoAnchor || null,
      orgId: snapshot?.site?.orgId || snapshot?.orgId || null,
    },
    buildings: [building],
    raceBindings: ensureArray(snapshot?.raceBindings).map((item) => cloneStudioValue(item)),
    mapLayers: ensureArray(snapshot?.mapLayers).map((item) => cloneStudioValue(item)),
    operationOverlays: {
      measurements: cloneStudioValue(snapshot?.operationOverlays?.measurements || normalizedScene.measurements || []),
      notes: ensureArray(snapshot?.operationOverlays?.notes).map((item) => cloneStudioValue(item)),
    },
    cameraState: cloneStudioValue(snapshot?.cameraState || null),
    editorState: {
      ...(isPlainObject(snapshot?.editorState) ? cloneStudioValue(snapshot.editorState) : {}),
      map: normalizeMapState(snapshot?.editorState?.map),
      activeBuildingId: building.id,
      activeLevelId: levelId,
      activeWarehouseId: building.levels?.[0]?.warehouses?.[0]?.id || null,
      activeWorkspaceMode: 'warehouse',
    },
  }
}

function wrapLegacySceneAsHierarchy(snapshot, sceneType, projectType, projectName) {
  const normalizedScene = normalizeWarehouseSceneSnapshot(snapshot, sceneType, {
    name: snapshot?.warehouse?.name || projectName,
  })
  const building = createBuildingRecord({
    name: snapshot?.warehouse?.name || projectName,
    address: '',
    sceneType,
    widthMeters: mmToMeters(normalizedScene.warehouse?.dimensions_mm?.width_mm, 24000),
    depthMeters: mmToMeters(normalizedScene.warehouse?.dimensions_mm?.depth_mm, 18000),
    floorCount: 1,
    floorHeight: mmToMeters(normalizedScene.warehouse?.dimensions_mm?.height_mm, 9000),
    levels: [createLevelRecord({
      id: normalizedScene.activeLevelId || DEFAULT_STUDIO_LEVEL.id,
      name: '一层',
      elevation: 0,
      height: mmToMeters(normalizedScene.warehouse?.dimensions_mm?.height_mm, 9000),
      warehouses: [createWarehouseRecord({
        id: normalizedScene.warehouse?.id,
        name: normalizedScene.warehouse?.name || projectName,
        sceneType,
        dimensionsMm: normalizedScene.warehouse?.dimensions_mm,
        levelId: normalizedScene.activeLevelId || DEFAULT_STUDIO_LEVEL.id,
        sceneSnapshot: normalizedScene,
      })],
    })],
  })

  return {
    sceneType,
    projectType,
    site: {
      id: 'site-root',
      name: projectName,
      projectType,
      geoAnchor: null,
    },
    buildings: [building],
    raceBindings: [],
    mapLayers: [],
    operationOverlays: {
      measurements: cloneStudioValue(normalizedScene.measurements || []),
      notes: [],
    },
    cameraState: null,
    editorState: {
      map: snapshot?.editorState?.map || createDefaultMapState(),
      activeBuildingId: building.id,
      activeLevelId: building.levels[0]?.id || null,
      activeWarehouseId: building.levels[0]?.warehouses?.[0]?.id || null,
      activeWorkspaceMode: 'warehouse',
    },
  }
}

function normalizeBuildingRecord(building, fallbackProjectName, projectOrgId = null, sceneType = 'warehouse') {
  const nextBuilding = createBuildingRecord({
    ...cloneStudioValue(building),
    name: building?.name || fallbackProjectName,
    orgId: building?.orgId || projectOrgId || null,
    sceneType,
  })

  return {
    ...nextBuilding,
    levels: ensureArray(nextBuilding.levels).map((level, index) => ({
      ...createLevelRecord({
        ...level,
        sortOrder: pickNumber(level?.sortOrder, index),
      }),
      warehouses: ensureArray(level.warehouses).map((warehouse) => createWarehouseRecord({
        ...warehouse,
        buildingId: nextBuilding.id,
        levelId: warehouse?.levelId || level.id,
        sceneType: warehouse?.sceneType || sceneType,
        dimensionsMm: warehouse?.dimensionsMm || warehouse?.sceneSnapshot?.warehouse?.dimensions_mm,
      })),
    })),
  }
}

function flattenLevels(buildings) {
  return ensureArray(buildings).flatMap((building) =>
    ensureArray(building.levels).map((level) => ({
      ...cloneStudioValue(level),
      buildingId: building.id,
      buildingName: building.name,
    })),
  )
}

function flattenWarehouses(buildings) {
  return ensureArray(buildings).flatMap((building) =>
    ensureArray(building.levels).flatMap((level) =>
      ensureArray(level.warehouses).map((warehouse) => ({
        ...cloneStudioValue(warehouse),
        buildingId: building.id,
        buildingName: building.name,
        levelId: level.id,
        levelName: level.name,
      })),
    ),
  )
}

function buildPlacementList(buildings, projectType, mapState) {
  const warehousePlacements = flattenWarehouses(buildings).flatMap((warehouse) =>
    derivePlacementsFromWarehouseScene(warehouse.sceneSnapshot, projectType).map((placement) => ({
      ...placement,
      warehouseId: warehouse.id,
      buildingId: warehouse.buildingId,
      levelId: placement.levelId || warehouse.levelId,
      metadata: {
        ...(placement.metadata || {}),
        warehouseName: warehouse.name,
        buildingName: warehouse.buildingName,
        levelName: warehouse.levelName,
      },
    })),
  )

  return [...warehousePlacements, ...deriveModelPlacementsFromMapState(mapState)]
}

function findSelection(buildings, editorState) {
  const flattenedLevels = flattenLevels(buildings)
  const flattenedWarehouses = flattenWarehouses(buildings)
  const activeBuilding = ensureArray(buildings).find((building) => building.id === editorState.activeBuildingId) || ensureArray(buildings)[0] || null
  const activeLevel = flattenedLevels.find((level) => level.id === editorState.activeLevelId && level.buildingId === (activeBuilding?.id || level.buildingId))
    || ensureArray(activeBuilding?.levels)[0]
    || flattenedLevels[0]
    || null
  const activeWarehouse = flattenedWarehouses.find((warehouse) => warehouse.id === editorState.activeWarehouseId)
    || ensureArray(activeLevel?.warehouses)[0]
    || flattenedWarehouses[0]
    || null

  return {
    activeBuilding,
    activeLevel,
    activeWarehouse,
  }
}

function filterCustomMapFeatures(mapState) {
  return {
    ...mapState,
    drawnFeatures: ensureArray(mapState.drawnFeatures).filter((feature) => !feature?.properties?.studioDerived),
    treeNodes: ensureArray(mapState.treeNodes).filter((node) => node?.source !== 'studio-derived'),
  }
}

function buildBuildingFeature(building, level) {
  // 未锚定建筑（无 geoAnchor）不生成地图 feature
  if (!isBuildingAnchored(building)) return null
  const levelStyle = getDerivedLevelStyle(level)
  return {
    type: 'Feature',
    id: `building-floor:${building.id}:${level.id}`,
    geometry: cloneStudioValue(level.footprint || building.footprint),
    properties: {
      id: `building-floor:${building.id}:${level.id}`,
      name: `${building.name} · ${level.name}`,
      buildingId: building.id,
      levelId: level.id,
      warehouseIds: ensureArray(level.warehouses).map((warehouse) => warehouse.id),
      source: 'studio-building',
      studioDerived: true,
      featureType: 'polygon',
      fillColor: levelStyle.fillColor,
      fillOpacity: levelStyle.fillOpacity,
      strokeColor: levelStyle.strokeColor,
      strokeOpacity: levelStyle.strokeOpacity,
      strokeWeight: levelStyle.strokeWeight,
      baseHeightMeters: pickNumber(level.elevation, 0),
      heightMeters: pickNumber(level.height, DEFAULT_STUDIO_LEVEL.height),
      extrudedHeight: pickNumber(level.elevation, 0) + pickNumber(level.height, DEFAULT_STUDIO_LEVEL.height),
      warehouseCount: levelStyle.warehouseCount,
    },
  }
}

function buildBuildingTreeNodes(buildings) {
  return ensureArray(buildings).flatMap((building) => {
    // 未锚定建筑不生成地图对象树节点
    if (!isBuildingAnchored(building)) return []
    return ensureArray(building.levels).map((level) => {
      const levelStyle = getDerivedLevelStyle(level)
      return {
        id: `building-floor:${building.id}:${level.id}`,
        name: `${building.name} / ${level.name}`,
        type: 'feature',
        icon: levelStyle.warehouseCount > 0 ? '🏬' : '⬜',
        visible: true,
        source: 'studio-derived',
        featureType: 'polygon',
        fillColor: levelStyle.fillColor,
        fillOpacity: levelStyle.fillOpacity,
        strokeColor: levelStyle.strokeColor,
        strokeOpacity: levelStyle.strokeOpacity,
        strokeWeight: levelStyle.strokeWeight,
        buildingId: building.id,
        levelId: level.id,
        warehouseIds: ensureArray(level.warehouses).map((warehouse) => warehouse.id),
        geometry: cloneStudioValue(level.footprint || building.footprint),
      }
    })
  })
}

export function buildStudioMapState(snapshot) {
  const normalized = normalizeStudioSnapshot(snapshot)
  const baseMap = filterCustomMapFeatures(normalized.editorState?.map || createDefaultMapState())
  const derivedFeatures = ensureArray(normalized.buildings).flatMap((building) =>
    ensureArray(building.levels).map((level) => buildBuildingFeature(building, level)),
  ).filter(Boolean) // 过滤掉未锚定建筑返回的 null
  const derivedTreeNodes = buildBuildingTreeNodes(normalized.buildings)

  return {
    ...baseMap,
    browseState: cloneStudioValue(normalized.cameraState?.browseState || baseMap.browseState),
    viewMode: normalized.cameraState?.viewMode || baseMap.viewMode,
    tileStyle: normalized.cameraState?.tileStyle || baseMap.tileStyle,
    buildingStyle: normalized.cameraState?.referenceBuildingsEnabled ? 'osm' : (normalized.cameraState?.buildingStyle || 'none'),
    drawnFeatures: [...ensureArray(baseMap.drawnFeatures), ...derivedFeatures],
    treeNodes: [...ensureArray(baseMap.treeNodes), ...derivedTreeNodes],
  }
}

export function createBlankStudioScene({
  sceneType = 'warehouse',
  projectType = sceneType === 'warehouse' ? 'warehouse' : 'site',
  name = '未命名项目',
} = {}) {
  return {
    sceneType,
    projectType,
    site: {
      id: 'site-root',
      name,
      projectType,
      geoAnchor: null,
    },
    buildings: [],
    raceBindings: [],
    mapLayers: [],
    operationOverlays: {
      measurements: [],
      notes: [],
    },
    cameraState: {
      browseState: cloneStudioValue(createDefaultMapState().browseState),
      viewMode: createDefaultMapState().viewMode,
      tileStyle: createDefaultMapState().tileStyle,
      buildingStyle: 'none',
      referenceBuildingsEnabled: false,
    },
    editorState: {
      map: createDefaultMapState(),
      activeBuildingId: null,
      activeLevelId: null,
      activeWarehouseId: null,
      activeWorkspaceMode: 'map',
    },
  }
}

function parseNormalizeOptions(options) {
  if (typeof options === 'string') {
    return { sceneType: options }
  }
  return options || {}
}

export function normalizeStudioSnapshot(snapshot, options = {}) {
  const normalizedOptions = parseNormalizeOptions(options)
  const baseSnapshot = isLegacyStudioSnapshot(snapshot)
    ? wrapLegacySceneAsHierarchy(
        snapshot,
        normalizedOptions.sceneType || snapshot?.sceneType || 'warehouse',
        normalizedOptions.projectType || snapshot?.projectType || 'warehouse',
        normalizedOptions.name || snapshot?.site?.name || snapshot?.warehouse?.name || '未命名项目',
      )
    : isDirectEditorSnapshot(snapshot)
      ? wrapDirectEditorSnapshotAsHierarchy(
          snapshot,
          normalizedOptions.sceneType || snapshot?.sceneType || 'warehouse',
          normalizedOptions.projectType || snapshot?.projectType || 'warehouse',
          normalizedOptions.name || snapshot?.site?.name || snapshot?.warehouse?.name || snapshot?.focusZoneName || '未命名项目',
          normalizedOptions.geoAnchor || snapshot?.site?.geoAnchor || null,
        )
    : {
        ...createBlankStudioScene(normalizedOptions),
        ...(isPlainObject(snapshot) ? cloneStudioValue(snapshot) : {}),
      }

  const sceneType = baseSnapshot.sceneType || normalizedOptions.sceneType || 'warehouse'
  const projectType = baseSnapshot.projectType || normalizedOptions.projectType || (sceneType === 'warehouse' ? 'warehouse' : 'site')
  const siteName = normalizedOptions.name || baseSnapshot?.site?.name || '未命名项目'
  const orgId = baseSnapshot.orgId || baseSnapshot.site?.orgId || null
  const buildings = ensureArray(baseSnapshot.buildings).map((building) =>
    normalizeBuildingRecord(building, siteName, orgId, sceneType),
  )
  const editorState = {
    map: normalizeMapState(baseSnapshot?.editorState?.map),
    activeBuildingId: pickString(baseSnapshot?.editorState?.activeBuildingId, null),
    activeLevelId: pickString(baseSnapshot?.editorState?.activeLevelId, null),
    activeWarehouseId: pickString(baseSnapshot?.editorState?.activeWarehouseId, null),
    activeWorkspaceMode: pickString(baseSnapshot?.editorState?.activeWorkspaceMode, 'map'),
  }
  const selection = findSelection(buildings, editorState)
  editorState.activeBuildingId = selection.activeBuilding?.id || null
  editorState.activeLevelId = selection.activeLevel?.id || null
  editorState.activeWarehouseId = selection.activeWarehouse?.id || null
  const warehouseScene = selection.activeWarehouse
    ? normalizeWarehouseSceneSnapshot(selection.activeWarehouse.sceneSnapshot, sceneType, {
        id: selection.activeWarehouse.id,
        name: selection.activeWarehouse.name,
        levelId: selection.activeWarehouse.levelId,
        dimensionsMm: selection.activeWarehouse.dimensionsMm,
        sceneType: selection.activeWarehouse.sceneType || sceneType,
      })
    : null
  const levels = flattenLevels(buildings)
  const warehouses = flattenWarehouses(buildings)
  const mapState = normalizeMapState(editorState.map)
  const assetPlacements = buildPlacementList(buildings, projectType, mapState)
  const operationMeasurements = selection.activeWarehouse?.sceneSnapshot?.measurements
    || ensureArray(baseSnapshot?.operationOverlays?.measurements)
  const structures = warehouses.flatMap((warehouse) => deriveStructuresFromWarehouseScene(warehouse.sceneSnapshot))
  const zones = warehouses.flatMap((warehouse) => ensureArray(warehouse.sceneSnapshot?.zones).map((zone) => ({
    ...cloneStudioValue(zone),
    warehouseId: warehouse.id,
    buildingId: warehouse.buildingId,
    levelId: warehouse.levelId,
  })))
  const storageAreas = warehouses.flatMap((warehouse) => ensureArray(warehouse.sceneSnapshot?.locations).map((location) => ({
    ...cloneStudioValue(location),
    warehouseId: warehouse.id,
    buildingId: warehouse.buildingId,
    levelId: warehouse.levelId,
  })))

  return {
    ...cloneStudioValue(baseSnapshot),
    sceneType,
    projectType,
    site: {
      id: baseSnapshot?.site?.id || 'site-root',
      name: siteName,
      projectType,
      geoAnchor: isPlainObject(baseSnapshot?.site?.geoAnchor)
        ? cloneStudioValue(baseSnapshot.site.geoAnchor)
        : normalizedOptions.geoAnchor || null,
      orgId,
    },
    buildings,
    levels,
    warehouses,
    zones,
    structures,
    storageAreas,
    assetPlacements,
    raceBindings: ensureArray(baseSnapshot?.raceBindings).map((item) => ({
      ...cloneStudioValue(item),
      warehouseIds: ensureArray(item?.warehouseIds),
      mode: item?.mode || 'reference',
      status: item?.status || 'active',
    })),
    mapLayers: ensureArray(baseSnapshot?.mapLayers).map((item) => cloneStudioValue(item)),
    operationOverlays: {
      measurements: cloneStudioValue(operationMeasurements || []),
      notes: ensureArray(baseSnapshot?.operationOverlays?.notes).map((item) => cloneStudioValue(item)),
    },
    cameraState: {
      browseState: cloneStudioValue(baseSnapshot?.cameraState?.browseState || mapState.browseState),
      viewMode: baseSnapshot?.cameraState?.viewMode || mapState.viewMode,
      tileStyle: baseSnapshot?.cameraState?.tileStyle || mapState.tileStyle,
      referenceBuildingsEnabled: baseSnapshot?.cameraState?.referenceBuildingsEnabled ?? false,
      showBuildings: baseSnapshot?.cameraState?.referenceBuildingsEnabled ?? false,
    },
    editorState: {
      ...editorState,
      map: mapState,
      legacyScene: warehouseScene,
    },
  }
}

export function getStudioHierarchy(snapshot) {
  const normalized = normalizeStudioSnapshot(snapshot)
  const { activeBuilding, activeLevel, activeWarehouse } = findSelection(normalized.buildings, normalized.editorState || {})
  return {
    buildings: normalized.buildings,
    activeBuilding,
    activeLevel,
    activeWarehouse,
  }
}

export function setStudioSelection(snapshot, selection = {}) {
  const normalized = normalizeStudioSnapshot(snapshot)
  return normalizeStudioSnapshot({
    ...normalized,
    editorState: {
      ...normalized.editorState,
      activeBuildingId: selection.activeBuildingId !== undefined ? selection.activeBuildingId : normalized.editorState.activeBuildingId,
      activeLevelId: selection.activeLevelId !== undefined ? selection.activeLevelId : normalized.editorState.activeLevelId,
      activeWarehouseId: selection.activeWarehouseId !== undefined ? selection.activeWarehouseId : normalized.editorState.activeWarehouseId,
      activeWorkspaceMode: selection.activeWorkspaceMode !== undefined ? selection.activeWorkspaceMode : normalized.editorState.activeWorkspaceMode,
    },
  }, {
    sceneType: normalized.sceneType,
    projectType: normalized.projectType,
    name: normalized.site?.name,
    geoAnchor: normalized.site?.geoAnchor,
  })
}

export function mergeWarehouseSceneIntoSnapshot(snapshot, warehouseId, nextScene) {
  const normalized = normalizeStudioSnapshot(snapshot)
  if (!warehouseId) return normalized

  const buildings = normalized.buildings.map((building) => ({
    ...building,
    levels: ensureArray(building.levels).map((level) => ({
      ...level,
      warehouses: ensureArray(level.warehouses).map((warehouse) => {
        if (warehouse.id !== warehouseId) return warehouse
        return {
          ...warehouse,
          sceneSnapshot: normalizeWarehouseSceneSnapshot(nextScene, warehouse.sceneType || normalized.sceneType, {
            id: warehouse.id,
            name: nextScene?.warehouse?.name || warehouse.name,
            levelId: warehouse.levelId,
            dimensionsMm: warehouse.dimensionsMm,
            sceneType: warehouse.sceneType || normalized.sceneType,
          }),
          name: nextScene?.warehouse?.name || warehouse.name,
          dimensionsMm: normalizeDimensionRecord(
            nextScene?.warehouse?.dimensions_mm || nextScene?.warehouse?.dimensionsMm || warehouse.dimensionsMm,
            warehouse.sceneType || normalized.sceneType,
          ),
        }
      }),
    })),
  }))

  return normalizeStudioSnapshot({
    ...normalized,
    buildings,
    editorState: {
      ...normalized.editorState,
      activeWarehouseId: warehouseId,
    },
  }, {
    sceneType: normalized.sceneType,
    projectType: normalized.projectType,
    name: normalized.site?.name,
    geoAnchor: normalized.site?.geoAnchor,
  })
}

export function mergeLegacySceneIntoSnapshot(snapshot, nextScene) {
  const normalized = normalizeStudioSnapshot(snapshot)
  if (!normalized.editorState?.activeWarehouseId) return normalized
  return mergeWarehouseSceneIntoSnapshot(normalized, normalized.editorState.activeWarehouseId, nextScene)
}

export function mergeMapStateIntoSnapshot(snapshot, mapState) {
  const normalized = normalizeStudioSnapshot(snapshot)
  const normalizedMapState = normalizeMapState(mapState)
  const sanitized = filterCustomMapFeatures(normalizedMapState)
  return normalizeStudioSnapshot({
    ...normalized,
    buildings: applyDerivedLevelStyleOverrides(normalized.buildings, normalizedMapState),
    editorState: {
      ...normalized.editorState,
      map: sanitized,
    },
    cameraState: {
      browseState: cloneStudioValue(sanitized.browseState),
      viewMode: sanitized.viewMode,
      tileStyle: sanitized.tileStyle,
      referenceBuildingsEnabled: sanitized.buildingStyle !== 'none',
      buildingStyle: sanitized.buildingStyle || 'none',
    },
  }, {
    sceneType: normalized.sceneType,
    projectType: normalized.projectType,
    name: normalized.site?.name,
    geoAnchor: normalized.site?.geoAnchor,
  })
}

export function getProjectNameFromScene(scene, fallback = '未命名项目') {
  const normalized = normalizeStudioSnapshot(scene)
  return normalized.site?.name
    || normalized.editorState?.legacyScene?.warehouse?.name
    || normalized.buildings?.[0]?.name
    || fallback
}

export function getThumbnailScene(snapshot) {
  const normalized = normalizeStudioSnapshot(snapshot)
  return normalized.editorState?.legacyScene
    || normalized.warehouses?.[0]?.sceneSnapshot
    || createBlankWarehouseScene({ sceneType: normalized.sceneType, name: normalized.site?.name || '未命名仓库' })
}

export function buildImportedWarehouseSnapshot({ warehouseId, projectType, sceneType, payload }) {
  const warehouseName = payload?.warehouse?.name || '导入仓库'
  const importedScene = normalizeWarehouseSceneSnapshot({
    sceneType,
    warehouse: payload?.warehouse || createSceneRoot(warehouseName, sceneType),
    zones: payload?.zones || [],
    racks: payload?.racks || [],
    locations: payload?.locations || [],
    prefabs: [],
    walls: [],
    structures: [],
    levels: [cloneStudioValue(DEFAULT_STUDIO_LEVEL)],
    activeLevelId: DEFAULT_STUDIO_LEVEL.id,
    viewMode: 'single',
    measurements: [],
  }, sceneType, {
    name: warehouseName,
    levelId: DEFAULT_STUDIO_LEVEL.id,
  })

  const building = createBuildingRecord({
    name: warehouseName,
    address: '',
    sceneType,
    widthMeters: mmToMeters(importedScene.warehouse?.dimensions_mm?.width_mm, 24000),
    depthMeters: mmToMeters(importedScene.warehouse?.dimensions_mm?.depth_mm, 18000),
    floorCount: 1,
    floorHeight: mmToMeters(importedScene.warehouse?.dimensions_mm?.height_mm, 9000),
    levels: [createLevelRecord({
      id: DEFAULT_STUDIO_LEVEL.id,
      name: '一层',
      elevation: 0,
      height: mmToMeters(importedScene.warehouse?.dimensions_mm?.height_mm, 9000),
      warehouses: [createWarehouseRecord({
        id: payload?.warehouse?.id ? `warehouse-${payload.warehouse.id}` : generateStudioId('warehouse'),
        name: warehouseName,
        sceneType,
        dimensionsMm: importedScene.warehouse?.dimensions_mm,
        levelId: DEFAULT_STUDIO_LEVEL.id,
        sceneSnapshot: importedScene,
      })],
    })],
  })

  return normalizeStudioSnapshot({
    sceneType,
    projectType,
    site: {
      id: `site-${warehouseId}`,
      name: warehouseName,
      projectType,
      geoAnchor: null,
    },
    buildings: [building],
    raceBindings: [],
    mapLayers: [],
    operationOverlays: {
      measurements: cloneStudioValue(importedScene.measurements || []),
      notes: [],
    },
    editorState: {
      map: createDefaultMapState(),
      activeBuildingId: building.id,
      activeLevelId: DEFAULT_STUDIO_LEVEL.id,
      activeWarehouseId: building.levels?.[0]?.warehouses?.[0]?.id || null,
      activeWorkspaceMode: 'warehouse',
    },
  }, {
    sceneType,
    projectType,
    name: warehouseName,
    geoAnchor: null,
  })
}

export function createStudioBuildingDraft({
  name = '未命名建筑',
  address = '',
  latitude = null,
  longitude = null,
  widthMeters = 36,
  depthMeters = 24,
  headingDeg = 0,
  floorCount = 3,
  floorHeight = 4.5,
  sceneType = 'warehouse',
} = {}) {
  // 只有明确提供了经纬度才生成 geoAnchor，否则创建未锚定建筑
  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude)
  return createBuildingRecord({
    name,
    address,
    geoAnchor: hasCoords ? { latitude, longitude, address } : null,
    widthMeters,
    depthMeters,
    headingDeg,
    floorCount,
    floorHeight,
    sceneType,
    allowNullGeoAnchor: !hasCoords,
  })
}

export function createStudioLevelDraft(data = {}) {
  return createLevelRecord(data)
}

export function createStudioWarehouseDraft(data = {}) {
  return createWarehouseRecord(data)
}

import { summarizeTrack } from './gpx.js'
import {
  prepareElevationGrid,
  sanitizeElevationSeries,
} from './elevation.js'
import { getTerrainSurfaceUv } from './surfaceTexture.js'
import {
  createAlignedTerrainProjection,
  createProjection,
  getLocalBoundsFromFootprint,
  getLocalBoundsFromWgs84,
  getLocalFootprintFromWgs84,
  getWgs84BoundsFromFootprint,
  getWgs84BoundsFromLocalBounds,
  normalizeTerrainFootprintRotationDegrees,
  normalizeWgs84Bounds,
  normalizeWgs84Footprint,
  roundWgs84Bounds,
  roundWgs84Footprint,
} from './geo.js'
import {
  clamp,
  median,
  percentile,
  pickNumber,
  reducePeakPreserving,
  round,
  toFiniteElevation,
} from './numeric.js'
import { hexToRgb, hexToRgbArray } from './color.js'
import {
  DEFAULT_FILAMENT_TYPE,
  FILAMENT_TYPES,
  PRINT_LAYER_LOCK_OVERLAP_MM,
  PRINT_READABLE_MAX_FOOTPRINT_RATIO,
} from './printConfig.js'
import earcut from 'earcut'

export { reducePeakPreserving }
export { toPrintCoordinateVertex, toThreeYUpCoordinateVertex } from './coordinates.js'
export {
  buildTerrainModelExportArchive,
  buildTerrainModelExportFile,
  buildTerrainModelExportFiles,
  buildTerrainModelExportPlan,
  buildTerrainPrintPreflight,
  evaluateTerrainModelReadiness,
  meshToAsciiStl,
  normalizeBambuStudioProjectSettings,
  toAsciiSafeExportBaseName,
  validateTerrainModelExport,
} from './export.js'

const DEFAULT_OPTIONS = {
  gridRows: 36,
  gridCols: 36,
  terrainSupersample: 1,
  terrainQuality: 'standard',
  modelWidthMm: 120,
  modelDepthMm: 120,
  modelLongSideMm: 120,
  baseHeightMm: 2,
  verticalScale: 0.18,
  maxReliefMm: 42,
  reliefMode: 'print-readable',
  elevationSmoothingPasses: 1,
  contourEnabled: false,
  contourIntervalMeters: 50,
  contourWidthMm: 0.45,
  contourHeightMm: 0.35,
  snowlineEnabled: false,
  snowlineElevationMeters: null,
  snowlinePercentile: 0.82,
  snowlineWidthMm: 0.8,
  snowlineHeightMm: 0.45,
  snowCapThicknessMm: 0.5,
  terrainColorBandsEnabled: false,
  colorMode: null,
  elevationBands: [],
  satelliteColorCount: 5,
  satelliteColorStrategy: 'balanced',
  satelliteTerrainColorLimit: null,
  satelliteMinPatchAreaMm2: 24,
  satelliteColorSmoothing: 0.55,
  bandInterlockMm: 0.15,
  filamentType: 'PLA Basic',
  lowlandPercentile: 0.35,
  lowlandCapThicknessMm: 0.45,
  trackWidthMm: 2,
  trackHeightMm: 0.6,
  trackSimplifyToleranceMm: null,
  shapeType: 'rectangle',
  frameWidthMm: 0,
  basePlateHeightMm: 0,
  baseGridResolution: 44,
  magnetHoleEnabled: false,
  magnetHoleCount: 4,
  magnetHoleDiameterMm: 6,
  magnetHoleInsetMm: null,
  labelText: '',
  secondaryLabelText: '',
  labelRaisedMm: 1.2,
  elevationSourceName: '',
  elevationSourceType: '',
  elevationSourceResolutionMeters: null,
  elevationSourceBoundsWgs84: null,
  terrainBoundsWgs84: null,
  terrainFootprintWgs84: null,
  targetModelGridMm: null,
  paddingMeters: null,
}

const SHAPE_TYPES = new Set(['rectangle', 'hexagon', 'circle', 'triangle', 'custom'])
const TERRAIN_QUALITY_PRESETS = new Set(['draft', 'standard', 'high', 'ultra'])
const MAX_GRID_SIZE = 320
const MAX_TERRAIN_SUPERSAMPLE = 3
const MIN_HIGH_PRECISION_GRID_SIZE = 96
const DEFAULT_HIGH_PRECISION_GRID_MM = 0.42
const MIN_MODEL_SIDE_MM = 8
const MIN_RELIEF_MM = 3
const MAX_RELIEF_MM = 90
const PRINT_READABLE_MIN_RELIEF_MM = 12
const PRINT_READABLE_TARGET_RELIEF_MM = 16
const PRINT_READABLE_RELIEF_MULTIPLIER = 4
const PRINT_READABLE_MAX_RELIEF_MM = 24
// 「地貌优先 / 戏剧化」起伏档：在制图浮雕惯例（垂直夸张 2–10x）内把起伏抬高，
// 以纸面浮雕地图与 TouchTerrain/DEMto3D 实践为参照；起伏上限按短边比例兜底
// （高度场打印不存在悬垂，唯一约束是稳固/观感，故用 footprint 比例而非坡度护栏）。
const TERRAIN_FORWARD_MIN_RELIEF_MM = 18
const TERRAIN_FORWARD_TARGET_FOOTPRINT_RATIO = 0.34
const TERRAIN_FORWARD_MAX_FOOTPRINT_RATIO = 0.42
const TERRAIN_FORWARD_RELIEF_MULTIPLIER = 6
const TERRAIN_FORWARD_MAX_EXAGGERATION = 8
const TERRAIN_FORWARD_MAX_RELIEF_MM = 60
const RAISED_OVERLAY_MIN_OVERLAP_MM = PRINT_LAYER_LOCK_OVERLAP_MM
const RAISED_OVERLAY_MAX_OVERLAP_MM = 0.35

const BLOCK_FONT = {
  '0': ['111', '101', '101', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '010', '010', '111'],
  '2': ['111', '001', '001', '111', '100', '100', '111'],
  '3': ['111', '001', '001', '111', '001', '001', '111'],
  '4': ['101', '101', '101', '111', '001', '001', '001'],
  '5': ['111', '100', '100', '111', '001', '001', '111'],
  '6': ['111', '100', '100', '111', '101', '101', '111'],
  '7': ['111', '001', '001', '010', '010', '010', '010'],
  '8': ['111', '101', '101', '111', '101', '101', '111'],
  '9': ['111', '101', '101', '111', '001', '001', '111'],
  A: ['111', '101', '101', '111', '101', '101', '101'],
  D: ['110', '101', '101', '101', '101', '101', '110'],
  H: ['101', '101', '101', '111', '101', '101', '101'],
  K: ['101', '101', '110', '100', '110', '101', '101'],
  M: ['101', '111', '111', '101', '101', '101', '101'],
  O: ['111', '101', '101', '101', '101', '101', '111'],
  R: ['110', '101', '101', '110', '101', '101', '101'],
  T: ['111', '010', '010', '010', '010', '010', '010'],
  X: ['101', '101', '101', '010', '101', '101', '101'],
  '-': ['000', '000', '000', '111', '000', '000', '000'],
  '.': ['000', '000', '000', '000', '000', '010', '010'],
  ':': ['000', '010', '010', '000', '010', '010', '000'],
  ' ': ['000', '000', '000', '000', '000', '000', '000'],
}

// ── Color presets for elevation-band mode ──────────────────────────────────
const COLOR_PRESETS = {
  classic: {
    name: '经典地形',
    bands: [
      { name: '低地', percentile: 0.28, color: '#2E8B57', thicknessMm: 0.5 },
      { name: '丘陵', percentile: 0.50, color: '#8B9A46', thicknessMm: 0.5 },
      { name: '中山', percentile: 0.72, color: '#B8964E', thicknessMm: 0.5 },
      { name: '高山', percentile: 0.90, color: '#9E8E7E', thicknessMm: 0.5 },
      { name: '雪冠', percentile: 1.0, color: '#F0EDE5', thicknessMm: 0.5 },
    ],
  },
  monochrome: {
    name: '极简黑白',
    bands: [
      { name: '底层', percentile: 0.40, color: '#4A4A4A', thicknessMm: 0.45 },
      { name: '中层', percentile: 0.70, color: '#8A8A8A', thicknessMm: 0.45 },
      { name: '高层', percentile: 0.90, color: '#BEBEBE', thicknessMm: 0.45 },
      { name: '顶层', percentile: 1.0, color: '#F5F5F5', thicknessMm: 0.45 },
    ],
  },
  inferno: {
    name: '炽热轨迹',
    bands: [
      { name: '低地', percentile: 0.25, color: '#4A1C0E', thicknessMm: 0.5 },
      { name: '缓坡', percentile: 0.50, color: '#A83C1C', thicknessMm: 0.5 },
      { name: '陡坡', percentile: 0.75, color: '#E8863A', thicknessMm: 0.5 },
      { name: '山脊', percentile: 0.92, color: '#F5D45A', thicknessMm: 0.5 },
      { name: '峰顶', percentile: 1.0, color: '#FFF8E7', thicknessMm: 0.5 },
    ],
  },
  alps: {
    name: '阿尔卑斯',
    bands: [
      { name: '谷地', percentile: 0.22, color: '#3D7A3E', thicknessMm: 0.5 },
      { name: '林线', percentile: 0.48, color: '#6B8C42', thicknessMm: 0.5 },
      { name: '草甸', percentile: 0.66, color: '#B5A87A', thicknessMm: 0.5 },
      { name: '岩壁', percentile: 0.82, color: '#8B7D6B', thicknessMm: 0.5 },
      { name: '冰川', percentile: 0.94, color: '#D4D9DF', thicknessMm: 0.5 },
      { name: '雪峰', percentile: 1.0, color: '#F8F9FA', thicknessMm: 0.5 },
    ],
  },
}

const DEFAULT_ELEVATION_BAND_INTERLOCK_MM = 0.15
const MIN_ELEVATION_BAND_COUNT = 2
const MAX_ELEVATION_BAND_COUNT = 7
const DEFAULT_SATELLITE_COLOR_COUNT = 5
const SATELLITE_COLOR_STRATEGIES = new Set(['balanced', 'realistic', 'printFirst'])
const BAMBU_H2C_MATERIAL_SLOT_LIMIT = 6
const DEFAULT_SATELLITE_MIN_PATCH_AREA_MM2 = 24

const SATELLITE_PRINT_PALETTE = [
  { name: '深林阴影', hex: '#2F4A3A', elevationBias: 0.18 },
  { name: '山林', hex: '#3F6B42', elevationBias: 0.28 },
  { name: '草坡', hex: '#72824A', elevationBias: 0.42 },
  { name: '裸土', hex: '#9A7650', elevationBias: 0.52 },
  { name: '岩石', hex: '#8C8375', elevationBias: 0.70 },
  { name: '浅岩', hex: '#C8BCA5', elevationBias: 0.82 },
  { name: '高山浅色', hex: '#DED9C9', elevationBias: 0.92 },
]

function yieldTerrainModelWork() {
  if (typeof window === 'undefined') return Promise.resolve()
  if (typeof window.requestAnimationFrame === 'function') {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
  }
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}

function normalizeShapeType(value) {
  const shapeType = String(value || '').trim().toLowerCase()
  if (shapeType === 'hex') return 'hexagon'
  return SHAPE_TYPES.has(shapeType) ? shapeType : DEFAULT_OPTIONS.shapeType
}

function normalizeTerrainQuality(value, rows, cols) {
  const quality = String(value || '').trim().toLowerCase()
  if (TERRAIN_QUALITY_PRESETS.has(quality)) return quality
  return Math.max(rows, cols) > 160 ? 'ultra' : Math.max(rows, cols) > 96 ? 'high' : DEFAULT_OPTIONS.terrainQuality
}

function normalizeOptions(options = {}) {
  const merged = { ...DEFAULT_OPTIONS, ...options }
  const terrainFootprintWgs84 = normalizeWgs84Footprint(
    merged.terrainFootprintWgs84
      ?? merged.manualFootprintWgs84
      ?? merged.footprintWgs84,
  )
  const footprintBoundsWgs84 = getWgs84BoundsFromFootprint(terrainFootprintWgs84)
  const rawShapeType = merged.shapeType || merged.shape || merged.footprintShape
  const shapeType = terrainFootprintWgs84 ? 'custom' : normalizeShapeType(rawShapeType)
  const gridRows = clamp(Math.round(pickNumber(merged.gridRows, DEFAULT_OPTIONS.gridRows)), 4, MAX_GRID_SIZE)
  const gridCols = clamp(Math.round(pickNumber(merged.gridCols, DEFAULT_OPTIONS.gridCols)), 4, MAX_GRID_SIZE)
  const terrainSupersample = clamp(Math.round(pickNumber(merged.terrainSupersample, DEFAULT_OPTIONS.terrainSupersample)), 1, MAX_TERRAIN_SUPERSAMPLE)
  const terrainQuality = normalizeTerrainQuality(merged.terrainQuality ?? merged.qualityPreset, gridRows, gridCols)
  const rawSnowlinePercentile = pickNumber(merged.snowlinePercentile, DEFAULT_OPTIONS.snowlinePercentile)
  const snowlinePercentile = rawSnowlinePercentile > 1
    ? rawSnowlinePercentile / 100
    : rawSnowlinePercentile
  const rawLowlandPercentile = pickNumber(merged.lowlandPercentile, DEFAULT_OPTIONS.lowlandPercentile)
  const lowlandPercentile = rawLowlandPercentile > 1
    ? rawLowlandPercentile / 100
    : rawLowlandPercentile
  const rawSatelliteSmoothing = pickNumber(merged.satelliteColorSmoothing, DEFAULT_OPTIONS.satelliteColorSmoothing)
  const satelliteColorSmoothing = rawSatelliteSmoothing > 1
    ? rawSatelliteSmoothing / 100
    : rawSatelliteSmoothing
  const rawSatelliteTerrainColorLimit = Number(merged.satelliteTerrainColorLimit)
  const terrainFootprintRotationDegrees = terrainFootprintWgs84
    ? normalizeTerrainFootprintRotationDegrees(
      merged.terrainFootprintRotationDegrees
        ?? merged.manualFootprintRotationDegrees
        ?? merged.footprintRotationDegrees,
    )
    : 0
  const rawSnowlineElevation = merged.snowlineElevationMeters ?? merged.snowLineElevationMeters
  const magnetHoleEnabled = Boolean(
    merged.magnetHoleEnabled
      || merged.magnetHolesEnabled
      || merged.magnetEnabled,
  )
  return {
    ...merged,
    gridRows,
    gridCols,
    terrainSupersample,
    terrainQuality,
    modelWidthMm: clamp(pickNumber(merged.modelWidthMm, DEFAULT_OPTIONS.modelWidthMm), MIN_MODEL_SIDE_MM, 260),
    modelDepthMm: clamp(pickNumber(merged.modelDepthMm, DEFAULT_OPTIONS.modelDepthMm), MIN_MODEL_SIDE_MM, 260),
    modelLongSideMm: clamp(
      pickNumber(merged.modelLongSideMm, Math.max(DEFAULT_OPTIONS.modelWidthMm, DEFAULT_OPTIONS.modelDepthMm)),
      40,
      260,
    ),
    baseHeightMm: clamp(pickNumber(merged.baseHeightMm, DEFAULT_OPTIONS.baseHeightMm), 0.6, 12),
    verticalScale: clamp(pickNumber(merged.verticalScale, DEFAULT_OPTIONS.verticalScale), 0.001, 2),
    maxReliefMm: clamp(pickNumber(merged.maxReliefMm ?? merged.maxTerrainReliefMm, DEFAULT_OPTIONS.maxReliefMm), MIN_RELIEF_MM, MAX_RELIEF_MM),
    reliefMode: normalizeReliefMode(merged.reliefMode),
    elevationSmoothingPasses: clamp(Math.round(pickNumber(merged.elevationSmoothingPasses, DEFAULT_OPTIONS.elevationSmoothingPasses)), 0, 4),
    contourEnabled: Boolean(merged.contourEnabled ?? merged.contoursEnabled),
    contourIntervalMeters: clamp(pickNumber(merged.contourIntervalMeters ?? merged.contourIntervalM, DEFAULT_OPTIONS.contourIntervalMeters), 5, 500),
    contourWidthMm: clamp(pickNumber(merged.contourWidthMm, DEFAULT_OPTIONS.contourWidthMm), 0.2, 2),
    contourHeightMm: clamp(pickNumber(merged.contourHeightMm, DEFAULT_OPTIONS.contourHeightMm), 0.1, 1.5),
    snowlineEnabled: Boolean(merged.snowlineEnabled ?? merged.snowLineEnabled),
    snowlineElevationMeters: rawSnowlineElevation !== null
      && rawSnowlineElevation !== undefined
      && rawSnowlineElevation !== ''
      && Number.isFinite(Number(rawSnowlineElevation))
      ? Number(rawSnowlineElevation)
      : null,
    snowlinePercentile: clamp(snowlinePercentile, 0.5, 0.98),
    snowlineWidthMm: clamp(pickNumber(merged.snowlineWidthMm, DEFAULT_OPTIONS.snowlineWidthMm), 0.25, 2.5),
    snowlineHeightMm: clamp(pickNumber(merged.snowlineHeightMm, DEFAULT_OPTIONS.snowlineHeightMm), 0.15, 1.5),
    snowCapThicknessMm: clamp(pickNumber(merged.snowCapThicknessMm, DEFAULT_OPTIONS.snowCapThicknessMm), 0.2, 1.5),
    terrainColorBandsEnabled: Boolean(merged.terrainColorBandsEnabled ?? merged.colorBandsEnabled),
    colorMode: typeof merged.colorMode === 'string' && (merged.colorMode === 'satellite' || merged.colorMode === 'elevation')
      ? merged.colorMode
      : null,
    elevationBands: normalizeElevationBands(merged.elevationBands),
    satelliteColorCount: clamp(
      Math.round(pickNumber(merged.satelliteColorCount, DEFAULT_OPTIONS.satelliteColorCount)),
      MIN_ELEVATION_BAND_COUNT,
      MAX_ELEVATION_BAND_COUNT,
    ),
    satelliteColorStrategy: normalizeSatelliteColorStrategy(merged.satelliteColorStrategy),
    satelliteTerrainColorLimit: Number.isFinite(rawSatelliteTerrainColorLimit) && rawSatelliteTerrainColorLimit > 0
      ? clamp(Math.round(rawSatelliteTerrainColorLimit), 1, MAX_ELEVATION_BAND_COUNT)
      : null,
    satelliteMinPatchAreaMm2: clamp(
      pickNumber(merged.satelliteMinPatchAreaMm2, DEFAULT_OPTIONS.satelliteMinPatchAreaMm2),
      0,
      5000,
    ),
    satelliteColorSmoothing: clamp(satelliteColorSmoothing, 0, 1),
    bandInterlockMm: clamp(
      pickNumber(merged.bandInterlockMm, DEFAULT_OPTIONS.bandInterlockMm),
      0.05,
      0.5,
    ),
    filamentType: FILAMENT_TYPES.includes(String(merged.filamentType || ''))
      ? String(merged.filamentType)
      : DEFAULT_FILAMENT_TYPE,
    lowlandPercentile: clamp(lowlandPercentile, 0.05, 0.6),
    lowlandCapThicknessMm: clamp(pickNumber(merged.lowlandCapThicknessMm, DEFAULT_OPTIONS.lowlandCapThicknessMm), 0.2, 1.5),
    trackWidthMm: clamp(pickNumber(merged.trackWidthMm, DEFAULT_OPTIONS.trackWidthMm), 0.4, 8),
    trackHeightMm: clamp(pickNumber(merged.trackHeightMm, DEFAULT_OPTIONS.trackHeightMm), 0.2, 6),
    trackSimplifyToleranceMm: merged.trackSimplifyToleranceMm === null || merged.trackSimplifyToleranceMm === undefined || merged.trackSimplifyToleranceMm === ''
      ? null
      : clamp(pickNumber(merged.trackSimplifyToleranceMm, 0), 0, 3),
    shapeType,
    frameWidthMm: clamp(pickNumber(merged.frameWidthMm, DEFAULT_OPTIONS.frameWidthMm), 0, 28),
    basePlateHeightMm: clamp(pickNumber(merged.basePlateHeightMm, DEFAULT_OPTIONS.basePlateHeightMm), 0, 10),
    baseGridResolution: clamp(Math.round(pickNumber(merged.baseGridResolution, DEFAULT_OPTIONS.baseGridResolution)), 18, 96),
    magnetHoleEnabled,
    magnetHoleCount: clamp(Math.round(pickNumber(merged.magnetHoleCount ?? merged.magnetCount, DEFAULT_OPTIONS.magnetHoleCount)), 2, 12),
    magnetHoleDiameterMm: clamp(pickNumber(merged.magnetHoleDiameterMm ?? merged.magnetDiameterMm, DEFAULT_OPTIONS.magnetHoleDiameterMm), 3, 18),
    magnetHoleInsetMm: Number.isFinite(Number(merged.magnetHoleInsetMm ?? merged.magnetInsetMm)) ? clamp(Number(merged.magnetHoleInsetMm ?? merged.magnetInsetMm), 3, 40) : null,
    labelText: String(merged.labelText || '').slice(0, 24),
    secondaryLabelText: String(merged.secondaryLabelText || '').slice(0, 24),
    labelRaisedMm: clamp(pickNumber(merged.labelRaisedMm ?? merged.labelHeightMm, DEFAULT_OPTIONS.labelRaisedMm), 0.4, 3),
    elevationSourceName: String(merged.elevationSourceName || '').slice(0, 80),
    elevationSourceType: String(merged.elevationSourceType || '').slice(0, 40),
    elevationSourceResolutionMeters: merged.elevationSourceResolutionMeters !== null
      && merged.elevationSourceResolutionMeters !== undefined
      && merged.elevationSourceResolutionMeters !== ''
      && Number.isFinite(Number(merged.elevationSourceResolutionMeters))
      ? clamp(Number(merged.elevationSourceResolutionMeters), 0.05, 10000)
      : null,
    elevationSourceBoundsWgs84: normalizeWgs84Bounds(merged.elevationSourceBoundsWgs84),
    terrainBoundsWgs84: normalizeWgs84Bounds(
      merged.terrainBoundsWgs84
        ?? merged.manualBoundsWgs84
        ?? merged.boundsWgs84,
    ) || footprintBoundsWgs84,
    terrainFootprintWgs84,
    terrainFootprintRotationDegrees,
    targetModelGridMm: merged.targetModelGridMm !== null
      && merged.targetModelGridMm !== undefined
      && merged.targetModelGridMm !== ''
      && Number.isFinite(Number(merged.targetModelGridMm))
      ? clamp(Number(merged.targetModelGridMm), 0.25, 1.2)
      : null,
  }
}

function getBoundsSource(options) {
  if (options?.terrainFootprintWgs84) return 'manual-footprint-wgs84'
  return options?.terrainBoundsWgs84 ? 'manual-wgs84' : 'gpx-buffer'
}

function getBounds(localPoints, options, projection = null) {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  localPoints.forEach((point) => {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minZ = Math.min(minZ, point.z)
    maxZ = Math.max(maxZ, point.z)
  })

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || minX === maxX) {
    minX = -10
    maxX = 10
  }
  if (!Number.isFinite(minZ) || !Number.isFinite(maxZ) || minZ === maxZ) {
    minZ = -10
    maxZ = 10
  }

  const manualFootprintBounds = getLocalBoundsFromFootprint(options.terrainFootprintWgs84, projection)
  const manualBounds = manualFootprintBounds || getLocalBoundsFromWgs84(options.terrainBoundsWgs84, projection)
  if (manualBounds) {
    const rawBounds = {
      minX: Math.min(minX, manualBounds.minX),
      maxX: Math.max(maxX, manualBounds.maxX),
      minZ: Math.min(minZ, manualBounds.minZ),
      maxZ: Math.max(maxZ, manualBounds.maxZ),
    }
    const padding = resolveFootprintPadding(localPoints, rawBounds, 0, options.shapeType)
    return {
      minX: rawBounds.minX - padding,
      maxX: rawBounds.maxX + padding,
      minZ: rawBounds.minZ - padding,
      maxZ: rawBounds.maxZ + padding,
    }
  }

  const width = maxX - minX
  const depth = maxZ - minZ
  const basePadding = Number.isFinite(options.paddingMeters)
    ? Math.max(0, options.paddingMeters)
    : clamp(Math.max(width, depth) * (options.shapeType === 'rectangle' ? 0.1 : 0.18), 12, 160)
  const padding = resolveFootprintPadding(localPoints, {
    minX,
    maxX,
    minZ,
    maxZ,
  }, basePadding, options.shapeType)

  return {
    minX: minX - padding,
    maxX: maxX + padding,
    minZ: minZ - padding,
    maxZ: maxZ + padding,
  }
}

function buildPaddedBounds(rawBounds, padding) {
  return {
    minX: rawBounds.minX - padding,
    maxX: rawBounds.maxX + padding,
    minZ: rawBounds.minZ - padding,
    maxZ: rawBounds.maxZ + padding,
  }
}

function footprintContainsTrack(localPoints, rawBounds, padding, shapeType) {
  if (shapeType === 'rectangle') return true
  const bounds = buildPaddedBounds(rawBounds, padding)
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerZ = (bounds.minZ + bounds.maxZ) / 2
  return localPoints.every((point) => (
    isInsideShape(point.x - centerX, point.z - centerZ, width, depth, shapeType)
  ))
}

function resolveFootprintPadding(localPoints, rawBounds, basePadding, shapeType) {
  if (shapeType === 'rectangle' || footprintContainsTrack(localPoints, rawBounds, basePadding, shapeType)) {
    return basePadding
  }

  const maxSpan = Math.max(rawBounds.maxX - rawBounds.minX, rawBounds.maxZ - rawBounds.minZ, 1)
  const maxPadding = Math.max(maxSpan * 4, basePadding + 640)
  let lower = basePadding
  let upper = basePadding

  while (!footprintContainsTrack(localPoints, rawBounds, upper, shapeType) && upper < maxPadding) {
    lower = upper
    upper = Math.min(
      maxPadding,
      Math.max(upper * 1.4 + 1, upper + maxSpan * 0.04, upper + 12),
    )
  }

  if (!footprintContainsTrack(localPoints, rawBounds, upper, shapeType)) {
    return upper
  }

  for (let index = 0; index < 24; index += 1) {
    const midpoint = (lower + upper) / 2
    if (footprintContainsTrack(localPoints, rawBounds, midpoint, shapeType)) {
      upper = midpoint
    } else {
      lower = midpoint
    }
  }

  return upper
}

function buildElevatedTrack(localTrack) {
  return localTrack.filter((point) => Number.isFinite(point.elevation))
}

// Inverse-distance weighting over a pre-filtered track. Splitting the
// `Number.isFinite` filter out of the hot loop is what makes this cheap: the
// previous version re-allocated the whole filtered track on every one of the
// up-to-100k grid samples, which dominated generation time via GC pressure.
function interpolateElevatedTrackElevation(elevatedTrack, x, z) {
  if (!elevatedTrack.length) return 0
  let weightedHeight = 0
  let totalWeight = 0
  for (let i = 0; i < elevatedTrack.length; i += 1) {
    const point = elevatedTrack[i]
    const distance = Math.hypot(point.x - x, point.z - z)
    const weight = 1 / Math.max(distance, 0.001)
    weightedHeight += point.elevation * weight
    totalWeight += weight
  }
  return totalWeight > 0 ? weightedHeight / totalWeight : elevatedTrack[0].elevation
}

function fillLinearElevationSeries(values) {
  const filled = values.slice()
  const valid = filled
    .map((value, index) => ({ value, index }))
    .filter((item) => Number.isFinite(item.value))
  if (!valid.length) return filled.map(() => 0)

  for (let index = 0; index < filled.length; index += 1) {
    if (Number.isFinite(filled[index])) continue
    let previous = null
    let next = null
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (Number.isFinite(filled[cursor])) {
        previous = { index: cursor, value: filled[cursor] }
        break
      }
    }
    for (let cursor = index + 1; cursor < filled.length; cursor += 1) {
      if (Number.isFinite(filled[cursor])) {
        next = { index: cursor, value: filled[cursor] }
        break
      }
    }
    if (previous && next) {
      const ratio = (index - previous.index) / Math.max(next.index - previous.index, 1)
      filled[index] = previous.value * (1 - ratio) + next.value * ratio
    } else {
      filled[index] = previous?.value ?? next?.value ?? valid[0].value
    }
  }

  return filled
}

function cleanLocalTrackElevations(localTrack) {
  const sanitized = sanitizeElevationSeries(localTrack.map((point) => point.elevation))
  const elevations = fillLinearElevationSeries(sanitized.values)
  return localTrack.map((point, index) => ({
    ...point,
    elevation: elevations[index],
  }))
}

function createLocalTrack(points, options = null) {
  const normalizedPoints = Array.isArray(points) ? points : []
  if (normalizedPoints.length < 2) return null
  const baseProjection = createProjection(normalizedPoints)
  const alignment = options ? createAlignedTerrainProjection(baseProjection, options) : null
  const projection = alignment?.projection || baseProjection
  return {
    baseProjection,
    projection,
    alignment,
    localTrack: cleanLocalTrackElevations(normalizedPoints.map((point) => projection.toLocal(point))),
  }
}

export function recommendModelDimensionsForTrack(points, options = {}) {
  const resolvedOptions = normalizeOptions(options)
  const local = createLocalTrack(points, resolvedOptions)
  const fallbackLongSideMm = Math.max(resolvedOptions.modelWidthMm, resolvedOptions.modelDepthMm)
  const requestedLongSideMm = clamp(
    pickNumber(options.modelLongSideMm ?? fallbackLongSideMm, fallbackLongSideMm),
    40,
    260,
  )

  if (!local) {
    return {
      modelWidthMm: round(resolvedOptions.modelWidthMm),
      modelDepthMm: round(resolvedOptions.modelDepthMm),
      modelLongSideMm: round(requestedLongSideMm),
      longSideMm: round(requestedLongSideMm),
      aspectRatio: round(resolvedOptions.modelWidthMm / Math.max(resolvedOptions.modelDepthMm, 1), 4),
      widthMeters: null,
      depthMeters: null,
      boundsMeters: null,
      paddingMeters: Number.isFinite(Number(options.paddingMeters)) ? Math.max(0, Number(options.paddingMeters)) : null,
    }
  }

  const bounds = getBounds(local.localTrack, resolvedOptions, local.projection)
  const widthMeters = Math.max(bounds.maxX - bounds.minX, 1)
  const depthMeters = Math.max(bounds.maxZ - bounds.minZ, 1)
  const boundsWgs84 = getWgs84BoundsFromLocalBounds(bounds, local.projection)
  const requestedBoundsWgs84 = roundWgs84Bounds(resolvedOptions.terrainBoundsWgs84)
  const aspectRatio = widthMeters / depthMeters
  const frameWidthMm = resolvedOptions.basePlateHeightMm > 0 || resolvedOptions.frameWidthMm > 0
    ? Math.min(Math.max(0, resolvedOptions.frameWidthMm), requestedLongSideMm / 4)
    : 0
  const terrainLongSideMm = Math.max(30, requestedLongSideMm - frameWidthMm * 2)

  if (resolvedOptions.shapeType === 'circle') {
    return {
      modelWidthMm: round(requestedLongSideMm),
      modelDepthMm: round(requestedLongSideMm),
      modelLongSideMm: round(requestedLongSideMm),
      longSideMm: round(requestedLongSideMm),
      aspectRatio: 1,
      widthMeters: round(widthMeters),
      depthMeters: round(depthMeters),
      boundsMeters: {
        width: round(widthMeters),
        depth: round(depthMeters),
      },
      boundsWgs84,
      boundsSource: getBoundsSource(resolvedOptions),
      requestedBoundsWgs84,
      frameWidthMm: round(frameWidthMm),
      paddingMeters: Number.isFinite(Number(resolvedOptions.paddingMeters)) ? Math.max(0, Number(resolvedOptions.paddingMeters)) : null,
    }
  }

  const terrainWidthMm = widthMeters >= depthMeters
    ? terrainLongSideMm
    : terrainLongSideMm * aspectRatio
  const terrainDepthMm = depthMeters >= widthMeters
    ? terrainLongSideMm
    : terrainLongSideMm / Math.max(aspectRatio, 0.001)
  const modelWidthMm = terrainWidthMm + frameWidthMm * 2
  const modelDepthMm = terrainDepthMm + frameWidthMm * 2

  return {
    modelWidthMm: round(modelWidthMm),
    modelDepthMm: round(modelDepthMm),
    modelLongSideMm: round(requestedLongSideMm),
    longSideMm: round(requestedLongSideMm),
    aspectRatio: round(aspectRatio, 4),
    widthMeters: round(widthMeters),
    depthMeters: round(depthMeters),
    boundsMeters: {
      width: round(widthMeters),
      depth: round(depthMeters),
    },
    boundsWgs84,
    boundsSource: getBoundsSource(resolvedOptions),
    requestedBoundsWgs84,
    frameWidthMm: round(frameWidthMm),
    paddingMeters: Number.isFinite(Number(resolvedOptions.paddingMeters)) ? Math.max(0, Number(resolvedOptions.paddingMeters)) : null,
  }
}

function normalizeReliefMode(value) {
  const mode = String(value || '').trim().toLowerCase()
  if (
    mode === 'terrain-forward' || mode === 'terrain' || mode === 'landform'
    || mode === 'landform-first' || mode === 'dramatic'
  ) {
    return 'terrain-forward'
  }
  return mode === 'realistic' || mode === 'real-priority' || mode === 'real'
    ? 'realistic'
    : 'print-readable'
}

function normalizeSatelliteColorStrategy(value) {
  const strategy = String(value || '').trim()
  return SATELLITE_COLOR_STRATEGIES.has(strategy) ? strategy : DEFAULT_OPTIONS.satelliteColorStrategy
}

export function resolveVerticalScaleForReliefTarget(elevationRangeMeters, targetReliefMm, fallback = DEFAULT_OPTIONS.verticalScale) {
  const fallbackScale = clamp(pickNumber(fallback, DEFAULT_OPTIONS.verticalScale), 0.001, 2)
  const elevationRange = Number(elevationRangeMeters)
  const targetRelief = Number(targetReliefMm)
  if (!Number.isFinite(elevationRange) || elevationRange <= 0 || !Number.isFinite(targetRelief) || targetRelief <= 0) {
    return fallbackScale
  }
  return clamp(targetRelief / elevationRange, 0.001, 2)
}

function computeReliefRecommendationMetrics(points, options = {}) {
  const resolvedOptions = normalizeOptions(options)
  const local = createLocalTrack(points, resolvedOptions)
  if (!local) {
    return {
      resolvedOptions,
      reason: 'insufficient-track-points',
      contourIntervalMeters: resolvedOptions.contourIntervalMeters,
      elevationRangeMeters: 0,
      trueReliefMm: 0,
      scale: 0,
      shortSideMm: Math.min(resolvedOptions.modelWidthMm, resolvedOptions.modelDepthMm),
    }
  }
  const bounds = getBounds(local.localTrack, resolvedOptions, local.projection)
  const widthMeters = bounds.maxX - bounds.minX
  const depthMeters = bounds.maxZ - bounds.minZ
  const frameWidthMm = resolvedOptions.basePlateHeightMm > 0 || resolvedOptions.frameWidthMm > 0
    ? Math.min(resolvedOptions.frameWidthMm, resolvedOptions.modelWidthMm / 4, resolvedOptions.modelDepthMm / 4)
    : 0
  const terrainTargetWidthMm = Math.max(30, resolvedOptions.modelWidthMm - frameWidthMm * 2)
  const terrainTargetDepthMm = Math.max(30, resolvedOptions.modelDepthMm - frameWidthMm * 2)
  const scale = Math.min(
    terrainTargetWidthMm / widthMeters,
    terrainTargetDepthMm / depthMeters,
  )
  const elevations = local.localTrack.map((point) => point.elevation).filter(Number.isFinite)
  const minElevation = elevations.length ? Math.min(...elevations) : 0
  const maxElevation = elevations.length ? Math.max(...elevations) : minElevation
  const elevationRangeMeters = Math.max(0, maxElevation - minElevation)
  const trueReliefMm = elevationRangeMeters * scale
  const contourIntervalMeters = elevationRangeMeters >= 900
    ? 100
    : elevationRangeMeters >= 350
      ? 50
      : elevationRangeMeters >= 120
        ? 20
        : 10
  return {
    resolvedOptions,
    contourIntervalMeters,
    elevationRangeMeters,
    trueReliefMm,
    scale,
    shortSideMm: Math.min(resolvedOptions.modelWidthMm, resolvedOptions.modelDepthMm),
  }
}

function buildReliefRecommendation(metrics, mode) {
  const resolvedMode = normalizeReliefMode(mode)
  if (metrics.reason) {
    return {
      mode: resolvedMode,
      maxReliefMm: metrics.resolvedOptions.maxReliefMm,
      reason: 'insufficient-track-points',
      contourIntervalMeters: metrics.contourIntervalMeters,
      elevationRangeMeters: 0,
      trueReliefMm: 0,
      realScaleReliefMm: 0,
      verticalExaggeration: 1,
      scaleMmPerMeter: 0,
    }
  }
  const printReadableReliefMm = metrics.trueReliefMm > 0
    ? clamp(
      Math.max(metrics.trueReliefMm * PRINT_READABLE_RELIEF_MULTIPLIER, PRINT_READABLE_TARGET_RELIEF_MM),
      PRINT_READABLE_MIN_RELIEF_MM,
      Math.min(PRINT_READABLE_MAX_RELIEF_MM, metrics.shortSideMm * PRINT_READABLE_MAX_FOOTPRINT_RATIO),
    )
    : PRINT_READABLE_MIN_RELIEF_MM
  const realisticReliefMm = metrics.trueReliefMm > 0
    ? clamp(metrics.trueReliefMm, MIN_RELIEF_MM, MAX_RELIEF_MM)
    : MIN_RELIEF_MM
  const terrainForwardReliefMm = metrics.trueReliefMm > 0
    ? clamp(
      Math.max(
        metrics.trueReliefMm * TERRAIN_FORWARD_RELIEF_MULTIPLIER,
        metrics.shortSideMm * TERRAIN_FORWARD_TARGET_FOOTPRINT_RATIO,
        TERRAIN_FORWARD_MIN_RELIEF_MM,
      ),
      TERRAIN_FORWARD_MIN_RELIEF_MM,
      Math.min(
        TERRAIN_FORWARD_MAX_RELIEF_MM,
        metrics.shortSideMm * TERRAIN_FORWARD_MAX_FOOTPRINT_RATIO,
        metrics.trueReliefMm * TERRAIN_FORWARD_MAX_EXAGGERATION,
      ),
    )
    : TERRAIN_FORWARD_MIN_RELIEF_MM
  const targetReliefMm = resolvedMode === 'realistic'
    ? realisticReliefMm
    : resolvedMode === 'terrain-forward'
      ? terrainForwardReliefMm
      : printReadableReliefMm
  return {
    mode: resolvedMode,
    maxReliefMm: round(targetReliefMm),
    verticalScale: round(resolveVerticalScaleForReliefTarget(
      metrics.elevationRangeMeters,
      targetReliefMm,
      metrics.resolvedOptions.verticalScale,
    ), 6),
    contourIntervalMeters: metrics.contourIntervalMeters,
    elevationRangeMeters: round(metrics.elevationRangeMeters),
    trueReliefMm: round(metrics.trueReliefMm, 2),
    realScaleReliefMm: round(metrics.trueReliefMm, 2),
    verticalExaggeration: metrics.trueReliefMm > 0 ? round(targetReliefMm / metrics.trueReliefMm, 2) : 1,
    scaleMmPerMeter: round(metrics.scale, 6),
  }
}

export function recommendTerrainReliefOptions(points, options = {}) {
  const metrics = computeReliefRecommendationMetrics(points, options)
  const activeMode = normalizeReliefMode(options.reliefMode)
  const realistic = buildReliefRecommendation(metrics, 'realistic')
  const printReadable = buildReliefRecommendation(metrics, 'print-readable')
  const terrainForward = buildReliefRecommendation(metrics, 'terrain-forward')
  return {
    activeMode,
    active: activeMode === 'realistic'
      ? realistic
      : activeMode === 'terrain-forward'
        ? terrainForward
        : printReadable,
    realistic,
    printReadable,
    terrainForward,
  }
}

export function recommendPrintReadableOptions(points, options = {}) {
  return recommendTerrainReliefOptions(points, { ...options, reliefMode: 'print-readable' }).printReadable
}

function getTrackElevationStats(points) {
  const local = createLocalTrack(points)
  if (!local) return null
  const elevations = local.localTrack.map((point) => point.elevation).filter(Number.isFinite)
  if (!elevations.length) return null
  const minElevationMeters = Math.min(...elevations)
  const maxElevationMeters = Math.max(...elevations)
  return {
    minElevationMeters,
    maxElevationMeters,
    elevationRangeMeters: Math.max(0, maxElevationMeters - minElevationMeters),
  }
}

export function recommendTerrainPrintStyleOptions(points, options = {}) {
  const resolvedOptions = normalizeOptions(options)
  const stats = getTrackElevationStats(points)
  const baseRecommendation = {
    terrainColorBandsEnabled: true,
    lowlandPercentile: resolvedOptions.lowlandPercentile,
    lowlandCapThicknessMm: resolvedOptions.lowlandCapThicknessMm,
    snowlineEnabled: false,
    snowlineElevationMeters: resolvedOptions.snowlineElevationMeters,
    snowlinePercentile: resolvedOptions.snowlinePercentile,
    snowCapThicknessMm: resolvedOptions.snowCapThicknessMm,
    elevationRangeMeters: 0,
    minElevationMeters: 0,
    maxElevationMeters: 0,
  }
  if (!stats) {
    return {
      ...baseRecommendation,
      reason: 'insufficient-track-points',
    }
  }

  const isAlpine = stats.maxElevationMeters >= 1800 && stats.elevationRangeMeters >= 250
  const isHighRelief = stats.elevationRangeMeters >= 650
  const isModerateRelief = stats.elevationRangeMeters >= 250
  const lowlandPercentile = isHighRelief
    ? 0.38
    : isModerateRelief
      ? 0.36
      : 0.32
  const snowlinePercentile = isHighRelief
    ? 0.78
    : isModerateRelief
      ? 0.8
      : resolvedOptions.snowlinePercentile

  return {
    ...baseRecommendation,
    terrainColorBandsEnabled: true,
    lowlandPercentile: round(lowlandPercentile, 3),
    snowlineEnabled: isAlpine,
    snowlineElevationMeters: resolvedOptions.snowlineElevationMeters,
    snowlinePercentile: round(snowlinePercentile, 3),
    elevationRangeMeters: round(stats.elevationRangeMeters),
    minElevationMeters: round(stats.minElevationMeters),
    maxElevationMeters: round(stats.maxElevationMeters),
    reason: isAlpine ? 'alpine-route' : 'non-alpine-route',
  }
}

function roundGridSize(value) {
  const rounded = Math.ceil(Math.max(value, MIN_HIGH_PRECISION_GRID_SIZE) / 4) * 4
  return clamp(rounded, MIN_HIGH_PRECISION_GRID_SIZE, MAX_GRID_SIZE)
}

export function recommendHighPrecisionTerrainOptions(points, options = {}, source = {}) {
  const resolvedOptions = normalizeOptions(options)
  const local = createLocalTrack(points)
  if (!local) {
    return {
      terrainQuality: 'ultra',
      gridRows: resolvedOptions.gridRows,
      gridCols: resolvedOptions.gridCols,
      elevationSmoothingPasses: 0,
      targetModelGridMm: resolvedOptions.targetModelGridMm || DEFAULT_HIGH_PRECISION_GRID_MM,
      reason: 'insufficient-track-points',
    }
  }

  const bounds = getBounds(local.localTrack, resolvedOptions, local.projection)
  const widthMeters = bounds.maxX - bounds.minX
  const depthMeters = bounds.maxZ - bounds.minZ
  const frameWidthMm = resolvedOptions.basePlateHeightMm > 0 || resolvedOptions.frameWidthMm > 0
    ? Math.min(resolvedOptions.frameWidthMm, resolvedOptions.modelWidthMm / 4, resolvedOptions.modelDepthMm / 4)
    : 0
  const terrainTargetWidthMm = Math.max(30, resolvedOptions.modelWidthMm - frameWidthMm * 2)
  const terrainTargetDepthMm = Math.max(30, resolvedOptions.modelDepthMm - frameWidthMm * 2)
  const scale = Math.min(
    terrainTargetWidthMm / widthMeters,
    terrainTargetDepthMm / depthMeters,
  )
  const terrainWidthMm = widthMeters * scale
  const terrainDepthMm = depthMeters * scale
  const targetModelGridMm = clamp(
    pickNumber(source.targetModelGridMm ?? resolvedOptions.targetModelGridMm, DEFAULT_HIGH_PRECISION_GRID_MM),
    0.25,
    1.2,
  )
  const gridCols = roundGridSize((terrainWidthMm / targetModelGridMm) + 1)
  const gridRows = roundGridSize((terrainDepthMm / targetModelGridMm) + 1)
  const gridSpacingMm = {
    x: terrainWidthMm / Math.max(gridCols - 1, 1),
    z: terrainDepthMm / Math.max(gridRows - 1, 1),
  }
  const sourceResolutionMeters = Number.isFinite(Number(source.resolutionMeters))
    ? Number(source.resolutionMeters)
    : resolvedOptions.elevationSourceResolutionMeters

  return {
    terrainQuality: 'ultra',
    gridRows,
    gridCols,
    elevationSmoothingPasses: 0,
    targetModelGridMm: round(targetModelGridMm, 2),
    precision: {
      sampleCount: gridRows * gridCols,
      targetModelGridMm: round(targetModelGridMm, 2),
      gridSpacingMm: {
        x: round(gridSpacingMm.x, 3),
        z: round(gridSpacingMm.z, 3),
        min: round(Math.min(gridSpacingMm.x, gridSpacingMm.z), 3),
      },
      gridSpacingMeters: {
        x: round(widthMeters / Math.max(gridCols - 1, 1), 2),
        z: round(depthMeters / Math.max(gridRows - 1, 1), 2),
      },
      source: {
        type: source.type || resolvedOptions.elevationSourceType || 'uploaded-dem',
        name: source.sourceName || source.name || resolvedOptions.elevationSourceName || 'high precision DEM',
        resolutionMeters: Number.isFinite(sourceResolutionMeters) ? sourceResolutionMeters : null,
      },
    },
  }
}

async function resolveElevations(samples, getFallbackElevations, options) {
  if (typeof options.sampleElevations === 'function') {
    const sampled = await options.sampleElevations(samples)
    if (Array.isArray(sampled) && sampled.length === samples.length) {
      return sampled.map((value) => toFiniteElevation(value))
    }
  }
  return getFallbackElevations()
}

async function resolveSupersampledElevations({
  rows,
  cols,
  bounds,
  widthMeters,
  depthMeters,
  projection,
  supersample,
  options,
}) {
  if (typeof options.sampleElevations !== 'function' || supersample <= 1) return null
  const stepX = widthMeters / Math.max(cols - 1, 1)
  const stepZ = depthMeters / Math.max(rows - 1, 1)
  const targetGroupSize = supersample * supersample
  const denseSamples = []

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const baseX = bounds.minX + stepX * col
      const baseZ = bounds.minZ + stepZ * row
      let groupSize = 1

      denseSamples.push(projection.toWgs84({ x: baseX, z: baseZ }))

      for (let subRow = 0; subRow < supersample && groupSize < targetGroupSize; subRow += 1) {
        for (let subCol = 0; subCol < supersample && groupSize < targetGroupSize; subCol += 1) {
          const offsetX = ((subCol + 0.5) / supersample - 0.5) * stepX
          const offsetZ = ((subRow + 0.5) / supersample - 0.5) * stepZ
          denseSamples.push(projection.toWgs84({
            x: clamp(baseX + offsetX, bounds.minX, bounds.maxX),
            z: clamp(baseZ + offsetZ, bounds.minZ, bounds.maxZ),
          }))
          groupSize += 1
        }
      }
    }
  }

  const sampled = await options.sampleElevations(denseSamples)
  if (!Array.isArray(sampled) || sampled.length !== denseSamples.length) return null
  const denseElevations = sampled.map((value) => toFiniteElevation(value))
  const reduced = []
  let baseMin = Number.POSITIVE_INFINITY
  let baseMax = Number.NEGATIVE_INFINITY
  let baseMinIndex = -1
  let baseMaxIndex = -1
  let offset = 0
  for (let index = 0; index < rows * cols; index += 1) {
    const groupValues = denseElevations.slice(offset, offset + targetGroupSize)
    const baseValue = groupValues[0]
    if (Number.isFinite(baseValue)) {
      if (baseValue < baseMin) {
        baseMin = baseValue
        baseMinIndex = index
      }
      if (baseValue > baseMax) {
        baseMax = baseValue
        baseMaxIndex = index
      }
    }
    reduced.push(reducePeakPreserving(groupValues))
    offset += targetGroupSize
  }

  let reducedMin = Number.POSITIVE_INFINITY
  let reducedMax = Number.NEGATIVE_INFINITY
  for (const value of reduced) {
    if (!Number.isFinite(value)) continue
    if (value < reducedMin) reducedMin = value
    if (value > reducedMax) reducedMax = value
  }
  if (baseMinIndex >= 0 && reducedMin > baseMin) {
    reduced[baseMinIndex] = baseMin
  }
  if (baseMaxIndex >= 0 && reducedMax < baseMax) {
    reduced[baseMaxIndex] = baseMax
  }
  return reduced
}

function computeEffectiveVerticalScale(elevationGainMeters, options) {
  if (
    Number.isFinite(options.maxReliefMm)
    && options.maxReliefMm > 0
    && elevationGainMeters > 0
  ) {
    return Math.min(options.verticalScale, options.maxReliefMm / elevationGainMeters)
  }
  return options.verticalScale
}

function makeFace(a, b, c) {
  return [a, b, c]
}

function addQuad(faces, a, b, c, d) {
  faces.push(makeFace(a, b, c), makeFace(b, d, c))
}

function createEmptyMesh(name) {
  return { name, vertices: [], faces: [] }
}

function resolveRaisedOverlayOverlapMm(heightMm) {
  const visibleHeight = pickNumber(heightMm, 0)
  if (visibleHeight <= 0) return RAISED_OVERLAY_MIN_OVERLAP_MM
  return clamp(visibleHeight / 4, RAISED_OVERLAY_MIN_OVERLAP_MM, RAISED_OVERLAY_MAX_OVERLAP_MM)
}

function resolvePrintBodyAnchorBottomY(options = {}) {
  if (options.basePlateHeightMm <= 0 && options.frameWidthMm <= 0) return null
  return -Math.max(options.basePlateHeightMm, 0.6)
}

function isPointOnSegment(point, start, end) {
  const cross = (point.z - start.z) * (end.x - start.x) - (point.x - start.x) * (end.z - start.z)
  if (Math.abs(cross) > 1e-6) return false
  const dot = (point.x - start.x) * (end.x - start.x) + (point.z - start.z) * (end.z - start.z)
  if (dot < -1e-6) return false
  const lengthSquared = (end.x - start.x) ** 2 + (end.z - start.z) ** 2
  return dot <= lengthSquared + 1e-6
}

function isInsidePolygon(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false
  let inside = false
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index]
    const previous = polygon[previousIndex]
    if (isPointOnSegment(point, previous, current)) return true
    const intersects = ((current.z > point.z) !== (previous.z > point.z))
      && (point.x < ((previous.x - current.x) * (point.z - current.z)) / ((previous.z - current.z) || 1e-9) + current.x)
    if (intersects) inside = !inside
  }
  return inside
}

function isInsideShape(xMm, zMm, widthMm, depthMm, shapeType = 'rectangle', customRing = null) {
  if (Array.isArray(customRing) && customRing.length >= 3) {
    return isInsidePolygon({ x: xMm, z: zMm }, customRing)
  }
  const halfWidth = Math.max(widthMm / 2, 0.001)
  const halfDepth = Math.max(depthMm / 2, 0.001)
  const absX = Math.abs(xMm)
  const absZ = Math.abs(zMm)
  if (shapeType === 'circle') {
    return (absX / halfWidth) ** 2 + (absZ / halfDepth) ** 2 <= 1
  }
  if (shapeType === 'hexagon') {
    if (absZ > halfDepth) return false
    const maxX = halfWidth - (halfWidth * 0.5 * absZ) / halfDepth
    return absX <= maxX
  }
  if (shapeType === 'triangle') {
    return isInsidePolygon({ x: xMm, z: zMm }, [
      { x: 0, z: -halfDepth },
      { x: halfWidth, z: halfDepth },
      { x: -halfWidth, z: halfDepth },
    ])
  }
  return absX <= halfWidth && absZ <= halfDepth
}

function addBox(vertices, faces, minX, maxX, minY, maxY, minZ, maxZ) {
  const offset = vertices.length
  vertices.push(
    { x: minX, y: minY, z: minZ },
    { x: maxX, y: minY, z: minZ },
    { x: minX, y: maxY, z: minZ },
    { x: maxX, y: maxY, z: minZ },
    { x: minX, y: minY, z: maxZ },
    { x: maxX, y: minY, z: maxZ },
    { x: minX, y: maxY, z: maxZ },
    { x: maxX, y: maxY, z: maxZ },
  )
  addQuad(faces, offset + 2, offset + 6, offset + 3, offset + 7)
  addQuad(faces, offset, offset + 1, offset + 4, offset + 5)
  addQuad(faces, offset, offset + 4, offset + 2, offset + 6)
  addQuad(faces, offset + 1, offset + 3, offset + 5, offset + 7)
  addQuad(faces, offset + 4, offset + 5, offset + 6, offset + 7)
  addQuad(faces, offset, offset + 2, offset + 1, offset + 3)
}

function normalizeLabelText(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^0-9A-Z.:\- ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function addBlockText(vertices, faces, text, placement) {
  const normalized = normalizeLabelText(text)
  if (!normalized) return null
  const glyphs = Array.from(normalized)
    .map((character) => BLOCK_FONT[character] ? { pattern: BLOCK_FONT[character] } : null)
    .filter(Boolean)
  if (!glyphs.length) return null

  const glyphWidth = 3
  const glyphHeight = 7
  const gap = 1
  const totalColumns = glyphs.reduce((total) => total + glyphWidth + gap, -gap)
  const blockSize = Math.max(0.35, Math.min(
    placement.maxWidthMm / Math.max(totalColumns, 1),
    placement.maxHeightMm / glyphHeight,
  ))
  const textWidth = totalColumns * blockSize
  const textHeight = glyphHeight * blockSize
  let cursorX = placement.x - textWidth / 2
  const baseZ = placement.z - textHeight / 2

  glyphs.forEach(({ pattern }) => {
    pattern.forEach((rowPattern, rowIndex) => {
      Array.from(rowPattern).forEach((cell, colIndex) => {
        if (cell !== '1') return
        const minX = cursorX + colIndex * blockSize
        const maxX = minX + blockSize * 0.86
        const minZ = baseZ + (glyphHeight - rowIndex - 1) * blockSize
        const maxZ = minZ + blockSize * 0.86
        addBox(vertices, faces, minX, maxX, placement.y, placement.y + placement.heightMm, minZ, maxZ)
      })
    })
    cursorX += (glyphWidth + gap) * blockSize
  })

  return {
    text: normalized,
    widthMm: round(textWidth),
    heightMm: round(textHeight),
  }
}

function buildTerrainMesh({ rows, cols, bounds, elevations, minElevation, scale, centerX, centerZ, options }) {
  const vertices = []
  const faces = []
  const topHeightsMm = []
  const localPoints = []
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  const stepX = width / Math.max(cols - 1, 1)
  const stepZ = depth / Math.max(rows - 1, 1)
  const terrainWidthMm = width * scale
  const terrainDepthMm = depth * scale
  const baseOverlapMm = options.basePlateHeightMm > 0 || options.frameWidthMm > 0
    ? Math.min(0.35, Math.max(PRINT_LAYER_LOCK_OVERLAP_MM, options.baseHeightMm / 4))
    : 0

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const localX = bounds.minX + stepX * col
      const localZ = bounds.minZ + stepZ * row
      const heightMm = options.baseHeightMm + (elevations[row * cols + col] - minElevation) * options.verticalScale
      localPoints.push({ x: localX, z: localZ })
      topHeightsMm.push(heightMm)
      vertices.push({
        x: (localX - centerX) * scale,
        y: heightMm,
        z: (localZ - centerZ) * scale,
      })
    }
  }

  const bottomOffset = vertices.length
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const localX = bounds.minX + stepX * col
      const localZ = bounds.minZ + stepZ * row
      vertices.push({
        x: (localX - centerX) * scale,
        y: -baseOverlapMm,
        z: (localZ - centerZ) * scale,
      })
    }
  }

  const cellRows = rows - 1
  const cellCols = cols - 1
  const insideCells = Array.from({ length: cellRows }, () => Array.from({ length: cellCols }, () => false))

  for (let row = 0; row < cellRows; row += 1) {
    for (let col = 0; col < cellCols; col += 1) {
      const centerLocalX = bounds.minX + stepX * (col + 0.5)
      const centerLocalZ = bounds.minZ + stepZ * (row + 0.5)
      const xMm = (centerLocalX - centerX) * scale
      const zMm = (centerLocalZ - centerZ) * scale
      insideCells[row][col] = isInsideShape(xMm, zMm, terrainWidthMm, terrainDepthMm, options.shapeType, options.customFootprintRingMm)
    }
  }
  if (!insideCells.some((row) => row.some(Boolean))) {
    insideCells.forEach((row) => row.fill(true))
  }

  const isInsideCell = (row, col) => (
    row >= 0 && row < cellRows && col >= 0 && col < cellCols && insideCells[row][col]
  )
  const addEdgeWall = (topA, topB) => {
    addQuad(faces, topA, topB, bottomOffset + topA, bottomOffset + topB)
  }

  for (let row = 0; row < cellRows; row += 1) {
    for (let col = 0; col < cellCols; col += 1) {
      if (!insideCells[row][col]) continue
      const a = row * cols + col
      const b = a + 1
      const c = a + cols
      const d = c + 1
      addQuad(faces, a, c, b, d)
      addQuad(faces, bottomOffset + a, bottomOffset + b, bottomOffset + c, bottomOffset + d)
      if (!isInsideCell(row - 1, col)) addEdgeWall(a, b)
      if (!isInsideCell(row + 1, col)) addEdgeWall(c, d)
      if (!isInsideCell(row, col - 1)) addEdgeWall(a, c)
      if (!isInsideCell(row, col + 1)) addEdgeWall(b, d)
    }
  }

  return {
    mesh: { name: 'terrain', vertices, faces },
    localPoints,
    topHeightsMm,
    stepX,
    stepZ,
  }
}

function createTerrainHeightAt({ rows, cols, bounds, topHeightsMm }) {
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  const stepX = width / Math.max(cols - 1, 1)
  const stepZ = depth / Math.max(rows - 1, 1)
  return (x, z) => {
    const rawCol = (x - bounds.minX) / stepX
    const rawRow = (z - bounds.minZ) / stepZ
    const col = clamp(Math.floor(rawCol), 0, cols - 2)
    const row = clamp(Math.floor(rawRow), 0, rows - 2)
    const tx = clamp(rawCol - col, 0, 1)
    const tz = clamp(rawRow - row, 0, 1)
    const h00 = topHeightsMm[row * cols + col]
    const h10 = topHeightsMm[row * cols + col + 1]
    const h01 = topHeightsMm[(row + 1) * cols + col]
    const h11 = topHeightsMm[(row + 1) * cols + col + 1]
    const top = h00 * (1 - tx) + h10 * tx
    const bottom = h01 * (1 - tx) + h11 * tx
    return top * (1 - tz) + bottom * tz
  }
}

function normalizeVector2(x, z, fallback = { x: 1, z: 0 }) {
  const length = Math.hypot(x, z)
  if (length < 1e-8) return fallback
  return { x: x / length, z: z / length }
}

function distancePointToSegmentMm(point, start, end, scale) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const lengthSq = dx * dx + dz * dz
  if (lengthSq < 1e-9) return Math.hypot(point.x - start.x, point.z - start.z) * scale
  const t = clamp(((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSq, 0, 1)
  const x = start.x + dx * t
  const z = start.z + dz * t
  return Math.hypot(point.x - x, point.z - z) * scale
}

function resolveTrackSimplifyToleranceMm(options = {}) {
  const toleranceMm = Number.isFinite(options.trackSimplifyToleranceMm)
    ? options.trackSimplifyToleranceMm
    : clamp(options.trackWidthMm * 0.25, 0.25, 0.8)
  return toleranceMm
}

function summarizeTrackPrintGeometry(localTrack, printableTrack, toleranceMm, options = {}, anchorBottomY = NaN) {
  return {
    strategy: toleranceMm > 0 ? 'print-scale-simplified-ribbon' : 'print-scale-ribbon',
    sourcePointCount: Array.isArray(localTrack) ? localTrack.length : 0,
    printablePointCount: Array.isArray(printableTrack) ? printableTrack.length : 0,
    simplifyToleranceMm: round(toleranceMm, 3),
    widthMm: round(options.trackWidthMm, 2),
    heightMm: round(options.trackHeightMm, 2),
    bodyAnchor: Number.isFinite(anchorBottomY) ? 'anchored-to-base' : 'surface-overlap',
    layerLockOverlapMm: round(PRINT_LAYER_LOCK_OVERLAP_MM, 2),
  }
}

function simplifyLocalTrackForPrint(localTrack, scale, options) {
  const points = Array.isArray(localTrack) ? localTrack : []
  const toleranceMm = resolveTrackSimplifyToleranceMm(options)
  if (points.length <= 2 || toleranceMm <= 0) {
    return {
      points,
      toleranceMm,
    }
  }
  const keep = new Uint8Array(localTrack.length)
  keep[0] = 1
  keep[localTrack.length - 1] = 1
  const stack = [[0, localTrack.length - 1]]

  while (stack.length) {
    const [startIndex, endIndex] = stack.pop()
    if (endIndex <= startIndex + 1) continue
    let maxDistance = -1
    let maxIndex = -1
    const start = localTrack[startIndex]
    const end = localTrack[endIndex]
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = distancePointToSegmentMm(localTrack[index], start, end, scale)
      if (distance > maxDistance) {
        maxDistance = distance
        maxIndex = index
      }
    }
    if (maxDistance > toleranceMm && maxIndex > startIndex && maxIndex < endIndex) {
      keep[maxIndex] = 1
      stack.push([startIndex, maxIndex], [maxIndex, endIndex])
    }
  }

  return {
    points: localTrack.filter((_, index) => keep[index]),
    toleranceMm,
  }
}

function buildTrackMesh({ localTrack, scale, centerX, centerZ, terrainHeightAt, options }) {
  const vertices = []
  const faces = []
  const halfWidth = options.trackWidthMm / 2
  const halfWidthLocal = halfWidth / Math.max(scale, 1e-9)
  const overlapMm = resolveRaisedOverlayOverlapMm(options.trackHeightMm)
  const anchorBottomY = resolvePrintBodyAnchorBottomY(options)
  const simplification = simplifyLocalTrackForPrint(localTrack, scale, options)
  const printableTrack = simplification.points
  const printGeometry = summarizeTrackPrintGeometry(
    localTrack,
    printableTrack,
    simplification.toleranceMm,
    options,
    anchorBottomY,
  )

  if (printableTrack.length < 2) {
    return { name: 'track', vertices, faces, printGeometry }
  }

  printableTrack.forEach((point, index) => {
    const previous = printableTrack[Math.max(0, index - 1)]
    const next = printableTrack[Math.min(printableTrack.length - 1, index + 1)]
    const tangent = normalizeVector2((next.x - previous.x) * scale, (next.z - previous.z) * scale)
    const normal = normalizeVector2(-tangent.z, tangent.x, { x: 0, z: 1 })
    const center = {
      x: (point.x - centerX) * scale,
      z: (point.z - centerZ) * scale,
    }
    const leftLocal = {
      x: point.x + normal.x * halfWidthLocal,
      z: point.z + normal.z * halfWidthLocal,
    }
    const rightLocal = {
      x: point.x - normal.x * halfWidthLocal,
      z: point.z - normal.z * halfWidthLocal,
    }
    const leftTerrainY = terrainHeightAt(leftLocal.x, leftLocal.z)
    const rightTerrainY = terrainHeightAt(rightLocal.x, rightLocal.z)
    vertices.push(
      { x: center.x + normal.x * halfWidth, y: leftTerrainY + options.trackHeightMm, z: center.z + normal.z * halfWidth },
      { x: center.x - normal.x * halfWidth, y: rightTerrainY + options.trackHeightMm, z: center.z - normal.z * halfWidth },
      { x: center.x + normal.x * halfWidth, y: Number.isFinite(anchorBottomY) ? anchorBottomY : leftTerrainY - overlapMm, z: center.z + normal.z * halfWidth },
      { x: center.x - normal.x * halfWidth, y: Number.isFinite(anchorBottomY) ? anchorBottomY : rightTerrainY - overlapMm, z: center.z - normal.z * halfWidth },
    )
  })

  for (let index = 0; index < printableTrack.length - 1; index += 1) {
    const a = index * 4
    const b = (index + 1) * 4
    addQuad(faces, a, b, a + 1, b + 1)
    addQuad(faces, a + 2, a + 3, b + 2, b + 3)
    addQuad(faces, a, a + 2, b, b + 2)
    addQuad(faces, a + 1, b + 1, a + 3, b + 3)
  }

  addQuad(faces, 0, 1, 2, 3)
  const end = (printableTrack.length - 1) * 4
  addQuad(faces, end, end + 2, end + 1, end + 3)

  return { name: 'track', vertices, faces, printGeometry }
}

function addRaisedSegment(vertices, faces, start, end, widthMm, heightMm, options = {}) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const length = Math.hypot(dx, dz)
  if (length < 0.05) return
  const normal = { x: -dz / length, z: dx / length }
  const halfWidth = widthMm / 2
  const halfWidthLocal = halfWidth / Math.max(options.scale || 0, 1e-9)
  const overlapMm = pickNumber(options.overlapMm, resolveRaisedOverlayOverlapMm(heightMm))
  const startLeft = { x: start.x + normal.x * halfWidth, z: start.z + normal.z * halfWidth }
  const startRight = { x: start.x - normal.x * halfWidth, z: start.z - normal.z * halfWidth }
  const endLeft = { x: end.x + normal.x * halfWidth, z: end.z + normal.z * halfWidth }
  const endRight = { x: end.x - normal.x * halfWidth, z: end.z - normal.z * halfWidth }
  const canSampleTerrain = typeof options.terrainHeightAt === 'function'
    && Number.isFinite(start.localX)
    && Number.isFinite(start.localZ)
    && Number.isFinite(end.localX)
    && Number.isFinite(end.localZ)
    && Number.isFinite(options.scale)
    && options.scale > 0
  const supportHeightAt = (point, side) => {
    if (!canSampleTerrain) return Math.max(start.y, end.y)
    return options.terrainHeightAt(
      point.localX + normal.x * side * halfWidthLocal,
      point.localZ + normal.z * side * halfWidthLocal,
    )
  }
  const startLeftY = supportHeightAt(start, 1)
  const startRightY = supportHeightAt(start, -1)
  const endLeftY = supportHeightAt(end, 1)
  const endRightY = supportHeightAt(end, -1)
  const anchorBottomY = Number.isFinite(options.baseBottomY) ? options.baseBottomY : null
  const offset = vertices.length
  vertices.push(
    { x: startLeft.x, y: Number.isFinite(anchorBottomY) ? anchorBottomY : startLeftY - overlapMm, z: startLeft.z },
    { x: startRight.x, y: Number.isFinite(anchorBottomY) ? anchorBottomY : startRightY - overlapMm, z: startRight.z },
    { x: endLeft.x, y: Number.isFinite(anchorBottomY) ? anchorBottomY : endLeftY - overlapMm, z: endLeft.z },
    { x: endRight.x, y: Number.isFinite(anchorBottomY) ? anchorBottomY : endRightY - overlapMm, z: endRight.z },
    { x: startLeft.x, y: startLeftY + heightMm, z: startLeft.z },
    { x: startRight.x, y: startRightY + heightMm, z: startRight.z },
    { x: endLeft.x, y: endLeftY + heightMm, z: endLeft.z },
    { x: endRight.x, y: endRightY + heightMm, z: endRight.z },
  )
  addQuad(faces, offset + 4, offset + 6, offset + 5, offset + 7)
  addQuad(faces, offset, offset + 1, offset + 2, offset + 3)
  addQuad(faces, offset, offset + 2, offset + 4, offset + 6)
  addQuad(faces, offset + 1, offset + 5, offset + 3, offset + 7)
  addQuad(faces, offset, offset + 4, offset + 1, offset + 5)
  addQuad(faces, offset + 2, offset + 3, offset + 6, offset + 7)
}

function interpolateContourPoint(left, right, level) {
  const ratio = (level - left.elevation) / Math.max(right.elevation - left.elevation, 1e-9)
  return {
    x: left.x + (right.x - left.x) * ratio,
    z: left.z + (right.z - left.z) * ratio,
  }
}

function crossesContour(left, right, level) {
  if (left === right) return false
  return (left < level && right >= level) || (right < level && left >= level)
}

function buildContourMesh({ rows, cols, bounds, elevations, minElevation, maxElevation, scale, centerX, centerZ, terrainHeightAt, options }) {
  if (!options.contourEnabled || options.contourIntervalMeters <= 0) {
    return {
      mesh: createEmptyMesh('contours'),
      enabled: Boolean(options.contourEnabled),
      intervalMeters: round(options.contourIntervalMeters),
      widthMm: round(options.contourWidthMm),
      heightMm: round(options.contourHeightMm),
      levelsMeters: [],
      segmentCount: 0,
    }
  }
  const vertices = []
  const faces = []
  const levels = []
  let segmentCount = 0
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  const stepX = width / Math.max(cols - 1, 1)
  const stepZ = depth / Math.max(rows - 1, 1)
  const terrainWidthMm = width * scale
  const terrainDepthMm = depth * scale
  const firstLevel = Math.ceil(minElevation / options.contourIntervalMeters) * options.contourIntervalMeters
  for (let level = firstLevel; level < maxElevation && levels.length < 160; level += options.contourIntervalMeters) {
    if (level > minElevation) levels.push(level)
  }

  const gridPoint = (row, col) => {
    const x = bounds.minX + stepX * col
    const z = bounds.minZ + stepZ * row
    return {
      x,
      z,
      elevation: elevations[row * cols + col],
    }
  }

  levels.forEach((level) => {
    for (let row = 0; row < rows - 1; row += 1) {
      for (let col = 0; col < cols - 1; col += 1) {
        const p00 = gridPoint(row, col)
        const p10 = gridPoint(row, col + 1)
        const p01 = gridPoint(row + 1, col)
        const p11 = gridPoint(row + 1, col + 1)
        const crossings = []
        if (crossesContour(p00.elevation, p10.elevation, level)) crossings.push(interpolateContourPoint(p00, p10, level))
        if (crossesContour(p10.elevation, p11.elevation, level)) crossings.push(interpolateContourPoint(p10, p11, level))
        if (crossesContour(p01.elevation, p11.elevation, level)) crossings.push(interpolateContourPoint(p01, p11, level))
        if (crossesContour(p00.elevation, p01.elevation, level)) crossings.push(interpolateContourPoint(p00, p01, level))
        if (crossings.length < 2) continue

        for (let index = 0; index + 1 < crossings.length; index += 2) {
          const startLocal = crossings[index]
          const endLocal = crossings[index + 1]
          const start = {
            x: (startLocal.x - centerX) * scale,
            z: (startLocal.z - centerZ) * scale,
            y: options.baseHeightMm + (level - minElevation) * options.verticalScale,
            localX: startLocal.x,
            localZ: startLocal.z,
          }
          const end = {
            x: (endLocal.x - centerX) * scale,
            z: (endLocal.z - centerZ) * scale,
            y: start.y,
            localX: endLocal.x,
            localZ: endLocal.z,
          }
          const midX = (start.x + end.x) / 2
          const midZ = (start.z + end.z) / 2
          if (!isInsideShape(midX, midZ, terrainWidthMm, terrainDepthMm, options.shapeType, options.customFootprintRingMm)) continue
          const previousFaceCount = faces.length
        addRaisedSegment(vertices, faces, start, end, options.contourWidthMm, options.contourHeightMm, {
          terrainHeightAt,
          scale,
          baseBottomY: resolvePrintBodyAnchorBottomY(options),
        })
          if (faces.length > previousFaceCount) segmentCount += 1
        }
      }
    }
  })

  return {
    mesh: vertices.length ? { name: 'contours', vertices, faces } : createEmptyMesh('contours'),
    enabled: Boolean(options.contourEnabled),
    intervalMeters: round(options.contourIntervalMeters),
    widthMm: round(options.contourWidthMm),
    heightMm: round(options.contourHeightMm),
    levelsMeters: levels.map((level) => round(level)),
    segmentCount,
  }
}

function resolveSnowlineThreshold(elevations, minElevation, maxElevation, options) {
  const manualElevation = options.snowlineElevationMeters
  const hasManualThreshold = Number.isFinite(manualElevation)
  const range = maxElevation - minElevation
  const fallback = minElevation + range * options.snowlinePercentile
  const threshold = hasManualThreshold
    ? manualElevation
    : percentile(elevations, options.snowlinePercentile) ?? fallback

  if (range <= 0) {
    return {
      elevationMeters: minElevation,
      thresholdSource: hasManualThreshold ? 'manual' : 'percentile',
    }
  }

  return {
    elevationMeters: round(clamp(threshold, minElevation + range * 0.001, maxElevation - range * 0.001), 3),
    thresholdSource: hasManualThreshold ? 'manual' : 'percentile',
  }
}

function buildSnowlineMesh({ rows, cols, bounds, elevations, minElevation, maxElevation, scale, centerX, centerZ, terrainHeightAt, options }) {
  if (!options.snowlineEnabled) {
    return {
      mesh: createEmptyMesh('snowline'),
      enabled: false,
      elevationMeters: null,
      thresholdSource: null,
      percentile: round(options.snowlinePercentile, 3),
      widthMm: round(options.snowlineWidthMm),
      heightMm: round(options.snowlineHeightMm),
      segmentCount: 0,
    }
  }

  const threshold = resolveSnowlineThreshold(elevations, minElevation, maxElevation, options)
  const vertices = []
  const faces = []
  let segmentCount = 0
  const width = bounds.maxX - bounds.minX
  const depth = bounds.maxZ - bounds.minZ
  const stepX = width / Math.max(cols - 1, 1)
  const stepZ = depth / Math.max(rows - 1, 1)
  const terrainWidthMm = width * scale
  const terrainDepthMm = depth * scale
  const level = threshold.elevationMeters

  const gridPoint = (row, col) => {
    const x = bounds.minX + stepX * col
    const z = bounds.minZ + stepZ * row
    return {
      x,
      z,
      elevation: elevations[row * cols + col],
    }
  }

  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const p00 = gridPoint(row, col)
      const p10 = gridPoint(row, col + 1)
      const p01 = gridPoint(row + 1, col)
      const p11 = gridPoint(row + 1, col + 1)
      const crossings = []
      if (crossesContour(p00.elevation, p10.elevation, level)) crossings.push(interpolateContourPoint(p00, p10, level))
      if (crossesContour(p10.elevation, p11.elevation, level)) crossings.push(interpolateContourPoint(p10, p11, level))
      if (crossesContour(p01.elevation, p11.elevation, level)) crossings.push(interpolateContourPoint(p01, p11, level))
      if (crossesContour(p00.elevation, p01.elevation, level)) crossings.push(interpolateContourPoint(p00, p01, level))
      if (crossings.length < 2) continue

      for (let index = 0; index + 1 < crossings.length; index += 2) {
        const startLocal = crossings[index]
        const endLocal = crossings[index + 1]
        const start = {
          x: (startLocal.x - centerX) * scale,
          z: (startLocal.z - centerZ) * scale,
          y: options.baseHeightMm + (level - minElevation) * options.verticalScale,
          localX: startLocal.x,
          localZ: startLocal.z,
        }
        const end = {
          x: (endLocal.x - centerX) * scale,
          z: (endLocal.z - centerZ) * scale,
          y: start.y,
          localX: endLocal.x,
          localZ: endLocal.z,
        }
        const midX = (start.x + end.x) / 2
        const midZ = (start.z + end.z) / 2
        if (!isInsideShape(midX, midZ, terrainWidthMm, terrainDepthMm, options.shapeType, options.customFootprintRingMm)) continue
        const previousFaceCount = faces.length
        addRaisedSegment(vertices, faces, start, end, options.snowlineWidthMm, options.snowlineHeightMm, {
          terrainHeightAt,
          scale,
          baseBottomY: resolvePrintBodyAnchorBottomY(options),
        })
        if (faces.length > previousFaceCount) segmentCount += 1
      }
    }
  }

  return {
    mesh: vertices.length ? { name: 'snowline', vertices, faces } : createEmptyMesh('snowline'),
    enabled: true,
    elevationMeters: threshold.elevationMeters,
    thresholdSource: threshold.thresholdSource,
    percentile: round(options.snowlinePercentile, 3),
    widthMm: round(options.snowlineWidthMm),
    heightMm: round(options.snowlineHeightMm),
    segmentCount,
  }
}

function interpolateVertexAtHeight(left, right, heightMm) {
  const denominator = right.y - left.y
  if (Math.abs(denominator) < 1e-9) return { ...left, y: heightMm }
  const ratio = clamp((heightMm - left.y) / denominator, 0, 1)
  return {
    x: left.x + (right.x - left.x) * ratio,
    y: heightMm,
    z: left.z + (right.z - left.z) * ratio,
  }
}

function pushUniquePoint(points, point) {
  const previous = points.at(-1)
  if (
    previous
    && Math.abs(previous.x - point.x) < 1e-6
    && Math.abs(previous.y - point.y) < 1e-6
    && Math.abs(previous.z - point.z) < 1e-6
  ) {
    return
  }
  points.push(point)
}

function clipPolygonAboveHeight(polygon, heightMm) {
  const clipped = []
  polygon.forEach((current, index) => {
    const next = polygon[(index + 1) % polygon.length]
    const currentInside = current.y >= heightMm
    const nextInside = next.y >= heightMm
    if (currentInside && nextInside) {
      pushUniquePoint(clipped, next)
    } else if (currentInside && !nextInside) {
      pushUniquePoint(clipped, interpolateVertexAtHeight(current, next, heightMm))
    } else if (!currentInside && nextInside) {
      pushUniquePoint(clipped, interpolateVertexAtHeight(current, next, heightMm))
      pushUniquePoint(clipped, next)
    }
  })

  const first = clipped[0]
  const last = clipped.at(-1)
  if (
    clipped.length > 1
    && first
    && last
    && Math.abs(first.x - last.x) < 1e-6
    && Math.abs(first.y - last.y) < 1e-6
    && Math.abs(first.z - last.z) < 1e-6
  ) {
    clipped.pop()
  }

  return clipped
}

function normalizeElevationBands(bands) {
  if (!Array.isArray(bands) || !bands.length) return []
  const normalized = bands
    .filter((band) => band && Number.isFinite(Number(band.percentile)) && band.color)
    .map((band, index) => ({
      name: String(band.name || 'band-' + (index + 1)).slice(0, 30),
      percentile: clamp(Number(band.percentile), 0.02, 1),
      color: String(band.color || '#808080'),
      thicknessMm: clamp(pickNumber(band.thicknessMm, 0.45), 0.2, 1.5),
    }))
    .sort((a, b) => a.percentile - b.percentile)
  // Ensure last band reaches 1.0
  if (normalized.length && normalized[normalized.length - 1].percentile < 0.99) {
    normalized[normalized.length - 1].percentile = 1
  }
  return normalized.slice(0, MAX_ELEVATION_BAND_COUNT)
}

function clipPolygonBetweenHeights(polygon, minHeightMm, maxHeightMm) {
  // First clip below maxHeightMm (keep everything at or below max)
  const belowMax = []
  polygon.forEach((current, index) => {
    const next = polygon[(index + 1) % polygon.length]
    const currentInside = current.y <= maxHeightMm
    const nextInside = next.y <= maxHeightMm
    if (currentInside && nextInside) {
      pushUniquePoint(belowMax, next)
    } else if (currentInside && !nextInside) {
      pushUniquePoint(belowMax, interpolateVertexAtHeight(current, next, maxHeightMm))
    } else if (!currentInside && nextInside) {
      pushUniquePoint(belowMax, interpolateVertexAtHeight(current, next, maxHeightMm))
      pushUniquePoint(belowMax, next)
    }
  })
  // Remove degenerate closing vertex
  const b0 = belowMax[0]
  const bN = belowMax.at(-1)
  if (belowMax.length > 1 && b0 && bN
    && Math.abs(b0.x - bN.x) < 1e-6 && Math.abs(b0.y - bN.y) < 1e-6 && Math.abs(b0.z - bN.z) < 1e-6) {
    belowMax.pop()
  }
  if (belowMax.length < 3) return []

  // Then clip above minHeightMm (keep everything at or above min)
  const clipped = []
  belowMax.forEach((current, index) => {
    const next = belowMax[(index + 1) % belowMax.length]
    const currentInside = current.y >= minHeightMm
    const nextInside = next.y >= minHeightMm
    if (currentInside && nextInside) {
      pushUniquePoint(clipped, next)
    } else if (currentInside && !nextInside) {
      pushUniquePoint(clipped, interpolateVertexAtHeight(current, next, minHeightMm))
    } else if (!currentInside && nextInside) {
      pushUniquePoint(clipped, interpolateVertexAtHeight(current, next, minHeightMm))
      pushUniquePoint(clipped, next)
    }
  })
  const c0 = clipped[0]
  const cN = clipped.at(-1)
  if (clipped.length > 1 && c0 && cN
    && Math.abs(c0.x - cN.x) < 1e-6 && Math.abs(c0.y - cN.y) < 1e-6 && Math.abs(c0.z - cN.z) < 1e-6) {
    clipped.pop()
  }
  return clipped
}

function clipPolygonBelowHeight(polygon, heightMm) {
  const clipped = []
  polygon.forEach((current, index) => {
    const next = polygon[(index + 1) % polygon.length]
    const currentInside = current.y <= heightMm
    const nextInside = next.y <= heightMm
    if (currentInside && nextInside) {
      pushUniquePoint(clipped, next)
    } else if (currentInside && !nextInside) {
      pushUniquePoint(clipped, interpolateVertexAtHeight(current, next, heightMm))
    } else if (!currentInside && nextInside) {
      pushUniquePoint(clipped, interpolateVertexAtHeight(current, next, heightMm))
      pushUniquePoint(clipped, next)
    }
  })

  const first = clipped[0]
  const last = clipped.at(-1)
  if (
    clipped.length > 1
    && first
    && last
    && Math.abs(first.x - last.x) < 1e-6
    && Math.abs(first.y - last.y) < 1e-6
    && Math.abs(first.z - last.z) < 1e-6
  ) {
    clipped.pop()
  }

  return clipped
}

function addSolidPolygon(vertices, faces, polygon, topOffsetMm, overlapMm, bottomY = null) {
  if (polygon.length < 3) return
  const bottomStart = vertices.length
  polygon.forEach((point) => vertices.push({
    x: point.x,
    y: Number.isFinite(bottomY) ? bottomY : point.y - overlapMm,
    z: point.z,
  }))
  const topStart = vertices.length
  polygon.forEach((point) => vertices.push({
    x: point.x,
    y: point.y + topOffsetMm,
    z: point.z,
  }))

  for (let index = 1; index < polygon.length - 1; index += 1) {
    faces.push([topStart, topStart + index, topStart + index + 1])
    faces.push([bottomStart, bottomStart + index + 1, bottomStart + index])
  }

  for (let index = 0; index < polygon.length; index += 1) {
    const next = (index + 1) % polygon.length
    addQuad(faces, topStart + index, topStart + next, bottomStart + index, bottomStart + next)
  }
}

function resolveLowlandThreshold(elevations, minElevation, maxElevation, options) {
  const range = maxElevation - minElevation
  const fallback = minElevation + range * options.lowlandPercentile
  const threshold = percentile(elevations, options.lowlandPercentile) ?? fallback

  if (range <= 0) {
    return {
      elevationMeters: minElevation,
      thresholdSource: 'percentile',
    }
  }

  return {
    elevationMeters: round(clamp(threshold, minElevation + range * 0.001, maxElevation - range * 0.001), 3),
    thresholdSource: 'percentile',
  }
}

function buildLowlandColorBandMesh({ terrainMesh, topVertexCount, elevations, minElevation, maxElevation, options }) {
  const disabled = !options.terrainColorBandsEnabled || options.lowlandCapThicknessMm <= 0
  const base = {
    enabled: !disabled,
    thresholdSource: disabled ? null : 'percentile',
    percentile: round(options.lowlandPercentile, 3),
    thicknessMm: disabled ? 0 : round(options.lowlandCapThicknessMm),
    elevationMeters: null,
    coveredTriangleCount: 0,
    totalTopTriangleCount: 0,
    coverageRatio: 0,
  }
  if (disabled) {
    return {
      mesh: createEmptyMesh('lowland'),
      ...base,
      enabled: false,
    }
  }

  const threshold = resolveLowlandThreshold(elevations, minElevation, maxElevation, options)
  const thresholdHeightMm = options.baseHeightMm + (threshold.elevationMeters - minElevation) * options.verticalScale
  const vertices = []
  const faces = []
  let coveredTriangleCount = 0
  let totalTopTriangleCount = 0
  const overlapMm = Math.min(0.35, Math.max(PRINT_LAYER_LOCK_OVERLAP_MM, options.lowlandCapThicknessMm / 2))
  const anchorBottomY = resolvePrintBodyAnchorBottomY(options)

  terrainMesh.faces.forEach((face) => {
    if (!face.every((index) => index >= 0 && index < topVertexCount)) return
    totalTopTriangleCount += 1
    const polygon = face.map((index) => terrainMesh.vertices[index])
    const clipped = clipPolygonBelowHeight(polygon, thresholdHeightMm)
    if (clipped.length < 3) return
    addSolidPolygon(vertices, faces, clipped, options.lowlandCapThicknessMm, overlapMm, anchorBottomY)
    coveredTriangleCount += 1
  })

  return {
    mesh: vertices.length ? { name: 'lowland', vertices, faces } : createEmptyMesh('lowland'),
    enabled: true,
    thresholdSource: threshold.thresholdSource,
    percentile: round(options.lowlandPercentile, 3),
    elevationMeters: threshold.elevationMeters,
    thicknessMm: round(options.lowlandCapThicknessMm),
    coveredTriangleCount,
    totalTopTriangleCount,
    coverageRatio: totalTopTriangleCount > 0 ? round(coveredTriangleCount / totalTopTriangleCount, 4) : 0,
  }
}

function createDisabledLowlandColorBand() {
  return {
    mesh: createEmptyMesh('lowland'),
    enabled: false,
    thresholdSource: null,
    percentile: 0,
    elevationMeters: null,
    thicknessMm: 0,
    coveredTriangleCount: 0,
    totalTopTriangleCount: 0,
    coverageRatio: 0,
  }
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')
}

function srgbChannelToLinear(value) {
  const channel = clamp(value, 0, 255) / 255
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4
}

function xyzToLabChannel(value) {
  return value > 0.008856
    ? Math.cbrt(value)
    : 7.787037 * value + 16 / 116
}

function rgbToLab(r, g, b) {
  const linearR = srgbChannelToLinear(r)
  const linearG = srgbChannelToLinear(g)
  const linearB = srgbChannelToLinear(b)
  const x = (linearR * 0.4124 + linearG * 0.3576 + linearB * 0.1805) / 0.95047
  const y = (linearR * 0.2126 + linearG * 0.7152 + linearB * 0.0722) / 1.00000
  const z = (linearR * 0.0193 + linearG * 0.1192 + linearB * 0.9505) / 1.08883
  const fx = xyzToLabChannel(x)
  const fy = xyzToLabChannel(y)
  const fz = xyzToLabChannel(z)
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

function deltaE76(left, right) {
  const dl = left.l - right.l
  const da = left.a - right.a
  const db = left.b - right.b
  return Math.sqrt(dl * dl + da * da + db * db)
}

function kMeansClusterLab(rgbPixels, k, maxIterations = 10) {
  if (!rgbPixels.length || k <= 0) return { centers: [], assignments: [], counts: [] }
  const pixels = rgbPixels.map((pixel) => {
    const rgb = Array.isArray(pixel)
      ? { r: pixel[0], g: pixel[1], b: pixel[2] }
      : pixel
    return {
      r: clamp(Math.round(rgb.r), 0, 255),
      g: clamp(Math.round(rgb.g), 0, 255),
      b: clamp(Math.round(rgb.b), 0, 255),
    }
  })
  const clusterCount = Math.min(Math.max(1, Math.round(k)), pixels.length)
  const sorted = [...pixels].sort((left, right) => (
    (left.r + left.g + left.b) - (right.r + right.g + right.b)
  ))
  let centers = Array.from({ length: clusterCount }, (_, index) => {
    const position = clusterCount === 1
      ? Math.floor(sorted.length / 2)
      : Math.round((index * (sorted.length - 1)) / (clusterCount - 1))
    return { ...sorted[position] }
  })
  let assignments = new Array(pixels.length).fill(-1)

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const centerLabs = centers.map((center) => rgbToLab(center.r, center.g, center.b))
    let changed = false
    for (let index = 0; index < pixels.length; index += 1) {
      const pixel = pixels[index]
      const pixelLab = rgbToLab(pixel.r, pixel.g, pixel.b)
      let bestCluster = 0
      let bestDistance = Infinity
      for (let clusterIndex = 0; clusterIndex < centerLabs.length; clusterIndex += 1) {
        const distance = deltaE76(pixelLab, centerLabs[clusterIndex])
        if (distance < bestDistance) {
          bestDistance = distance
          bestCluster = clusterIndex
        }
      }
      if (assignments[index] !== bestCluster) {
        assignments[index] = bestCluster
        changed = true
      }
    }

    const sums = Array.from({ length: clusterCount }, () => ({ r: 0, g: 0, b: 0, count: 0 }))
    assignments.forEach((clusterIndex, pixelIndex) => {
      const pixel = pixels[pixelIndex]
      const sum = sums[clusterIndex]
      sum.r += pixel.r
      sum.g += pixel.g
      sum.b += pixel.b
      sum.count += 1
    })
    centers = centers.map((center, index) => {
      const sum = sums[index]
      return sum.count > 0
        ? {
          r: Math.round(sum.r / sum.count),
          g: Math.round(sum.g / sum.count),
          b: Math.round(sum.b / sum.count),
        }
        : center
    })
    if (!changed) break
  }

  const counts = new Array(clusterCount).fill(0)
  assignments.forEach((clusterIndex) => { counts[clusterIndex] += 1 })
  return {
    centers: centers.map((center) => ({
      ...center,
      hex: rgbToHex(center.r, center.g, center.b),
      lab: rgbToLab(center.r, center.g, center.b),
    })),
    assignments,
    counts,
  }
}

function triangleProjectedAreaMm2(polygon) {
  if (!polygon || polygon.length < 3) return 0
  let area = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]
    const next = polygon[(index + 1) % polygon.length]
    area += current.x * next.z - next.x * current.z
  }
  return Math.abs(area) / 2
}

function addSurfacePatchPolygon(vertices, faces, polygon, topOffsetMm, overlapMm) {
  if (polygon.length < 3) return
  const bottomStart = vertices.length
  polygon.forEach((point) => vertices.push({
    x: point.x,
    y: point.y - overlapMm,
    z: point.z,
  }))
  const topStart = vertices.length
  polygon.forEach((point) => vertices.push({
    x: point.x,
    y: point.y + topOffsetMm,
    z: point.z,
  }))

  for (let index = 1; index < polygon.length - 1; index += 1) {
    faces.push([topStart, topStart + index, topStart + index + 1])
    faces.push([bottomStart, bottomStart + index + 1, bottomStart + index])
  }
  for (let index = 0; index < polygon.length; index += 1) {
    const next = (index + 1) % polygon.length
    addQuad(faces, topStart + index, topStart + next, bottomStart + index, bottomStart + next)
  }
}

function meshFacesHaveNonManifoldEdges(faces) {
  const counts = new Map()
  for (const face of faces || []) {
    for (let index = 0; index < face.length; index += 1) {
      const a = face[index]
      const b = face[(index + 1) % face.length]
      const key = a < b ? a + ':' + b : b + ':' + a
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }
  return Array.from(counts.values()).some((count) => count !== 2)
}

function appendMeshData(targetVertices, targetFaces, sourceVertices, sourceFaces) {
  const offset = targetVertices.length
  sourceVertices.forEach((vertex) => targetVertices.push(vertex))
  sourceFaces.forEach((face) => targetFaces.push(face.map((index) => index + offset)))
}

function buildSurfaceShellMeshForFaceGroup(name, faceInfos, faceLocalIndexes, topOffsetMm, overlapMm) {
  if (!faceLocalIndexes.length) return createEmptyMesh(name)
  const selected = new Set(faceLocalIndexes)
  const vertices = []
  const faces = []

  const components = []
  const visited = new Set()
  for (const start of faceLocalIndexes) {
    if (visited.has(start)) continue
    const component = []
    const queue = [start]
    visited.add(start)
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor]
      component.push(current)
      const neighbors = faceInfos[current]?.edgeNeighbors
        ? Array.from(faceInfos[current].edgeNeighbors.values())
        : []
      for (const neighbor of neighbors) {
        if (selected.has(neighbor) && !visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push(neighbor)
        }
      }
    }
    components.push(component)
  }

  for (const component of components) {
    const componentSet = new Set(component)
    const componentVertices = []
    const componentFaces = []
    const topVertexBySource = new Map()
    const bottomVertexBySource = new Map()
    const ensureComponentVertex = (map, sourceIndex, point, yOffset) => {
      if (map.has(sourceIndex)) return map.get(sourceIndex)
      const vertexIndex = componentVertices.length
      componentVertices.push({
        x: point.x,
        y: point.y + yOffset,
        z: point.z,
      })
      map.set(sourceIndex, vertexIndex)
      return vertexIndex
    }

    for (const faceLocalIndex of component) {
      const info = faceInfos[faceLocalIndex]
      if (!info?.face?.length || !info?.polygon?.length) continue
      const topIndexes = info.face.map((sourceIndex, vertexIndex) => ensureComponentVertex(
        topVertexBySource,
        sourceIndex,
        info.polygon[vertexIndex],
        topOffsetMm,
      ))
      const bottomIndexes = info.face.map((sourceIndex, vertexIndex) => ensureComponentVertex(
        bottomVertexBySource,
        sourceIndex,
        info.polygon[vertexIndex],
        -overlapMm,
      ))
      for (let index = 1; index < topIndexes.length - 1; index += 1) {
        componentFaces.push([topIndexes[0], topIndexes[index], topIndexes[index + 1]])
        componentFaces.push([bottomIndexes[0], bottomIndexes[index + 1], bottomIndexes[index]])
      }
    }

    for (const faceLocalIndex of component) {
      const info = faceInfos[faceLocalIndex]
      if (!info?.face?.length || !info?.polygon?.length) continue
      for (let index = 0; index < info.face.length; index += 1) {
        const sourceA = info.face[index]
        const sourceB = info.face[(index + 1) % info.face.length]
        const key = sourceA < sourceB ? sourceA + ':' + sourceB : sourceB + ':' + sourceA
        const adjacent = info.edgeNeighbors?.get(key)
        if (adjacent !== undefined && componentSet.has(adjacent)) continue
        const topA = topVertexBySource.get(sourceA)
        const topB = topVertexBySource.get(sourceB)
        const bottomA = bottomVertexBySource.get(sourceA)
        const bottomB = bottomVertexBySource.get(sourceB)
        if ([topA, topB, bottomA, bottomB].every((value) => Number.isInteger(value))) {
          addQuad(componentFaces, topA, topB, bottomA, bottomB)
        }
      }
    }

    if (meshFacesHaveNonManifoldEdges(componentFaces)) {
      const fallbackVertices = []
      const fallbackFaces = []
      for (const faceLocalIndex of component) {
        const polygon = faceInfos[faceLocalIndex]?.polygon
        if (polygon?.length >= 3) addSurfacePatchPolygon(fallbackVertices, fallbackFaces, polygon, topOffsetMm, overlapMm)
      }
      appendMeshData(vertices, faces, fallbackVertices, fallbackFaces)
    } else {
      appendMeshData(vertices, faces, componentVertices, componentFaces)
    }
  }

  return vertices.length && faces.length ? { name, vertices, faces } : createEmptyMesh(name)
}

function buildTopFaceAdjacency(faceInfos) {
  const adjacency = Array.from({ length: faceInfos.length }, () => new Set())
  const edgeOwners = new Map()
  faceInfos.forEach((info, localIndex) => {
    const face = info.face
    for (let index = 0; index < face.length; index += 1) {
      const a = face[index]
      const b = face[(index + 1) % face.length]
      const key = a < b ? a + ':' + b : b + ':' + a
      if (edgeOwners.has(key)) {
        const other = edgeOwners.get(key)
        adjacency[localIndex].add(other)
        adjacency[other].add(localIndex)
        if (!info.edgeNeighbors) info.edgeNeighbors = new Map()
        if (!faceInfos[other].edgeNeighbors) faceInfos[other].edgeNeighbors = new Map()
        info.edgeNeighbors.set(key, other)
        faceInfos[other].edgeNeighbors.set(key, localIndex)
      } else {
        edgeOwners.set(key, localIndex)
      }
    }
  })
  return adjacency.map((items) => Array.from(items))
}

function smoothSatelliteAssignments(assignments, adjacency, strength) {
  const passes = strength >= 0.65 ? 2 : strength >= 0.25 ? 1 : 0
  let current = [...assignments]
  for (let pass = 0; pass < passes; pass += 1) {
    const next = [...current]
    for (let index = 0; index < current.length; index += 1) {
      const votes = new Map()
      for (const neighbor of adjacency[index] || []) {
        const cluster = current[neighbor]
        votes.set(cluster, (votes.get(cluster) || 0) + 1)
      }
      let bestCluster = current[index]
      let bestVotes = votes.get(bestCluster) || 0
      votes.forEach((count, cluster) => {
        if (count > bestVotes && count >= 2) {
          bestCluster = cluster
          bestVotes = count
        }
      })
      next[index] = bestCluster
    }
    current = next
  }
  return current
}

function mergeSmallSatellitePatches(assignments, faceInfos, adjacency, minPatchAreaMm2) {
  const threshold = pickNumber(minPatchAreaMm2, 0)
  const nextAssignments = [...assignments]
  if (threshold <= 0 || !faceInfos.length) {
    return {
      assignments: nextAssignments,
      mergedPatchCount: 0,
      mergedTriangleCount: 0,
      minPatchAreaMm2: threshold,
    }
  }

  let mergedPatchCount = 0
  let mergedTriangleCount = 0
  let changed = true
  let guard = 0
  while (changed && guard < 3) {
    changed = false
    guard += 1
    const visited = new Set()
    for (let start = 0; start < faceInfos.length; start += 1) {
      if (visited.has(start)) continue
      const cluster = nextAssignments[start]
      const queue = [start]
      const component = []
      visited.add(start)
      let areaMm2 = 0
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor]
        component.push(current)
        areaMm2 += faceInfos[current].areaMm2
        for (const neighbor of adjacency[current] || []) {
          if (!visited.has(neighbor) && nextAssignments[neighbor] === cluster) {
            visited.add(neighbor)
            queue.push(neighbor)
          }
        }
      }
      if (areaMm2 > threshold) continue
      const neighborScores = new Map()
      for (const current of component) {
        for (const neighbor of adjacency[current] || []) {
          const neighborCluster = nextAssignments[neighbor]
          if (neighborCluster === cluster) continue
          neighborScores.set(neighborCluster, (neighborScores.get(neighborCluster) || 0) + faceInfos[neighbor].areaMm2)
        }
      }
      let replacement = null
      let bestScore = -Infinity
      neighborScores.forEach((score, neighborCluster) => {
        if (score > bestScore) {
          replacement = neighborCluster
          bestScore = score
        }
      })
      if (replacement === null) continue
      component.forEach((faceIndex) => {
        nextAssignments[faceIndex] = replacement
      })
      mergedPatchCount += 1
      mergedTriangleCount += component.length
      changed = true
    }
  }

  return {
    assignments: nextAssignments,
    mergedPatchCount,
    mergedTriangleCount,
    minPatchAreaMm2: threshold,
  }
}

function resolveSatelliteMaterialBudget(options, requestedColorCount) {
  const strategy = normalizeSatelliteColorStrategy(options.satelliteColorStrategy)
  const hasBaseSlot = options.basePlateHeightMm > 0
    || options.frameWidthMm > 0
    || options.shapeType !== 'rectangle'
  const hasWhiteSlot = Boolean(
    options.contourEnabled
      || options.snowlineEnabled
      || options.labelText
      || options.secondaryLabelText,
  )
  const reservedSlots = 1 + (hasBaseSlot ? 1 : 0) + (hasWhiteSlot ? 1 : 0)
  const availableSlots = Math.max(1, BAMBU_H2C_MATERIAL_SLOT_LIMIT - reservedSlots)
  const explicitLimit = Number.isFinite(Number(options.satelliteTerrainColorLimit))
    && Number(options.satelliteTerrainColorLimit) > 0
    ? Math.round(Number(options.satelliteTerrainColorLimit))
    : null
  const requested = clamp(Math.round(pickNumber(requestedColorCount, DEFAULT_SATELLITE_COLOR_COUNT)), 1, MAX_ELEVATION_BAND_COUNT)
  const strategyDefaultLimit = strategy === 'printFirst'
    ? 2
    : strategy === 'realistic'
      ? requested
      : 4
  const rawLimit = explicitLimit || strategyDefaultLimit
  const budgetedLimit = strategy === 'realistic'
    ? clamp(Math.min(rawLimit, requested), 1, MAX_ELEVATION_BAND_COUNT)
    : clamp(Math.min(rawLimit, requested, availableSlots), 1, Math.min(MAX_ELEVATION_BAND_COUNT, availableSlots))

  return {
    strategy,
    maxSlots: BAMBU_H2C_MATERIAL_SLOT_LIMIT,
    reservedSlots,
    availableTerrainSlots: availableSlots,
    requestedColorCount: requested,
    terrainColorLimit: budgetedLimit,
    explicitTerrainColorLimit: explicitLimit,
    reservedSlotReasons: [
      'track',
      ...(hasBaseSlot ? ['base'] : []),
      ...(hasWhiteSlot ? ['white-details'] : []),
    ],
  }
}

function selectPrintableSatellitePalette(clusterResult, materialBudget) {
  const clusterCenters = clusterResult.centers || []
  const clusterCounts = clusterResult.counts || []
  if (!clusterCenters.length) return []
  const candidates = new Map()
  clusterCenters.forEach((center, index) => {
    let bestPalette = SATELLITE_PRINT_PALETTE[0]
    let bestDistance = Infinity
    for (const palette of SATELLITE_PRINT_PALETTE) {
      const paletteRgb = hexToRgb(palette.hex)
      const distance = deltaE76(center.lab, rgbToLab(paletteRgb.r, paletteRgb.g, paletteRgb.b))
      if (distance < bestDistance) {
        bestDistance = distance
        bestPalette = palette
      }
    }
    const existing = candidates.get(bestPalette.hex) || {
      ...bestPalette,
      r: hexToRgb(bestPalette.hex).r,
      g: hexToRgb(bestPalette.hex).g,
      b: hexToRgb(bestPalette.hex).b,
      lab: rgbToLab(...hexToRgbArray(bestPalette.hex)),
      sourceColors: [],
      sampleCount: 0,
      score: 0,
    }
    const sampleCount = clusterCounts[index] || 1
    existing.sourceColors.push(center.hex)
    existing.sampleCount += sampleCount
    existing.score += sampleCount / Math.max(bestDistance, 1)
    candidates.set(bestPalette.hex, existing)
  })
  return Array.from(candidates.values())
    .sort((left, right) => {
      if (right.sampleCount !== left.sampleCount) return right.sampleCount - left.sampleCount
      return left.elevationBias - right.elevationBias
    })
    .slice(0, materialBudget.terrainColorLimit)
    .sort((left, right) => left.elevationBias - right.elevationBias)
    .map((candidate, index) => ({
      ...candidate,
      index,
      hex: candidate.hex.toUpperCase(),
    }))
}

function getSatellitePixelAt(rawImageData, textureWidth, textureHeight, u, v) {
  const px = clamp(Math.floor(u * (textureWidth - 1)), 0, textureWidth - 1)
  const py = clamp(Math.floor(v * (textureHeight - 1)), 0, textureHeight - 1)
  const pixelIndex = (py * textureWidth + px) * 4
  return {
    r: rawImageData.data[pixelIndex],
    g: rawImageData.data[pixelIndex + 1],
    b: rawImageData.data[pixelIndex + 2],
  }
}

function assignSatelliteFaceToPalette(faceInfo, palette, strategy, smoothing) {
  if (!palette.length) return 0
  const pixelLab = rgbToLab(faceInfo.rgb.r, faceInfo.rgb.g, faceInfo.rgb.b)
  const strategySmoothing = strategy === 'printFirst'
    ? Math.max(0.75, smoothing)
    : strategy === 'realistic'
      ? smoothing * 0.35
      : smoothing
  let bestIndex = 0
  let bestDistance = Infinity
  palette.forEach((candidate, index) => {
    const colorDistance = deltaE76(pixelLab, candidate.lab)
    const elevationDistance = Math.abs(faceInfo.elevationRatio - candidate.elevationBias) * 26 * strategySmoothing
    const distance = colorDistance + elevationDistance
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })
  return bestIndex
}

// ── Elevation-band multi-colour mesh generator ────────────────────────────
function buildElevationBandMeshes({
  terrainMesh,
  topVertexCount,
  minElevation,
  maxElevation,
  options,
}) {
  const bands = Array.isArray(options.elevationBands) && options.elevationBands.length
    ? options.elevationBands
    : (COLOR_PRESETS.classic.bands || [])

  if (!bands.length || !options.terrainColorBandsEnabled) {
    return {
      bands: [],
      bandCount: 0,
      totalCoverageRatio: 0,
    }
  }

  const range = maxElevation - minElevation
  if (range <= 0) {
    return { bands: [], bandCount: 0, totalCoverageRatio: 0 }
  }

  const bandThicknessMm = clamp(pickNumber(options.lowlandCapThicknessMm, 0.45), 0.2, 1.5)
  const interlockMm = clamp(pickNumber(options.bandInterlockMm, DEFAULT_ELEVATION_BAND_INTERLOCK_MM), 0.05, 0.5)
  const overlapMm = Math.min(interlockMm + 0.05, bandThicknessMm * 0.5)
  const anchorBottomY = resolvePrintBodyAnchorBottomY(options)
  const baseHeightMm = options.baseHeightMm || 0

  const bandThresholds = bands.map((band) => {
    const pct = clamp(band.percentile, 0.02, 1)
    const elevationValue = minElevation + range * pct
    return {
      name: band.name,
      color: band.color,
      percentile: pct,
      elevationMeters: round(elevationValue, 3),
      heightMm: baseHeightMm + (elevationValue - minElevation) * options.verticalScale,
    }
  })

  const bandResults = bandThresholds.map((band, index) => {
    const minH = index === 0 ? baseHeightMm : bandThresholds[index - 1].heightMm + interlockMm
    const maxH = band.heightMm
    const vertices = []
    const faces = []
    let coveredTriangleCount = 0
    let totalTopTriangleCount = 0

    terrainMesh.faces.forEach((face) => {
      if (!face.every((idx) => idx >= 0 && idx < topVertexCount)) return
      totalTopTriangleCount += 1
      const polygon = face.map((idx) => terrainMesh.vertices[idx])
      const clipped = clipPolygonBetweenHeights(polygon, minH, maxH)
      if (clipped.length < 3) return
      addSolidPolygon(vertices, faces, clipped, bandThicknessMm, overlapMm, anchorBottomY)
      coveredTriangleCount += 1
    })

    return {
      name: band.name,
      displayColor: band.color,
      percentile: band.percentile,
      elevationMeters: band.elevationMeters,
      thicknessMm: bandThicknessMm,
      mesh: vertices.length ? { name: 'elevation-band-' + index, vertices, faces } : createEmptyMesh('elevation-band-' + index),
      coveredTriangleCount,
      totalTopTriangleCount,
      coverageRatio: totalTopTriangleCount > 0 ? round(coveredTriangleCount / totalTopTriangleCount, 4) : 0,
    }
  })

  const totalCovered = bandResults.reduce((sum, b) => sum + b.coveredTriangleCount, 0)
  const totalTop = bandResults[0]?.totalTopTriangleCount || 0

  return {
    bands: bandResults,
    bandCount: bandResults.length,
    totalCoverageRatio: totalTop > 0 ? round(Math.min(1, totalCovered / totalTop), 4) : 0,
  }
}

// ── Satellite-colour multi-band mesh generator ────────────────────────────
async function buildSatelliteColorBandMeshes({
  terrainMesh,
  topVertexCount,
  rawImageData,
  textureWidth,
  textureHeight,
  terrainWidthMm,
  terrainDepthMm,
  options,
}) {
  const requestedColorCount = clamp(
    Math.round(pickNumber(options.satelliteColorCount, DEFAULT_SATELLITE_COLOR_COUNT)),
    MIN_ELEVATION_BAND_COUNT,
    MAX_ELEVATION_BAND_COUNT,
  )
  const materialBudget = resolveSatelliteMaterialBudget(options, requestedColorCount)
  const bandThicknessMm = clamp(pickNumber(options.lowlandCapThicknessMm, 0.45), 0.2, 1.5)
  const interlockMm = clamp(pickNumber(options.bandInterlockMm, DEFAULT_ELEVATION_BAND_INTERLOCK_MM), 0.05, 0.5)
  const overlapMm = Math.min(interlockMm + 0.05, bandThicknessMm * 0.5)
  const strategy = materialBudget.strategy
  const smoothing = clamp(pickNumber(options.satelliteColorSmoothing, DEFAULT_OPTIONS.satelliteColorSmoothing), 0, 1)
  const imageWidth = Math.max(1, Math.round(pickNumber(textureWidth || rawImageData?.width, 512)))
  const imageHeight = Math.max(1, Math.round(pickNumber(textureHeight || rawImageData?.height, 512)))

  if (!rawImageData || !rawImageData.data || rawImageData.data.length < 4) {
    return {
      strategy,
      materialBudget,
      cleanup: {
        mergedPatchCount: 0,
        mergedTriangleCount: 0,
        minPatchAreaMm2: pickNumber(options.satelliteMinPatchAreaMm2, DEFAULT_SATELLITE_MIN_PATCH_AREA_MM2),
      },
      bands: [],
      clusterCenters: [],
      totalCoverageRatio: 0,
    }
  }

  const blockSize = Math.max(1, Math.floor(Math.min(imageWidth, imageHeight) / 64))
  const downsampledPixels = []
  for (let row = 0; row < imageHeight; row += blockSize) {
    for (let col = 0; col < imageWidth; col += blockSize) {
      let sumR = 0; let sumG = 0; let sumB = 0; let count = 0
      for (let br = 0; br < blockSize; br += 1) {
        for (let bc = 0; bc < blockSize; bc += 1) {
          const pr = row + br; const pc = col + bc
          if (pr >= imageHeight || pc >= imageWidth) continue
          const idx = (pr * imageWidth + pc) * 4
          sumR += rawImageData.data[idx]
          sumG += rawImageData.data[idx + 1]
          sumB += rawImageData.data[idx + 2]
          count += 1
        }
      }
      if (count > 0) {
        downsampledPixels.push({ r: Math.round(sumR / count), g: Math.round(sumG / count), b: Math.round(sumB / count) })
      }
    }
  }

  if (downsampledPixels.length < 1) {
    return {
      strategy,
      materialBudget,
      cleanup: {
        mergedPatchCount: 0,
        mergedTriangleCount: 0,
        minPatchAreaMm2: pickNumber(options.satelliteMinPatchAreaMm2, DEFAULT_SATELLITE_MIN_PATCH_AREA_MM2),
      },
      bands: [],
      clusterCenters: [],
      totalCoverageRatio: 0,
    }
  }
  await yieldTerrainModelWork()

  const filteredPixels = downsampledPixels.filter((pixel) => {
    const brightness = (pixel.r + pixel.g + pixel.b) / 3
    return brightness > 10 && brightness < 248
  })

  const pixelsForClustering = filteredPixels.length >= materialBudget.terrainColorLimit ? filteredPixels : downsampledPixels
  const clusterResult = kMeansClusterLab(
    pixelsForClustering,
    Math.max(materialBudget.terrainColorLimit, Math.min(requestedColorCount, MAX_ELEVATION_BAND_COUNT)),
    10,
  )
  const palette = selectPrintableSatellitePalette(clusterResult, materialBudget)
  await yieldTerrainModelWork()

  if (!palette.length) {
    return {
      strategy,
      materialBudget,
      cleanup: {
        mergedPatchCount: 0,
        mergedTriangleCount: 0,
        minPatchAreaMm2: pickNumber(options.satelliteMinPatchAreaMm2, DEFAULT_SATELLITE_MIN_PATCH_AREA_MM2),
      },
      bands: [],
      clusterCenters: [],
      totalCoverageRatio: 0,
    }
  }

  const dimensions = { terrainWidthMm, terrainDepthMm }
  const faceInfos = []
  terrainMesh.faces.forEach((face, faceIndex) => {
    if (!face.every((idx) => idx >= 0 && idx < topVertexCount)) return
    const polygon = face.map((idx) => terrainMesh.vertices[idx])
    if (polygon.length < 3) return
    let centerU = 0; let centerV = 0; let centerY = 0
    for (const vertex of polygon) {
      const uv = getTerrainSurfaceUv(vertex, dimensions)
      centerU += uv.u
      centerV += uv.v
      centerY += vertex.y
    }
    centerU /= polygon.length
    centerV /= polygon.length
    centerY /= polygon.length
    faceInfos.push({
      faceIndex,
      face,
      polygon,
      y: centerY,
      areaMm2: triangleProjectedAreaMm2(polygon),
      rgb: getSatellitePixelAt(rawImageData, imageWidth, imageHeight, centerU, centerV),
    })
  })
  await yieldTerrainModelWork()

  if (!faceInfos.length) {
    return {
      strategy,
      materialBudget,
      cleanup: {
        mergedPatchCount: 0,
        mergedTriangleCount: 0,
        minPatchAreaMm2: pickNumber(options.satelliteMinPatchAreaMm2, DEFAULT_SATELLITE_MIN_PATCH_AREA_MM2),
      },
      bands: [],
      clusterCenters: palette,
      totalCoverageRatio: 0,
    }
  }

  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const info of faceInfos) {
    if (Number.isFinite(info.y)) {
      if (info.y < minY) minY = info.y
      if (info.y > maxY) maxY = info.y
    }
  }
  const yRange = Math.max(0.001, maxY - minY)
  faceInfos.forEach((info) => {
    info.elevationRatio = clamp((info.y - minY) / yRange, 0, 1)
  })
  const adjacency = buildTopFaceAdjacency(faceInfos)
  const initialAssignments = faceInfos.map((info) => assignSatelliteFaceToPalette(info, palette, strategy, smoothing))
  const smoothedAssignments = smoothSatelliteAssignments(initialAssignments, adjacency, smoothing)
  await yieldTerrainModelWork()
  const cleanup = mergeSmallSatellitePatches(
    smoothedAssignments,
    faceInfos,
    adjacency,
    pickNumber(options.satelliteMinPatchAreaMm2, DEFAULT_SATELLITE_MIN_PATCH_AREA_MM2),
  )
  const assignments = cleanup.assignments
  await yieldTerrainModelWork()

  const faceGroups = new Map()
  assignments.forEach((paletteIndex, faceLocalIndex) => {
    if (!faceGroups.has(paletteIndex)) faceGroups.set(paletteIndex, [])
    faceGroups.get(paletteIndex).push(faceLocalIndex)
  })

  const bands = []
  for (let paletteIndex = 0; paletteIndex < palette.length; paletteIndex += 1) {
    if (paletteIndex > 0) await yieldTerrainModelWork()
    const paletteColor = palette[paletteIndex]
    const faceLocalIndexes = faceGroups.get(paletteIndex) || []
    const mesh = buildSurfaceShellMeshForFaceGroup(
      'satellite-band-' + (paletteIndex + 1),
      faceInfos,
      faceLocalIndexes,
      bandThicknessMm,
      overlapMm,
    )

    const band = {
      name: paletteColor.name || 'satellite-band-' + (paletteIndex + 1),
      displayColor: paletteColor.hex,
      clusterCenter: {
        name: paletteColor.name,
        hex: paletteColor.hex,
        sourceColors: paletteColor.sourceColors,
        sampleCount: paletteColor.sampleCount,
      },
      thicknessMm: bandThicknessMm,
      mesh,
      coveredTriangleCount: faceLocalIndexes.length,
      totalTopTriangleCount: faceInfos.length,
      coverageRatio: faceInfos.length > 0
        ? round(faceLocalIndexes.length / faceInfos.length, 4) : 0,
    }
    if (band.mesh.faces.length) bands.push(band)
  }

  const totalCovered = bands.reduce((sum, b) => sum + b.coveredTriangleCount, 0)
  return {
    strategy,
    materialBudget,
    cleanup: {
      mergedPatchCount: cleanup.mergedPatchCount,
      mergedTriangleCount: cleanup.mergedTriangleCount,
      minPatchAreaMm2: cleanup.minPatchAreaMm2,
      smoothing,
    },
    bands,
    clusterCenters: palette.map((item) => ({
      name: item.name,
      hex: item.hex,
      sourceColors: item.sourceColors,
      sampleCount: item.sampleCount,
    })),
    totalCoverageRatio: faceInfos.length > 0
      ? round(totalCovered / faceInfos.length, 4) : 0,
  }
}

function buildSnowCapMesh({ terrainMesh, topVertexCount, snowline, minElevation, options }) {
  if (!options.snowlineEnabled || options.snowCapThicknessMm <= 0 || !Number.isFinite(snowline?.elevationMeters)) {
    return {
      mesh: createEmptyMesh('snow'),
      thicknessMm: 0,
      coveredTriangleCount: 0,
      totalTopTriangleCount: 0,
      coverageRatio: 0,
    }
  }

  const thresholdHeightMm = options.baseHeightMm + (snowline.elevationMeters - minElevation) * options.verticalScale
  const vertices = []
  const faces = []
  let coveredTriangleCount = 0
  let totalTopTriangleCount = 0
  const overlapMm = Math.min(0.35, Math.max(PRINT_LAYER_LOCK_OVERLAP_MM, options.snowCapThicknessMm / 2))
  const anchorBottomY = resolvePrintBodyAnchorBottomY(options)

  terrainMesh.faces.forEach((face) => {
    if (!face.every((index) => index >= 0 && index < topVertexCount)) return
    totalTopTriangleCount += 1
    const polygon = face.map((index) => terrainMesh.vertices[index])
    const clipped = clipPolygonAboveHeight(polygon, thresholdHeightMm)
    if (clipped.length < 3) return
    addSolidPolygon(vertices, faces, clipped, options.snowCapThicknessMm, overlapMm, anchorBottomY)
    coveredTriangleCount += 1
  })

  return {
    mesh: vertices.length ? { name: 'snow', vertices, faces } : createEmptyMesh('snow'),
    thicknessMm: round(options.snowCapThicknessMm),
    coveredTriangleCount,
    totalTopTriangleCount,
    coverageRatio: totalTopTriangleCount > 0 ? round(coveredTriangleCount / totalTopTriangleCount, 4) : 0,
  }
}

function createMagnetHoles(options, widthMm, depthMm) {
  if (!options.magnetHoleEnabled || options.basePlateHeightMm <= 0) return []
  const radius = options.magnetHoleDiameterMm / 2
  const inset = options.magnetHoleInsetMm || Math.max(options.frameWidthMm * 0.55, radius + 3)
  const ringX = Math.max(radius + 1, widthMm / 2 - inset)
  const ringZ = Math.max(radius + 1, depthMm / 2 - inset)
  const startAngle = options.magnetHoleCount === 4 ? Math.PI / 4 : -Math.PI / 2
  const holes = []
  for (let index = 0; index < options.magnetHoleCount; index += 1) {
    const angle = startAngle + (index * Math.PI * 2) / options.magnetHoleCount
    let x = Math.cos(angle) * ringX
    let z = Math.sin(angle) * ringZ
    let factor = 1
    while (!isInsideShape(x, z, widthMm - radius * 2, depthMm - radius * 2, options.shapeType, options.customFootprintRingMm) && factor > 0.35) {
      factor -= 0.08
      x = Math.cos(angle) * ringX * factor
      z = Math.sin(angle) * ringZ * factor
    }
    if (isInsideShape(x, z, widthMm - radius * 2, depthMm - radius * 2, options.shapeType, options.customFootprintRingMm)) {
      holes.push({
        x: round(x),
        z: round(z),
        radiusMm: round(radius),
        diameterMm: round(options.magnetHoleDiameterMm),
      })
    }
  }
  return holes
}

function createShapeRing(widthMm, depthMm, shapeType, customRing = null) {
  if (Array.isArray(customRing) && customRing.length >= 3) {
    return customRing.map((point) => ({ x: point.x, z: point.z }))
  }
  if (shapeType === 'circle') {
    return Array.from({ length: 56 }, (_, index) => {
      const angle = (index * Math.PI * 2) / 56
      return { x: Math.cos(angle) * widthMm / 2, z: Math.sin(angle) * depthMm / 2 }
    })
  }
  if (shapeType === 'hexagon') {
    return [
      { x: -widthMm / 2, z: 0 },
      { x: -widthMm / 4, z: -depthMm / 2 },
      { x: widthMm / 4, z: -depthMm / 2 },
      { x: widthMm / 2, z: 0 },
      { x: widthMm / 4, z: depthMm / 2 },
      { x: -widthMm / 4, z: depthMm / 2 },
    ]
  }
  if (shapeType === 'triangle') {
    return [
      { x: 0, z: -depthMm / 2 },
      { x: widthMm / 2, z: depthMm / 2 },
      { x: -widthMm / 2, z: depthMm / 2 },
    ]
  }
  return [
    { x: -widthMm / 2, z: -depthMm / 2 },
    { x: widthMm / 2, z: -depthMm / 2 },
    { x: widthMm / 2, z: depthMm / 2 },
    { x: -widthMm / 2, z: depthMm / 2 },
  ]
}

function createHoleRing(hole) {
  const segments = 28
  return Array.from({ length: segments }, (_, index) => {
    const angle = Math.PI * 2 - (index * Math.PI * 2) / segments
    return {
      x: hole.x + Math.cos(angle) * hole.radiusMm,
      z: hole.z + Math.sin(angle) * hole.radiusMm,
    }
  })
}

function addRingWalls(faces, ringStart, ringLength, bottomOffset, reverse = false) {
  for (let index = 0; index < ringLength; index += 1) {
    const current = ringStart + index
    const next = ringStart + ((index + 1) % ringLength)
    if (reverse) {
      addQuad(faces, current, bottomOffset + current, next, bottomOffset + next)
    } else {
      addQuad(faces, current, next, bottomOffset + current, bottomOffset + next)
    }
  }
}

function buildCellPlateMesh({ name, widthMm, depthMm, heightMm, shapeType, holes, customRing }) {
  if (heightMm <= 0) return createEmptyMesh(name)
  const vertices = []
  const faces = []
  const rings = [createShapeRing(widthMm, depthMm, shapeType, customRing)]
  holes.forEach((hole) => rings.push(createHoleRing(hole)))
  const holeIndices = []
  const flat = []

  rings.forEach((ring, ringIndex) => {
    if (ringIndex > 0) holeIndices.push(flat.length / 2)
    ring.forEach((point) => {
      flat.push(point.x, point.z)
      vertices.push({ x: point.x, y: 0, z: point.z })
    })
  })

  const bottomOffset = vertices.length
  rings.forEach((ring) => {
    ring.forEach((point) => {
      vertices.push({ x: point.x, y: -heightMm, z: point.z })
    })
  })

  const triangles = earcut(flat, holeIndices, 2)
  for (let index = 0; index < triangles.length; index += 3) {
    const a = triangles[index]
    const b = triangles[index + 1]
    const c = triangles[index + 2]
    faces.push([a, b, c])
    faces.push([bottomOffset + c, bottomOffset + b, bottomOffset + a])
  }

  let ringStart = 0
  rings.forEach((ring, ringIndex) => {
    addRingWalls(faces, ringStart, ring.length, bottomOffset, ringIndex > 0)
    ringStart += ring.length
  })

  return { name, vertices, faces }
}

function buildBaseMesh(options, widthMm, depthMm, magnetHoles) {
  if (options.basePlateHeightMm <= 0 && options.frameWidthMm <= 0) return createEmptyMesh('base')
  return buildCellPlateMesh({
    name: 'base',
    widthMm,
    depthMm,
    heightMm: Math.max(options.basePlateHeightMm, 0.6),
    shapeType: options.shapeType,
    holes: magnetHoles,
    customRing: options.customFootprintRingMm,
  })
}

function buildCustomFootprintRingMm(footprint, projection, centerX, centerZ, scale) {
  const localFootprint = getLocalFootprintFromWgs84(footprint, projection)
  if (!localFootprint) return null
  const ring = localFootprint
    .map((point) => ({
      x: round((point.x - centerX) * scale, 5),
      z: round((point.z - centerZ) * scale, 5),
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z))
  return ring.length >= 3 ? ring : null
}

function buildLabelMesh(options, widthMm, depthMm) {
  const vertices = []
  const faces = []
  const frameWidth = Math.max(options.frameWidthMm, 5)
  const maxTextHeight = Math.max(2.6, frameWidth * 0.62)
  const maxTextWidth = Math.max(8, widthMm - frameWidth * 2)
  const labelOverlapMm = resolveRaisedOverlayOverlapMm(options.labelRaisedMm)
  const labelBottomY = resolvePrintBodyAnchorBottomY(options) ?? -labelOverlapMm
  const labelHeightMm = options.labelRaisedMm - labelBottomY
  const labels = []

  const primary = addBlockText(vertices, faces, options.labelText, {
    x: 0,
    z: -depthMm / 2 + frameWidth / 2,
    y: labelBottomY,
    heightMm: labelHeightMm,
    maxWidthMm: maxTextWidth,
    maxHeightMm: maxTextHeight,
  })
  if (primary) labels.push({ ...primary, position: 'front' })

  const secondary = addBlockText(vertices, faces, options.secondaryLabelText, {
    x: 0,
    z: depthMm / 2 - frameWidth / 2,
    y: labelBottomY,
    heightMm: labelHeightMm,
    maxWidthMm: maxTextWidth,
    maxHeightMm: maxTextHeight,
  })
  if (secondary) labels.push({ ...secondary, position: 'back' })

  return {
    mesh: vertices.length ? { name: 'label', vertices, faces } : createEmptyMesh('label'),
    labels,
  }
}

function mergeMeshes(name, meshes) {
  const vertices = []
  const faces = []
  meshes.forEach((mesh) => {
    const offset = vertices.length
    mesh.vertices.forEach((vertex) => {
      vertices.push(vertex)
    })
    mesh.faces.forEach((face) => {
      faces.push(face.map((index) => index + offset))
    })
  })
  return { name, vertices, faces }
}

export async function buildTerrainModel(points, options = {}) {
  const normalizedPoints = Array.isArray(points) ? points : []
  if (normalizedPoints.length < 2) {
    throw new Error('至少需要 2 个轨迹点才能生成地形模型')
  }

  const resolvedOptions = normalizeOptions(options)
  const baseProjection = createProjection(normalizedPoints)
  const projectionAlignment = createAlignedTerrainProjection(baseProjection, resolvedOptions)
  const projection = projectionAlignment.projection
  const rawLocalTrack = normalizedPoints.map((point) => projection.toLocal(point))
  const localTrack = cleanLocalTrackElevations(rawLocalTrack)
  const bounds = getBounds(localTrack, resolvedOptions, projection)
  const requestedBoundsWgs84 = roundWgs84Bounds(resolvedOptions.terrainBoundsWgs84)
  const boundsWgs84 = getWgs84BoundsFromLocalBounds(bounds, projection)
  const widthMeters = bounds.maxX - bounds.minX
  const depthMeters = bounds.maxZ - bounds.minZ
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerZ = (bounds.minZ + bounds.maxZ) / 2
  const frameWidthMm = resolvedOptions.basePlateHeightMm > 0 || resolvedOptions.frameWidthMm > 0
    ? Math.min(resolvedOptions.frameWidthMm, resolvedOptions.modelWidthMm / 4, resolvedOptions.modelDepthMm / 4)
    : 0
  const terrainTargetWidthMm = Math.max(30, resolvedOptions.modelWidthMm - frameWidthMm * 2)
  const terrainTargetDepthMm = Math.max(30, resolvedOptions.modelDepthMm - frameWidthMm * 2)
  const scale = Math.min(
    terrainTargetWidthMm / widthMeters,
    terrainTargetDepthMm / depthMeters,
  )
  const rows = resolvedOptions.gridRows
  const cols = resolvedOptions.gridCols
  const gridSpacingMeters = {
    x: widthMeters / Math.max(cols - 1, 1),
    z: depthMeters / Math.max(rows - 1, 1),
  }
  const gridSpacingMm = {
    x: gridSpacingMeters.x * scale,
    z: gridSpacingMeters.z * scale,
  }
  const localSamples = []
  const samples = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = bounds.minX + (widthMeters * col) / Math.max(cols - 1, 1)
      const z = bounds.minZ + (depthMeters * row) / Math.max(rows - 1, 1)
      localSamples.push({ x, z })
      samples.push(projection.toWgs84({ x, z }))
    }
  }

  // Inverse-distance interpolation of the track elevations onto the grid is the
  // single most expensive step (O(samples × trackPoints)). It is only needed
  // (a) as the raw elevations when no DEM sampler is supplied, or (b) to fill
  // holes / derive a reference median when the sampler leaves gaps. For a
  // complete DEM/satellite grid it is pure waste, so build it lazily and reuse
  // the elevated-track filter across every sample.
  const elevatedTrack = buildElevatedTrack(localTrack)
  const resolveFallbackAt = (index) => interpolateElevatedTrackElevation(
    elevatedTrack,
    localSamples[index].x,
    localSamples[index].z,
  )
  let fallbackElevations = null
  const buildFallbackElevations = () => {
    if (!fallbackElevations) {
      fallbackElevations = localSamples.map((_, index) => resolveFallbackAt(index))
    }
    return fallbackElevations
  }
  const supersampledElevations = await resolveSupersampledElevations({
    rows,
    cols,
    bounds,
    widthMeters,
    depthMeters,
    projection,
    supersample: resolvedOptions.terrainSupersample,
    options: resolvedOptions,
  })
  const rawElevations = supersampledElevations || await resolveElevations(samples, buildFallbackElevations, resolvedOptions)
  // The full IDW grid is only needed when the sampler grid is ambiguous: voids
  // need hole-filling, and near-zero samples need the track-based reference
  // median to decide whether they are genuine sea-level data or NoData (the
  // zeroAsNoData heuristic). A clean high-terrain grid needs neither, so we skip
  // building the whole grid — the dominant cost in the DEM/satellite path — and
  // resolve any rare residual fill cell lazily (per cell). This produces the
  // exact same elevations as always computing the grid; it just avoids the work.
  const samplerGridIsAmbiguous = !fallbackElevations
    && rawElevations.some((value) => !Number.isFinite(value) || Math.abs(value) <= 1)
  if (samplerGridIsAmbiguous) buildFallbackElevations()
  const elevationFallbackValues = fallbackElevations || resolveFallbackAt
  // referenceMedian only influences the zeroAsNoData heuristic, which is inert
  // unless near-zero samples exist; when they do, fallbackElevations is built and
  // its median matches the original. Otherwise any finite value is equivalent.
  const referenceMedian = fallbackElevations ? median(fallbackElevations) : median(rawElevations)
  const elevationResult = prepareElevationGrid(rawElevations, rows, cols, elevationFallbackValues, {
    referenceMedian,
    smoothingPasses: resolvedOptions.elevationSmoothingPasses,
    // 真实优先 / 地貌优先档保留真实山脊与深谷（只清孤立伪影）；
    // 打印可读档维持原有更激进的去噪以换取更干净的可打印面。
    preserveRidges: resolvedOptions.terrainSupersample > 1
      || normalizeReliefMode(resolvedOptions.reliefMode) !== 'print-readable',
  })
  const elevations = elevationResult.values
  const minElevation = elevationResult.minElevationMeters
  const maxElevation = elevationResult.maxElevationMeters
  const elevationGain = maxElevation - minElevation
  const effectiveVerticalScale = computeEffectiveVerticalScale(elevationGain, resolvedOptions)
  const reliefMm = elevationGain * effectiveVerticalScale
  const realScaleReliefMm = elevationGain * scale
  const verticalExaggeration = scale > 0 ? effectiveVerticalScale / scale : 1
  const customFootprintRingMm = buildCustomFootprintRingMm(
    resolvedOptions.terrainFootprintWgs84,
    projection,
    centerX,
    centerZ,
    scale,
  )
  const meshOptions = {
    ...resolvedOptions,
    shapeType: customFootprintRingMm ? 'custom' : resolvedOptions.shapeType,
    verticalScale: effectiveVerticalScale,
    customFootprintRingMm,
  }
  const terrain = buildTerrainMesh({
    rows,
    cols,
    bounds,
    elevations,
    minElevation,
    scale,
    centerX,
    centerZ,
    options: meshOptions,
  })
  const terrainHeightAt = createTerrainHeightAt({
    rows,
    cols,
    bounds,
    topHeightsMm: terrain.topHeightsMm,
  })
  const contours = buildContourMesh({
    rows,
    cols,
    bounds,
    elevations,
    minElevation,
    maxElevation,
    scale,
    centerX,
    centerZ,
    terrainHeightAt,
    options: meshOptions,
  })
  const snowline = buildSnowlineMesh({
    rows,
    cols,
    bounds,
    elevations,
    minElevation,
    maxElevation,
    scale,
    centerX,
    centerZ,
    terrainHeightAt,
    options: meshOptions,
  })
  // ── Color-band routing (elevation / satellite / legacy lowland) ──────
  const colorMode = meshOptions.colorMode
  let lowland = null
  let elevationBandResult = null
  let satelliteBandResult = null
  let useMultiBand = false

  if (colorMode === 'elevation' && meshOptions.terrainColorBandsEnabled) {
    elevationBandResult = buildElevationBandMeshes({
      terrainMesh: terrain.mesh,
      topVertexCount: rows * cols,
      elevations,
      minElevation,
      maxElevation,
      options: meshOptions,
    })
    useMultiBand = true
    // Create a dummy lowland for backward compat (empty mesh)
    lowland = createDisabledLowlandColorBand()
  } else if (colorMode === 'satellite' && meshOptions.rawImageData) {
    satelliteBandResult = await buildSatelliteColorBandMeshes({
      terrainMesh: terrain.mesh,
      topVertexCount: rows * cols,
      rawImageData: meshOptions.rawImageData,
      textureWidth: meshOptions.textureWidth || 512,
      textureHeight: meshOptions.textureHeight || 512,
      terrainWidthMm: widthMeters * scale,
      terrainDepthMm: depthMeters * scale,
      options: meshOptions,
    })
    useMultiBand = true
    lowland = createDisabledLowlandColorBand()
  } else if (colorMode === 'satellite') {
    lowland = createDisabledLowlandColorBand()
  } else {
    lowland = buildLowlandColorBandMesh({
      terrainMesh: terrain.mesh,
      topVertexCount: rows * cols,
      elevations,
      minElevation,
      maxElevation,
      options: meshOptions,
    })
  }
  const snow = buildSnowCapMesh({
    terrainMesh: terrain.mesh,
    topVertexCount: rows * cols,
    snowline,
    minElevation,
    options: meshOptions,
  })
  const trackMesh = buildTrackMesh({
    localTrack,
    scale,
    centerX,
    centerZ,
    terrainHeightAt,
    options: meshOptions,
  })
  const terrainWidthMm = widthMeters * scale
  const terrainDepthMm = depthMeters * scale
  const modelWidthMm = Math.max(terrainWidthMm + frameWidthMm * 2, terrainWidthMm)
  const modelDepthMm = Math.max(terrainDepthMm + frameWidthMm * 2, terrainDepthMm)
  const printOptions = {
    ...resolvedOptions,
    frameWidthMm,
    shapeType: customFootprintRingMm ? 'custom' : resolvedOptions.shapeType,
    customFootprintRingMm,
  }
  const magnetHoles = createMagnetHoles(printOptions, modelWidthMm, modelDepthMm)
  const baseMesh = buildBaseMesh(printOptions, modelWidthMm, modelDepthMm, magnetHoles)
  const label = buildLabelMesh(printOptions, modelWidthMm, modelDepthMm)
  const bandMeshes = useMultiBand
    ? (elevationBandResult
      ? elevationBandResult.bands.filter((b) => b.mesh.faces.length)
      : satelliteBandResult
        ? satelliteBandResult.bands.filter((b) => b.mesh.faces.length)
        : [])
    : []
  const printKitEnabled = resolvedOptions.shapeType !== 'rectangle'
    || frameWidthMm > 0
    || baseMesh.faces.length > 0
    || label.mesh.faces.length > 0
    || magnetHoles.length > 0
    || snowline.mesh.faces.length > 0
    || lowland.mesh.faces.length > 0
    || snow.mesh.faces.length > 0
    || bandMeshes.length > 0
  const combined = mergeMeshes(
    printKitEnabled ? 'print-kit' : 'terrain-track',
    printKitEnabled
      ? [baseMesh, terrain.mesh, lowland.mesh, contours.mesh, snowline.mesh, snow.mesh, trackMesh, label.mesh, ...bandMeshes.map((b) => b.mesh)]
      : [terrain.mesh, lowland.mesh, contours.mesh, snowline.mesh, snow.mesh, trackMesh, ...bandMeshes.map((b) => b.mesh)],
  )
  const trackSummary = summarizeTrack(normalizedPoints)

  return {
    kind: 'door-terrain-track-model',
    generatedAt: new Date().toISOString(),
    projection: {
      originWgs84: {
        latitude: round(baseProjection.origin.latitude, 7),
        longitude: round(baseProjection.origin.longitude, 7),
      },
      scaleMmPerMeter: round(scale, 6),
      footprintRotationDegrees: projectionAlignment.footprintRotationDegrees,
      exportAlignmentDegrees: projectionAlignment.exportAlignmentDegrees,
      alignmentCenterMeters: projectionAlignment.centerLocal
        ? {
          x: round(projectionAlignment.centerLocal.x),
          z: round(projectionAlignment.centerLocal.z),
        }
        : null,
    },
    terrain: {
      rows,
      cols,
      source: typeof resolvedOptions.sampleElevations === 'function' ? 'sampled' : 'gpx-elevation',
      precision: {
        preset: resolvedOptions.terrainQuality,
        sampleCount: rows * cols,
        gridSpacingMeters: {
          x: round(gridSpacingMeters.x, 2),
          z: round(gridSpacingMeters.z, 2),
          min: round(Math.min(gridSpacingMeters.x, gridSpacingMeters.z), 2),
        },
        gridSpacingMm: {
          x: round(gridSpacingMm.x, 3),
          z: round(gridSpacingMm.z, 3),
          min: round(Math.min(gridSpacingMm.x, gridSpacingMm.z), 3),
        },
        targetModelGridMm: resolvedOptions.targetModelGridMm,
        source: {
          type: resolvedOptions.elevationSourceType
            || (typeof resolvedOptions.sampleElevations === 'function' ? 'sampled-dem' : 'gpx-elevation'),
          name: resolvedOptions.elevationSourceName
            || (typeof resolvedOptions.sampleElevations === 'function' ? 'sampled terrain' : 'GPX elevation'),
          resolutionMeters: resolvedOptions.elevationSourceResolutionMeters,
          boundsWgs84: resolvedOptions.elevationSourceBoundsWgs84,
        },
      },
      boundsMeters: {
        minX: round(bounds.minX),
        maxX: round(bounds.maxX),
        minZ: round(bounds.minZ),
        maxZ: round(bounds.maxZ),
        width: round(widthMeters),
        depth: round(depthMeters),
      },
      boundsWgs84,
      boundsSource: getBoundsSource(resolvedOptions),
      requestedBoundsWgs84,
      requestedFootprintWgs84: roundWgs84Footprint(resolvedOptions.terrainFootprintWgs84),
      minElevationMeters: round(minElevation),
      maxElevationMeters: round(maxElevation),
      quality: elevationResult.quality,
    },
    route: {
      ...trackSummary,
      printGeometry: trackMesh.printGeometry || null,
      localPoints: localTrack.map((point) => ({
        x: round(point.x),
        z: round(point.z),
      })),
    },
    stats: {
      modelWidthMm: round(modelWidthMm),
      modelDepthMm: round(modelDepthMm),
      terrainWidthMm: round(terrainWidthMm),
      terrainDepthMm: round(terrainDepthMm),
      baseHeightMm: round(resolvedOptions.baseHeightMm),
      frameWidthMm: round(frameWidthMm),
      basePlateHeightMm: round(resolvedOptions.basePlateHeightMm),
      maxHeightMm: round(resolvedOptions.baseHeightMm + elevationGain * effectiveVerticalScale + resolvedOptions.trackHeightMm),
      elevationGainMeters: round(elevationGain),
      reliefMm: round(reliefMm, 2),
      requestedVerticalScale: round(resolvedOptions.verticalScale, 6),
      effectiveVerticalScale: round(effectiveVerticalScale, 6),
      realScaleReliefMm: round(realScaleReliefMm, 2),
      verticalExaggeration: round(verticalExaggeration, 2),
      maxReliefMm: Number.isFinite(resolvedOptions.maxReliefMm) ? round(resolvedOptions.maxReliefMm) : null,
      reliefMode: resolvedOptions.reliefMode,
      terrainTriangles: terrain.mesh.faces.length,
      lowlandTriangles: lowland.mesh.faces.length,
      contourTriangles: contours.mesh.faces.length,
      snowlineTriangles: snowline.mesh.faces.length,
      snowTriangles: snow.mesh.faces.length,
      trackTriangles: trackMesh.faces.length,
      baseTriangles: baseMesh.faces.length,
      labelTriangles: label.mesh.faces.length,
    },
    contours: {
      enabled: contours.enabled,
      intervalMeters: contours.intervalMeters,
      widthMm: contours.widthMm,
      heightMm: contours.heightMm,
      levelsMeters: contours.levelsMeters,
      segmentCount: contours.segmentCount,
    },
    colorBands: {
      enabled: lowland.enabled || useMultiBand,
      mode: colorMode || 'legacy',
      lowland: {
        enabled: lowland.enabled,
        thresholdSource: lowland.thresholdSource,
        percentile: lowland.percentile,
        elevationMeters: lowland.elevationMeters,
        thicknessMm: lowland.thicknessMm,
        coveredTriangleCount: lowland.coveredTriangleCount,
        totalTopTriangleCount: lowland.totalTopTriangleCount,
        coverageRatio: lowland.coverageRatio,
      },
      elevationBands: elevationBandResult
        ? {
          bandCount: elevationBandResult.bandCount,
          bands: elevationBandResult.bands.map((b) => ({
            name: b.name,
            displayColor: b.displayColor,
            percentile: b.percentile,
            elevationMeters: b.elevationMeters,
            thicknessMm: b.thicknessMm,
            coveredTriangleCount: b.coveredTriangleCount,
            totalTopTriangleCount: b.totalTopTriangleCount,
            coverageRatio: b.coverageRatio,
          })),
          totalCoverageRatio: elevationBandResult.totalCoverageRatio,
        }
        : null,
      satelliteBands: satelliteBandResult
        ? {
          strategy: satelliteBandResult.strategy,
          materialBudget: satelliteBandResult.materialBudget,
          cleanup: satelliteBandResult.cleanup,
          bandCount: satelliteBandResult.bands.length,
          clusterCenters: satelliteBandResult.clusterCenters,
          bands: satelliteBandResult.bands.map((b) => ({
            name: b.name,
            displayColor: b.displayColor,
            clusterCenter: b.clusterCenter,
            thicknessMm: b.thicknessMm,
            coveredTriangleCount: b.coveredTriangleCount,
            totalTopTriangleCount: b.totalTopTriangleCount,
            coverageRatio: b.coverageRatio,
          })),
          totalCoverageRatio: satelliteBandResult.totalCoverageRatio,
        }
        : null,
    },
    snowline: {
      enabled: snowline.enabled,
      elevationMeters: snowline.elevationMeters,
      thresholdSource: snowline.thresholdSource,
      percentile: snowline.percentile,
      widthMm: snowline.widthMm,
      heightMm: snowline.heightMm,
      segmentCount: snowline.segmentCount,
      thicknessMm: snow.thicknessMm,
      coveredTriangleCount: snow.coveredTriangleCount,
      totalTopTriangleCount: snow.totalTopTriangleCount,
      coverageRatio: snow.coverageRatio,
    },
    print: {
      enabled: printKitEnabled,
      shapeType: printOptions.shapeType,
      frameWidthMm: round(frameWidthMm),
      basePlateHeightMm: round(resolvedOptions.basePlateHeightMm),
      magnetHoles,
      labels: label.labels,
      parts: [],
      filamentType: resolvedOptions.filamentType || DEFAULT_FILAMENT_TYPE,
    },
    meshes: {
      terrain: terrain.mesh,
      lowland: lowland.mesh,
      contours: contours.mesh,
      snowline: snowline.mesh,
      snow: snow.mesh,
      track: trackMesh,
      base: baseMesh,
      text: label.mesh,
      combined,
      elevationBands: elevationBandResult ? elevationBandResult.bands.map((b) => b.mesh) : [],
      satelliteBands: satelliteBandResult ? satelliteBandResult.bands.map((b) => b.mesh) : [],
    },
  }
}

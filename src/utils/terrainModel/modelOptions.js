import {
  getWgs84BoundsFromFootprint,
  normalizeTerrainFootprintRotationDegrees,
  normalizeWgs84Bounds,
  normalizeWgs84Footprint,
} from './geo.js'
import { clamp, pickNumber } from './numeric.js'
import {
  DEFAULT_FILAMENT_TYPE,
  FILAMENT_TYPES,
  PRINT_LAYER_LOCK_OVERLAP_MM,
} from './printConfig.js'
export const DEFAULT_OPTIONS = {
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

export const SHAPE_TYPES = new Set(['rectangle', 'hexagon', 'circle', 'triangle', 'custom'])
export const TERRAIN_QUALITY_PRESETS = new Set(['draft', 'standard', 'high', 'ultra'])
export const MAX_GRID_SIZE = 320
export const MAX_TERRAIN_SUPERSAMPLE = 3
export const MIN_HIGH_PRECISION_GRID_SIZE = 96
export const DEFAULT_HIGH_PRECISION_GRID_MM = 0.42
export const MIN_MODEL_SIDE_MM = 8
export const MIN_RELIEF_MM = 3
export const MAX_RELIEF_MM = 90
export const PRINT_READABLE_MIN_RELIEF_MM = 12
export const PRINT_READABLE_TARGET_RELIEF_MM = 16
export const PRINT_READABLE_RELIEF_MULTIPLIER = 4
export const PRINT_READABLE_MAX_RELIEF_MM = 24
// 「地貌优先 / 戏剧化」起伏档：在制图浮雕惯例（垂直夸张 2–10x）内把起伏抬高，
// 以纸面浮雕地图与 TouchTerrain/DEMto3D 实践为参照；起伏上限按短边比例兜底
// （高度场打印不存在悬垂，唯一约束是稳固/观感，故用 footprint 比例而非坡度护栏）。
export const TERRAIN_FORWARD_MIN_RELIEF_MM = 18
export const TERRAIN_FORWARD_TARGET_FOOTPRINT_RATIO = 0.34
export const TERRAIN_FORWARD_MAX_FOOTPRINT_RATIO = 0.42
export const TERRAIN_FORWARD_RELIEF_MULTIPLIER = 6
export const TERRAIN_FORWARD_MAX_EXAGGERATION = 8
export const TERRAIN_FORWARD_MAX_RELIEF_MM = 60
export const RAISED_OVERLAY_MIN_OVERLAP_MM = PRINT_LAYER_LOCK_OVERLAP_MM
export const RAISED_OVERLAY_MAX_OVERLAP_MM = 0.35
export const COLOR_PRESETS = {
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

export const DEFAULT_ELEVATION_BAND_INTERLOCK_MM = 0.15
export const MIN_ELEVATION_BAND_COUNT = 2
export const MAX_ELEVATION_BAND_COUNT = 7
export const DEFAULT_SATELLITE_COLOR_COUNT = 5
export const SATELLITE_COLOR_STRATEGIES = new Set(['balanced', 'realistic', 'printFirst'])
export const BAMBU_H2C_MATERIAL_SLOT_LIMIT = 6
export const DEFAULT_SATELLITE_MIN_PATCH_AREA_MM2 = 24
export function normalizeShapeType(value) {
  const shapeType = String(value || '').trim().toLowerCase()
  if (shapeType === 'hex') return 'hexagon'
  return SHAPE_TYPES.has(shapeType) ? shapeType : DEFAULT_OPTIONS.shapeType
}

export function normalizeTerrainQuality(value, rows, cols) {
  const quality = String(value || '').trim().toLowerCase()
  if (TERRAIN_QUALITY_PRESETS.has(quality)) return quality
  return Math.max(rows, cols) > 160 ? 'ultra' : Math.max(rows, cols) > 96 ? 'high' : DEFAULT_OPTIONS.terrainQuality
}

export function normalizeTerrainModelOptions(options = {}) {
  const input = options && typeof options === 'object' ? options : {}
  const merged = { ...DEFAULT_OPTIONS, ...input }
  const terrainFootprintWgs84 = normalizeWgs84Footprint(
    merged.terrainFootprintWgs84
      ?? merged.manualFootprintWgs84
      ?? merged.footprintWgs84,
  )
  const footprintBoundsWgs84 = getWgs84BoundsFromFootprint(terrainFootprintWgs84)
  const rawShapeType = input.shapeType ?? input.shape ?? input.footprintShape ?? DEFAULT_OPTIONS.shapeType
  const shapeType = terrainFootprintWgs84 ? 'custom' : normalizeShapeType(rawShapeType)
  const gridRows = clamp(Math.round(pickNumber(merged.gridRows, DEFAULT_OPTIONS.gridRows)), 4, MAX_GRID_SIZE)
  const gridCols = clamp(Math.round(pickNumber(merged.gridCols, DEFAULT_OPTIONS.gridCols)), 4, MAX_GRID_SIZE)
  const terrainSupersample = clamp(Math.round(pickNumber(merged.terrainSupersample, DEFAULT_OPTIONS.terrainSupersample)), 1, MAX_TERRAIN_SUPERSAMPLE)
  const terrainQuality = normalizeTerrainQuality(
    input.terrainQuality ?? input.qualityPreset ?? DEFAULT_OPTIONS.terrainQuality,
    gridRows,
    gridCols,
  )
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
    maxReliefMm: clamp(pickNumber(input.maxReliefMm ?? input.maxTerrainReliefMm, DEFAULT_OPTIONS.maxReliefMm), MIN_RELIEF_MM, MAX_RELIEF_MM),
    reliefMode: normalizeTerrainReliefMode(merged.reliefMode),
    elevationSmoothingPasses: clamp(Math.round(pickNumber(merged.elevationSmoothingPasses, DEFAULT_OPTIONS.elevationSmoothingPasses)), 0, 4),
    contourEnabled: Boolean(input.contourEnabled ?? input.contoursEnabled ?? DEFAULT_OPTIONS.contourEnabled),
    contourIntervalMeters: clamp(pickNumber(input.contourIntervalMeters ?? input.contourIntervalM, DEFAULT_OPTIONS.contourIntervalMeters), 5, 500),
    contourWidthMm: clamp(pickNumber(merged.contourWidthMm, DEFAULT_OPTIONS.contourWidthMm), 0.2, 2),
    contourHeightMm: clamp(pickNumber(merged.contourHeightMm, DEFAULT_OPTIONS.contourHeightMm), 0.1, 1.5),
    snowlineEnabled: Boolean(input.snowlineEnabled ?? input.snowLineEnabled ?? DEFAULT_OPTIONS.snowlineEnabled),
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
    terrainColorBandsEnabled: Boolean(
      input.terrainColorBandsEnabled
        ?? input.colorBandsEnabled
        ?? DEFAULT_OPTIONS.terrainColorBandsEnabled,
    ),
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
    magnetHoleCount: clamp(Math.round(pickNumber(input.magnetHoleCount ?? input.magnetCount, DEFAULT_OPTIONS.magnetHoleCount)), 2, 12),
    magnetHoleDiameterMm: clamp(pickNumber(input.magnetHoleDiameterMm ?? input.magnetDiameterMm, DEFAULT_OPTIONS.magnetHoleDiameterMm), 3, 18),
    magnetHoleInsetMm: Number.isFinite(Number(merged.magnetHoleInsetMm ?? merged.magnetInsetMm)) ? clamp(Number(merged.magnetHoleInsetMm ?? merged.magnetInsetMm), 3, 40) : null,
    labelText: String(merged.labelText || '').slice(0, 24),
    secondaryLabelText: String(merged.secondaryLabelText || '').slice(0, 24),
    labelRaisedMm: clamp(pickNumber(input.labelRaisedMm ?? input.labelHeightMm, DEFAULT_OPTIONS.labelRaisedMm), 0.4, 3),
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

export function normalizeTerrainReliefMode(value) {
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

export function normalizeSatelliteColorStrategy(value) {
  const strategy = String(value || '').trim()
  return SATELLITE_COLOR_STRATEGIES.has(strategy) ? strategy : DEFAULT_OPTIONS.satelliteColorStrategy
}
export function normalizeElevationBands(bands) {
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
export function cloneDefaultTerrainModelOptions() {
  return {
    ...DEFAULT_OPTIONS,
    elevationBands: DEFAULT_OPTIONS.elevationBands.map((band) => ({ ...band })),
  }
}

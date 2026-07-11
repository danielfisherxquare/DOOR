import { recommendModelDimensionsForTrack } from '../../../utils/terrainModel/model.js'
import { SURFACE_TEXTURE_SOURCES } from '../../../utils/terrainModel/surfaceTexture.js'

export const DEFAULT_OPTIONS = {
  terrainQuality: 'high',
  gridRows: 160,
  gridCols: 160,
  modelLongSideMm: 120,
  modelWidthMm: 120,
  modelDepthMm: 104,
  paddingMeters: 300,
  baseHeightMm: 2,
  verticalScale: 0.18,
  maxReliefMm: 42,
  reliefMode: 'print-readable',
  elevationSmoothingPasses: 0,
  contourEnabled: false,
  contourIntervalMeters: 50,
  contourWidthMm: 0.45,
  contourHeightMm: 0.35,
  snowlineEnabled: false,
  snowlineElevationMeters: '',
  snowlinePercentile: 82,
  snowCapThicknessMm: 0.5,
  terrainColorBandsEnabled: true,
  colorMode: 'elevation',
  elevationBands: [
    { name: '低地', percentile: 0.33, color: '#2E8B57', thicknessMm: 0.5 },
    { name: '中山', percentile: 0.66, color: '#B8964E', thicknessMm: 0.5 },
    { name: '高山', percentile: 1.0, color: '#D4CFC4', thicknessMm: 0.5 },
  ],
  satelliteColorCount: 5,
  satelliteColorStrategy: 'balanced',
  satelliteTerrainColorLimit: 0,
  satelliteMinPatchAreaMm2: 24,
  satelliteColorSmoothing: 55,
  bandInterlockMm: 0.15,
  filamentType: 'PLA Basic',
  lowlandPercentile: 35,
  lowlandCapThicknessMm: 0.45,
  trackWidthMm: 2,
  trackHeightMm: 0.6,
  shapeType: 'hexagon',
  frameWidthMm: 8,
  basePlateHeightMm: 3,
  baseGridResolution: 50,
  magnetHoleEnabled: true,
  magnetHoleCount: 6,
  magnetHoleDiameterMm: 6,
  magnetHoleInsetMm: 14,
  labelText: '',
  secondaryLabelText: '',
  labelRaisedMm: 1.2,
  targetModelGridMm: 0.42,
}

export const TERRAIN_QUALITY_PRESETS = {
  draft: { label: '草稿', rows: 36, cols: 36, smoothing: 1 },
  standard: { label: '标准', rows: 96, cols: 96, smoothing: 1 },
  high: { label: '高精度', rows: 192, cols: 192, smoothing: 0 },
  ultra: { label: '极高', rows: 320, cols: 320, smoothing: 0 },
}

export const OPENTOPOGRAPHY_DEM_TYPES = {
  COP30: { label: 'Copernicus 30m', resolutionMeters: 30 },
  COP90: { label: 'Copernicus 90m', resolutionMeters: 90 },
  SRTMGL1: { label: 'SRTM 30m', resolutionMeters: 30 },
  NASADEM: { label: 'NASADEM 30m', resolutionMeters: 30 },
  AW3D30: { label: 'ALOS World 3D 30m', resolutionMeters: 30 },
}

export const SURFACE_TEXTURE_QUALITY_PRESETS = {
  standard: { label: '标准', maxTextureSize: 1536, maxTiles: 12, maxTexturePixels: 2_400_000 },
  high: { label: '高清', maxTextureSize: 2048, maxTiles: 24, maxTexturePixels: 4_200_000 },
  ultra: { label: '极清', maxTextureSize: 3072, maxTiles: 48, maxTexturePixels: 9_500_000 },
}

export const SATELLITE_COLOR_STRATEGY_OPTIONS = [
  { key: 'balanced', label: '平衡模式' },
  { key: 'realistic', label: '真实优先' },
  { key: 'printFirst', label: '打印优先' },
]

export const TERRAIN_MODEL_CONFIG_VERSION = 1
export const DEFAULT_CESIUM_ION_ASSET_ID = import.meta.env?.VITE_CESIUM_ION_IMAGERY_ASSET_ID || '2'
export const EMPTY_MANUAL_BOUNDS_WGS84 = {
  south: '',
  north: '',
  west: '',
  east: '',
}
export const MANUAL_FOOTPRINT_SHAPES = [
  { key: 'rectangle', label: '矩形', icon: 'crop_square' },
  { key: 'hexagon', label: '六边形', icon: 'hexagon' },
  { key: 'triangle', label: '三角形', icon: 'change_history' },
  { key: 'custom', label: '自定义', icon: 'polyline' },
]

export function formatDistance(value) {
  if (!Number.isFinite(value)) return '-'
  return value >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${Math.round(value)} m`
}

function estimateWgs84BoundsMeters(bounds) {
  if (!bounds) return null
  const latSpan = bounds.north - bounds.south
  const lonSpan = bounds.east - bounds.west
  if (!Number.isFinite(latSpan) || !Number.isFinite(lonSpan) || latSpan <= 0 || lonSpan <= 0) return null
  const centerLatitude = (bounds.north + bounds.south) / 2
  const metersPerDegreeLatitude = 111_320
  const metersPerDegreeLongitude = Math.max(
    1,
    metersPerDegreeLatitude * Math.cos(centerLatitude * Math.PI / 180),
  )
  const widthMeters = lonSpan * metersPerDegreeLongitude
  const depthMeters = latSpan * metersPerDegreeLatitude
  return {
    widthMeters,
    depthMeters,
    areaSquareMeters: widthMeters * depthMeters,
  }
}

export function formatBoundsSize(bounds) {
  const metrics = estimateWgs84BoundsMeters(bounds)
  if (!metrics) return '-'
  return `${formatDistance(metrics.widthMeters)} x ${formatDistance(metrics.depthMeters)}`
}

export function formatBoundsArea(bounds) {
  const metrics = estimateWgs84BoundsMeters(bounds)
  if (!metrics) return '-'
  return metrics.areaSquareMeters >= 1_000_000
    ? `${(metrics.areaSquareMeters / 1_000_000).toFixed(2)} km2`
    : `${Math.round(metrics.areaSquareMeters)} m2`
}

export function getTerrainBoundsModeLabel(mode) {
  return mode === 'manual' ? '手动框选' : '自动外扩'
}

export function normalizeManualFootprintRotationDegrees(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  const normalized = ((number % 360) + 360) % 360
  const signed = normalized > 180 ? normalized - 360 : normalized
  return Number(signed.toFixed(1))
}

export function buildTerrainModelOptions(points, options) {
  const dimensions = recommendModelDimensionsForTrack(points, options)
  return {
    ...options,
    modelWidthMm: dimensions.modelWidthMm,
    modelDepthMm: dimensions.modelDepthMm,
  }
}

export function parseManualBoundsWgs84(value) {
  if (!value || typeof value !== 'object') return null
  const readBound = (item) => {
    if (item === null || item === undefined || item === '') return NaN
    const number = Number(item)
    return Number.isFinite(number) ? number : NaN
  }
  const bounds = {
    south: readBound(value.south),
    north: readBound(value.north),
    west: readBound(value.west),
    east: readBound(value.east),
  }
  if (!Object.values(bounds).every(Number.isFinite)) return null
  if (bounds.south >= bounds.north || bounds.west >= bounds.east) return null
  return {
    south: Number(bounds.south.toFixed(7)),
    north: Number(bounds.north.toFixed(7)),
    west: Number(bounds.west.toFixed(7)),
    east: Number(bounds.east.toFixed(7)),
  }
}

function formatBoundInputValue(value) {
  return Number.isFinite(value) ? String(Number(value.toFixed(7))) : ''
}

export function boundsToInputValues(bounds) {
  return {
    south: formatBoundInputValue(bounds?.south),
    north: formatBoundInputValue(bounds?.north),
    west: formatBoundInputValue(bounds?.west),
    east: formatBoundInputValue(bounds?.east),
  }
}

export function normalizeManualFootprintWgs84(value) {
  if (!Array.isArray(value)) return null
  const points = value
    .map((point) => {
      const latitude = Number(point?.latitude ?? point?.lat)
      const longitude = Number(point?.longitude ?? point?.lng ?? point?.lon)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
      return {
        latitude: Number(latitude.toFixed(7)),
        longitude: Number(longitude.toFixed(7)),
      }
    })
    .filter(Boolean)
  if (points.length > 1) {
    const first = points[0]
    const last = points[points.length - 1]
    if (first.latitude === last.latitude && first.longitude === last.longitude) {
      points.pop()
    }
  }
  return points.length >= 3 ? points.slice(0, 96) : null
}

export function cloneDefaultTerrainModelOptions() {
  return {
    ...DEFAULT_OPTIONS,
    elevationBands: DEFAULT_OPTIONS.elevationBands.map((band) => ({ ...band })),
  }
}

function normalizeElevationBands(value) {
  if (!Array.isArray(value)) return cloneDefaultTerrainModelOptions().elevationBands
  const bands = value
    .map((band, index) => {
      if (!band || typeof band !== 'object') return null
      const fallback = DEFAULT_OPTIONS.elevationBands[Math.min(index, DEFAULT_OPTIONS.elevationBands.length - 1)]
      const percentile = Number(band.percentile)
      const thicknessMm = Number(band.thicknessMm)
      return {
        name: String(band.name || fallback?.name || '高度带'),
        percentile: Number.isFinite(percentile) ? Math.min(Math.max(percentile, 0), 1) : fallback?.percentile || 1,
        color: /^#[0-9a-f]{6}$/i.test(String(band.color || '')) ? String(band.color) : fallback?.color || '#D4CFC4',
        thicknessMm: Number.isFinite(thicknessMm) ? Math.max(thicknessMm, 0) : fallback?.thicknessMm || 0.5,
      }
    })
    .filter(Boolean)
  return bands.length ? bands.slice(0, 8) : cloneDefaultTerrainModelOptions().elevationBands
}

export function normalizeTerrainModelOptions(value) {
  const defaults = cloneDefaultTerrainModelOptions()
  if (!value || typeof value !== 'object') return defaults
  const next = { ...defaults }

  Object.entries(value).forEach(([key, item]) => {
    if (!(key in defaults) || key === 'elevationBands') return
    const defaultValue = defaults[key]
    if (typeof defaultValue === 'number') {
      const number = Number(item)
      next[key] = Number.isFinite(number) ? number : defaultValue
      return
    }
    if (typeof defaultValue === 'boolean') {
      next[key] = Boolean(item)
      return
    }
    if (key === 'snowlineElevationMeters') {
      const number = Number(item)
      next[key] = item === '' || item === null || item === undefined
        ? ''
        : Number.isFinite(number)
        ? number
        : ''
      return
    }
    next[key] = item === null || item === undefined ? defaultValue : String(item)
  })

  next.elevationBands = normalizeElevationBands(value.elevationBands)
  if (!TERRAIN_QUALITY_PRESETS[next.terrainQuality]) next.terrainQuality = defaults.terrainQuality
  if (!['print-readable', 'realistic', 'true-scale', 'near-real'].includes(next.reliefMode)) next.reliefMode = defaults.reliefMode
  if (!['elevation', 'satellite'].includes(next.colorMode)) next.colorMode = defaults.colorMode
  if (!SATELLITE_COLOR_STRATEGY_OPTIONS.some((item) => item.key === next.satelliteColorStrategy)) next.satelliteColorStrategy = defaults.satelliteColorStrategy
  next.satelliteTerrainColorLimit = Math.min(Math.max(Number(next.satelliteTerrainColorLimit) || 0, 0), 7)
  next.satelliteMinPatchAreaMm2 = Math.min(Math.max(Number(next.satelliteMinPatchAreaMm2) || 0, 0), 5000)
  next.satelliteColorSmoothing = Math.min(Math.max(Number(next.satelliteColorSmoothing) || 0, 0), 100)
  if (!['rectangle', 'hexagon', 'circle', 'triangle', 'custom'].includes(next.shapeType)) next.shapeType = defaults.shapeType
  return next
}

function normalizeSurfaceTextureConfig(value) {
  const sourceKey = Object.prototype.hasOwnProperty.call(SURFACE_TEXTURE_SOURCES, value?.sourceKey)
    ? value.sourceKey
    : 'esriWorldImagery'
  const quality = SURFACE_TEXTURE_QUALITY_PRESETS[value?.quality] ? value.quality : 'standard'
  return {
    enabled: Boolean(value?.enabled),
    sourceKey,
    quality,
    cesiumAssetId: String(value?.cesiumAssetId || DEFAULT_CESIUM_ION_ASSET_ID),
    cesiumUrlTemplate: String(value?.cesiumUrlTemplate || ''),
  }
}

export function normalizeTerrainModelSavedConfig(value) {
  const source = value && typeof value === 'object' ? value : {}
  const manualSource = source.manualFootprint && typeof source.manualFootprint === 'object'
    ? source.manualFootprint
    : {}
  const footprintWgs84 = normalizeManualFootprintWgs84(manualSource.footprintWgs84 || source.manualFootprintWgs84)
  const boundsWgs84 = parseManualBoundsWgs84(manualSource.boundsWgs84 || source.manualBoundsWgs84)
    || manualFootprintToBoundsWgs84(footprintWgs84)
  const shape = MANUAL_FOOTPRINT_SHAPES.some((item) => item.key === manualSource.shape)
    ? manualSource.shape
    : 'rectangle'

  return {
    version: TERRAIN_MODEL_CONFIG_VERSION,
    savedAt: typeof source.savedAt === 'string' ? source.savedAt : '',
    options: normalizeTerrainModelOptions(source.options),
    useSampledTerrain: source.useSampledTerrain === undefined ? true : Boolean(source.useSampledTerrain),
    openTopoDemType: OPENTOPOGRAPHY_DEM_TYPES[source.openTopoDemType] ? source.openTopoDemType : 'COP30',
    surfaceTexture: normalizeSurfaceTextureConfig(source.surfaceTexture),
    manualFootprint: {
      mode: manualSource.mode === 'manual' || source.terrainBoundsMode === 'manual' ? 'manual' : 'auto',
      shape,
      rotationDegrees: normalizeManualFootprintRotationDegrees(manualSource.rotationDegrees),
      boundsWgs84: boundsWgs84 ? boundsToInputValues(boundsWgs84) : { ...EMPTY_MANUAL_BOUNDS_WGS84 },
      footprintWgs84,
    },
  }
}

export function manualFootprintToBoundsWgs84(footprint) {
  const points = normalizeManualFootprintWgs84(footprint)
  if (!points) return null
  return parseManualBoundsWgs84({
    south: Math.min(...points.map((point) => point.latitude)),
    north: Math.max(...points.map((point) => point.latitude)),
    west: Math.min(...points.map((point) => point.longitude)),
    east: Math.max(...points.map((point) => point.longitude)),
  })
}

export function boundsToWgs84Polygon(bounds) {
  const parsed = parseManualBoundsWgs84(bounds)
  if (!parsed) return null
  return [
    { latitude: parsed.south, longitude: parsed.west },
    { latitude: parsed.south, longitude: parsed.east },
    { latitude: parsed.north, longitude: parsed.east },
    { latitude: parsed.north, longitude: parsed.west },
  ]
}

function getManualFootprintRotationCenter(footprint) {
  const bounds = manualFootprintToBoundsWgs84(footprint)
  if (!bounds) return null
  return {
    latitude: (bounds.south + bounds.north) / 2,
    longitude: (bounds.west + bounds.east) / 2,
  }
}

export function rotateManualFootprintWgs84(footprint, degrees, center = null) {
  const points = normalizeManualFootprintWgs84(footprint)
  const angle = normalizeManualFootprintRotationDegrees(degrees)
  if (!points || Math.abs(angle) < 0.0001) return points
  const origin = center || getManualFootprintRotationCenter(points)
  if (!origin) return points
  const cosLatitude = Math.max(0.000001, Math.cos(origin.latitude * Math.PI / 180))
  const radians = angle * Math.PI / 180
  const sin = Math.sin(radians)
  const cos = Math.cos(radians)
  return normalizeManualFootprintWgs84(points.map((point) => {
    const x = (point.longitude - origin.longitude) * cosLatitude
    const y = point.latitude - origin.latitude
    const rotatedX = x * cos - y * sin
    const rotatedY = x * sin + y * cos
    return {
      latitude: origin.latitude + rotatedY,
      longitude: origin.longitude + rotatedX / cosLatitude,
    }
  }))
}

export function createPresetFootprintPolygon(bounds, shape, rotationDegrees = 0) {
  const parsed = parseManualBoundsWgs84(bounds)
  if (!parsed) return null
  const centerLatitude = (parsed.south + parsed.north) / 2
  const centerLongitude = (parsed.west + parsed.east) / 2
  const height = parsed.north - parsed.south
  const width = parsed.east - parsed.west
  const center = { latitude: centerLatitude, longitude: centerLongitude }
  let footprint = null
  if (shape === 'triangle') {
    footprint = normalizeManualFootprintWgs84([
      { latitude: parsed.north, longitude: centerLongitude },
      { latitude: parsed.south, longitude: parsed.east },
      { latitude: parsed.south, longitude: parsed.west },
    ])
    return rotateManualFootprintWgs84(footprint, rotationDegrees, center)
  }
  if (shape === 'hexagon') {
    footprint = normalizeManualFootprintWgs84([
      { latitude: centerLatitude, longitude: parsed.west },
      { latitude: parsed.south, longitude: parsed.west + width * 0.25 },
      { latitude: parsed.south, longitude: parsed.east - width * 0.25 },
      { latitude: centerLatitude, longitude: parsed.east },
      { latitude: parsed.north, longitude: parsed.east - width * 0.25 },
      { latitude: parsed.north, longitude: parsed.west + width * 0.25 },
    ])
    return rotateManualFootprintWgs84(footprint, rotationDegrees, center)
  }
  if (height <= 0 || width <= 0) return null
  footprint = boundsToWgs84Polygon(parsed)
  return rotateManualFootprintWgs84(footprint, rotationDegrees, center)
}

export function applyManualTerrainBounds(bounds) {
  return parseManualBoundsWgs84(bounds)
}

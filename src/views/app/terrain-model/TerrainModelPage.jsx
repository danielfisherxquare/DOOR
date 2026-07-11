import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { parseGpxTrack, summarizeTrack } from '../../../utils/terrainModel/gpx'
import {
  buildTerrainModel,
  buildTerrainModelExportArchive,
  buildTerrainModelExportFiles,
  buildTerrainModelExportFile,
  buildTerrainModelExportPlan,
  evaluateTerrainModelReadiness,
  recommendHighPrecisionTerrainOptions,
  recommendModelDimensionsForTrack,
  recommendTerrainPrintStyleOptions,
  recommendTerrainReliefOptions,
  resolveVerticalScaleForReliefTarget,
  toAsciiSafeExportBaseName,
  toThreeYUpCoordinateVertex,
} from '../../../utils/terrainModel/model'
import {
  buildBufferedWgs84Bounds,
  fetchOpenTopographyGlobalAsciiGrid,
  parseArcAsciiGrid,
  sampleRasterElevations,
} from '../../../utils/terrainModel/demRaster'
import {
  buildSurfaceTextureDataUrl,
  buildSurfaceTextureTilePlan,
  createGoogleMapTilesSession,
  fetchCesiumIonRasterSourceOptions,
  getTerrainSurfaceUv,
  SURFACE_TEXTURE_SOURCES,
} from '../../../utils/terrainModel/surfaceTexture'
import { sampleArcGisTerrain } from '../../../utils/terrainModel/arcgisTerrainSampler'
import { showError, showSuccess, showWarning } from '../../../utils/toast'
import {
  ControlSection,
  formatNumber,
  getReliefModeLabel,
  normalizeReliefMode,
  PrintReadinessPanel,
  ReliefScaleMeter,
  TerrainWorkflowStrip,
} from './TerrainStatusPanels'
import DeliveryPanel from './TerrainDeliveryPanel'
import './terrain-model.css'

const DEFAULT_OPTIONS = {
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

const TERRAIN_QUALITY_PRESETS = {
  draft: { label: '草稿', rows: 36, cols: 36, smoothing: 1 },
  standard: { label: '标准', rows: 96, cols: 96, smoothing: 1 },
  high: { label: '高精度', rows: 192, cols: 192, smoothing: 0 },
  ultra: { label: '极高', rows: 320, cols: 320, smoothing: 0 },
}

const OPENTOPOGRAPHY_DEM_TYPES = {
  COP30: { label: 'Copernicus 30m', resolutionMeters: 30 },
  COP90: { label: 'Copernicus 90m', resolutionMeters: 90 },
  SRTMGL1: { label: 'SRTM 30m', resolutionMeters: 30 },
  NASADEM: { label: 'NASADEM 30m', resolutionMeters: 30 },
  AW3D30: { label: 'ALOS World 3D 30m', resolutionMeters: 30 },
}

const SURFACE_TEXTURE_QUALITY_PRESETS = {
  standard: { label: '标准', maxTextureSize: 1536, maxTiles: 12, maxTexturePixels: 2_400_000 },
  high: { label: '高清', maxTextureSize: 2048, maxTiles: 24, maxTexturePixels: 4_200_000 },
  ultra: { label: '极清', maxTextureSize: 3072, maxTiles: 48, maxTexturePixels: 9_500_000 },
}

const PREVIEW_COLOR_BAND_FACE_BUDGET = 180_000

const SATELLITE_COLOR_STRATEGY_OPTIONS = [
  { key: 'balanced', label: '平衡模式' },
  { key: 'realistic', label: '真实优先' },
  { key: 'printFirst', label: '打印优先' },
]

const OPENTOPOGRAPHY_API_KEY_STORAGE_KEY = 'door-terrain-model:opentopography-api-key'
const TERRAIN_MODEL_CONFIG_STORAGE_KEY = 'door-terrain-model:config:v1'
const TERRAIN_MODEL_CONFIG_VERSION = 1
const DEFAULT_GOOGLE_MAPS_TILE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_TILE_API_KEY || ''
const DEFAULT_CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN || ''
const DEFAULT_CESIUM_ION_ASSET_ID = import.meta.env.VITE_CESIUM_ION_IMAGERY_ASSET_ID || '2'
const EMPTY_MANUAL_BOUNDS_WGS84 = {
  south: '',
  north: '',
  west: '',
  east: '',
}
const MANUAL_FOOTPRINT_SHAPES = [
  { key: 'rectangle', label: '矩形', icon: 'crop_square' },
  { key: 'hexagon', label: '六边形', icon: 'hexagon' },
  { key: 'triangle', label: '三角形', icon: 'change_history' },
  { key: 'custom', label: '自定义', icon: 'polyline' },
]

function formatDistance(value) {
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

function formatBoundsSize(bounds) {
  const metrics = estimateWgs84BoundsMeters(bounds)
  if (!metrics) return '-'
  return `${formatDistance(metrics.widthMeters)} x ${formatDistance(metrics.depthMeters)}`
}

function formatBoundsArea(bounds) {
  const metrics = estimateWgs84BoundsMeters(bounds)
  if (!metrics) return '-'
  return metrics.areaSquareMeters >= 1_000_000
    ? `${(metrics.areaSquareMeters / 1_000_000).toFixed(2)} km2`
    : `${Math.round(metrics.areaSquareMeters)} m2`
}

function getTerrainBoundsModeLabel(mode) {
  return mode === 'manual' ? '手动框选' : '自动外扩'
}

function normalizeManualFootprintRotationDegrees(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  const normalized = ((number % 360) + 360) % 360
  const signed = normalized > 180 ? normalized - 360 : normalized
  return Number(signed.toFixed(1))
}

function buildTerrainModelOptions(points, options) {
  const dimensions = recommendModelDimensionsForTrack(points, options)
  return {
    ...options,
    modelWidthMm: dimensions.modelWidthMm,
    modelDepthMm: dimensions.modelDepthMm,
  }
}

function parseManualBoundsWgs84(value) {
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

function boundsToInputValues(bounds) {
  return {
    south: formatBoundInputValue(bounds?.south),
    north: formatBoundInputValue(bounds?.north),
    west: formatBoundInputValue(bounds?.west),
    east: formatBoundInputValue(bounds?.east),
  }
}

function normalizeManualFootprintWgs84(value) {
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

function cloneDefaultTerrainModelOptions() {
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

function normalizeTerrainModelOptions(value) {
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

function normalizeTerrainModelSavedConfig(value) {
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

function manualFootprintToBoundsWgs84(footprint) {
  const points = normalizeManualFootprintWgs84(footprint)
  if (!points) return null
  return parseManualBoundsWgs84({
    south: Math.min(...points.map((point) => point.latitude)),
    north: Math.max(...points.map((point) => point.latitude)),
    west: Math.min(...points.map((point) => point.longitude)),
    east: Math.max(...points.map((point) => point.longitude)),
  })
}

function boundsToWgs84Polygon(bounds) {
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

function rotateManualFootprintWgs84(footprint, degrees, center = null) {
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

function createPresetFootprintPolygon(bounds, shape, rotationDegrees = 0) {
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

function applyManualTerrainBounds(bounds) {
  return parseManualBoundsWgs84(bounds)
}

function toLeafletBounds(bounds) {
  if (!bounds) return null
  return L.latLngBounds([
    [bounds.south, bounds.west],
    [bounds.north, bounds.east],
  ])
}

function leafletBoundsToWgs84Bounds(bounds) {
  if (!bounds?.isValid?.()) return null
  return parseManualBoundsWgs84({
    south: bounds.getSouth(),
    north: bounds.getNorth(),
    west: bounds.getWest(),
    east: bounds.getEast(),
  })
}

function leafletLayerToWgs84Footprint(layer) {
  if (!layer) return null
  if (typeof layer.getLatLngs === 'function') {
    const latLngs = layer.getLatLngs()
    const ring = Array.isArray(latLngs?.[0]) ? latLngs[0] : latLngs
    const footprint = normalizeManualFootprintWgs84((ring || []).map((latLng) => ({
      latitude: latLng.lat,
      longitude: latLng.lng,
    })))
    if (footprint) return footprint
  }
  const bounds = leafletBoundsToWgs84Bounds(layer.getBounds?.())
  return boundsToWgs84Polygon(bounds)
}

function footprintToLeafletLatLngs(footprint) {
  const points = normalizeManualFootprintWgs84(footprint)
  return points ? points.map((point) => [point.latitude, point.longitude]) : null
}

function TerrainBoundsControlPanel({
  points,
  mode,
  bounds,
  activeManualBounds,
  manualFootprintShape,
  manualFootprintRotationDegrees = 0,
  manualFootprintVertexCount,
  manualBoundsWgs84,
  manualReady,
  paddingMeters,
  modelSizing,
  onPaddingChange,
  onAuto,
  onDrawManual,
  onUseAutoAsManual,
  onManualFootprintShapeChange,
  onManualFootprintRotationChange,
  onManualBoundChange,
}) {
  const hasTrack = points.length > 0
  const isManual = mode === 'manual'
  const hasVisibleBounds = hasTrack && Boolean(bounds)
  const statusLabel = !hasTrack
    ? '等待 GPX'
    : isManual
      ? manualReady
        ? '覆盖完整轨迹'
        : activeManualBounds
          ? '未覆盖轨迹'
          : '等待框选'
      : '覆盖完整轨迹'
  const statusTone = !hasTrack
    ? 'idle'
    : statusLabel === '覆盖完整轨迹'
      ? 'success'
      : 'warning'
  const modeDetail = isManual
    ? '成品比例按框选范围计算'
    : '成品比例按 GPX 外扩范围计算'
  const requestRangeLabel = !hasTrack
    ? '等待 GPX'
    : isManual
      ? activeManualBounds ? '手动框选范围' : '等待手动范围'
      : 'GPX + ' + formatNumber(Number(paddingMeters), ' m')
  const outputSizeLabel = hasVisibleBounds
    ? formatNumber(modelSizing.modelWidthMm, ' mm') + ' x ' + formatNumber(modelSizing.modelDepthMm, ' mm')
    : '-'

  return (
    <section className="terrain-model-bounds-panel" aria-label="地形采集范围">
      <div className="terrain-model-bounds-panel__lead">
        <div>
          <span>采集范围</span>
          <strong>{getTerrainBoundsModeLabel(mode)}</strong>
          <p>{hasTrack ? modeDetail : '上传 GPX 后可选择采样范围'}</p>
        </div>
        <div className="terrain-model-bounds-panel__mode" role="group" aria-label="采集范围模式">
          <button
            type="button"
            className={!isManual ? 'is-active' : ''}
            disabled={!hasTrack}
            aria-pressed={!isManual}
            onClick={onAuto}
          >
            <span className="material-symbols-outlined" aria-hidden="true">auto_awesome_motion</span>
            <span>自动外扩</span>
          </button>
          <button
            type="button"
            className={isManual ? 'is-active' : ''}
            disabled={!hasTrack}
            aria-pressed={isManual}
            onClick={onDrawManual}
          >
            <span className="material-symbols-outlined" aria-hidden="true">select_all</span>
            <span>{isManual ? '重画范围' : '手动调整'}</span>
          </button>
        </div>
      </div>

      <div className="terrain-model-bounds-panel__settings">
        <label className="terrain-model-bounds-panel__padding">
          <span>自动外扩</span>
          <input
            type="number"
            value={paddingMeters}
            min="0"
            max="5000"
            step="50"
            disabled={!hasTrack || isManual}
            onChange={(event) => onPaddingChange(event.target.value)}
          />
          <em>m</em>
        </label>
        {isManual && (
          <div className="terrain-model-bounds-panel__manual-actions">
            <button type="button" disabled={!hasTrack} onClick={onUseAutoAsManual}>
              <span className="material-symbols-outlined" aria-hidden="true">center_focus_strong</span>
              <span>从自动范围开始</span>
            </button>
            <button type="button" disabled={!hasTrack} onClick={onAuto}>
              <span className="material-symbols-outlined" aria-hidden="true">restart_alt</span>
              <span>回到自动</span>
            </button>
          </div>
        )}
      </div>

      {isManual && (
        <div className="terrain-model-bounds-panel__shape-row">
          <div className="terrain-model-bounds-panel__shape" role="group" aria-label="框选形状">
            {MANUAL_FOOTPRINT_SHAPES.map((shape) => (
              <button
                key={shape.key}
                type="button"
                className={manualFootprintShape === shape.key ? 'is-active' : ''}
                disabled={!hasTrack}
                aria-pressed={manualFootprintShape === shape.key}
                onClick={() => onManualFootprintShapeChange(shape.key)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">{shape.icon}</span>
                <span>{shape.label}</span>
              </button>
            ))}
          </div>
          <label className="terrain-model-bounds-panel__rotation">
            <span>框选旋转</span>
            <input
              type="range"
              value={manualFootprintRotationDegrees}
              min="-180"
              max="180"
              step="5"
              disabled={!hasTrack || manualFootprintShape === 'custom'}
              onChange={(event) => onManualFootprintRotationChange(event.target.value)}
            />
            <input
              type="number"
              value={manualFootprintRotationDegrees}
              min="-180"
              max="180"
              step="5"
              disabled={!hasTrack || manualFootprintShape === 'custom'}
              onChange={(event) => onManualFootprintRotationChange(event.target.value)}
            />
            <em>deg</em>
          </label>
        </div>
      )}

      <div className="terrain-model-bounds-panel__metrics">
        <div>
          <span>地形覆盖</span>
          <strong>{hasVisibleBounds ? formatBoundsSize(bounds) : '-'}</strong>
        </div>
        <div>
          <span>成品宽深</span>
          <strong>{outputSizeLabel}</strong>
        </div>
        <div>
          <span>采集范围状态</span>
          <strong className={'terrain-model-status terrain-model-status--' + statusTone}>{statusLabel}</strong>
        </div>
        {isManual && (
          <div>
            <span>框选顶点</span>
            <strong>{manualFootprintVertexCount ? manualFootprintVertexCount + ' 点' : '-'}</strong>
          </div>
        )}
      </div>

      <details className="terrain-model-bounds-details">
        <summary>
          <span>范围明细</span>
          <strong>{hasVisibleBounds ? formatBoundsArea(bounds) + ' / ' + requestRangeLabel : '等待轨迹'}</strong>
        </summary>
        <div className="terrain-model-bounds-panel__extra">
          <div>
            <span>采样面积</span>
            <strong>{hasVisibleBounds ? formatBoundsArea(bounds) : '-'}</strong>
          </div>
          <div>
            <span>DEM / 模型</span>
            <strong>{requestRangeLabel}</strong>
          </div>
        </div>
        <div className="terrain-model-bounds-panel__coords" aria-label="坐标范围">
          {['south', 'north', 'west', 'east'].map((key) => (
            <div key={key}>
              <span>{({ south: '南', north: '北', west: '西', east: '东' })[key]}</span>
              <strong>{bounds?.[key] !== undefined ? Number(bounds[key]).toFixed(6) : '-'}</strong>
            </div>
          ))}
        </div>
      </details>

      {isManual && (
        <details className="terrain-model-bounds-advanced">
          <summary>
            <span>高级经纬度</span>
            <strong>{activeManualBounds ? '已填写' : '未完整'}</strong>
          </summary>
          <div className="terrain-model-bounds-advanced__grid">
            <label>
              <span>南界</span>
              <input type="number" value={manualBoundsWgs84.south} step="0.0001" onChange={(event) => onManualBoundChange('south', event.target.value)} />
            </label>
            <label>
              <span>北界</span>
              <input type="number" value={manualBoundsWgs84.north} step="0.0001" onChange={(event) => onManualBoundChange('north', event.target.value)} />
            </label>
            <label>
              <span>西界</span>
              <input type="number" value={manualBoundsWgs84.west} step="0.0001" onChange={(event) => onManualBoundChange('west', event.target.value)} />
            </label>
            <label>
              <span>东界</span>
              <input type="number" value={manualBoundsWgs84.east} step="0.0001" onChange={(event) => onManualBoundChange('east', event.target.value)} />
            </label>
          </div>
        </details>
      )}
    </section>
  )
}

function formatResolution(value) {
  return Number.isFinite(value) ? '约 ' + Number(value).toFixed(1) + ' m' : '未知分辨率'
}

function readStoredOpenTopoApiKey() {
  if (typeof window === 'undefined' || !window.localStorage) return ''
  try {
    return window.localStorage.getItem(OPENTOPOGRAPHY_API_KEY_STORAGE_KEY) || ''
  } catch (error) {
    void error
    return ''
  }
}

function storeOpenTopoApiKey(apiKey) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(OPENTOPOGRAPHY_API_KEY_STORAGE_KEY, apiKey)
  } catch (error) {
    void error
  }
}

function removeStoredOpenTopoApiKey() {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.removeItem(OPENTOPOGRAPHY_API_KEY_STORAGE_KEY)
  } catch (error) {
    void error
  }
}

function readStoredTerrainModelConfig() {
  if (typeof window === 'undefined' || !window.localStorage) return normalizeTerrainModelSavedConfig(null)
  try {
    const stored = window.localStorage.getItem(TERRAIN_MODEL_CONFIG_STORAGE_KEY)
    return normalizeTerrainModelSavedConfig(stored ? JSON.parse(stored) : null)
  } catch (error) {
    void error
    return normalizeTerrainModelSavedConfig(null)
  }
}

function storeTerrainModelConfig(config) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(TERRAIN_MODEL_CONFIG_STORAGE_KEY, JSON.stringify(config))
  } catch (error) {
    void error
  }
}

function buildTerrainModelConfigSnapshot({
  options,
  useSampledTerrain,
  openTopoDemType,
  surfaceTextureEnabled,
  surfaceTextureSourceKey,
  surfaceTextureQuality,
  surfaceTextureCesiumAssetId,
  surfaceTextureCesiumUrlTemplate,
  terrainBoundsMode,
  manualFootprintShape,
  manualFootprintRotationDegrees,
  manualBoundsWgs84,
  manualFootprintWgs84,
}) {
  const config = normalizeTerrainModelSavedConfig({
    version: TERRAIN_MODEL_CONFIG_VERSION,
    options,
    useSampledTerrain,
    openTopoDemType,
    surfaceTexture: {
      enabled: surfaceTextureEnabled,
      sourceKey: surfaceTextureSourceKey,
      quality: surfaceTextureQuality,
      cesiumAssetId: surfaceTextureCesiumAssetId,
      cesiumUrlTemplate: surfaceTextureCesiumUrlTemplate,
    },
    manualFootprint: {
      mode: terrainBoundsMode,
      shape: manualFootprintShape,
      rotationDegrees: manualFootprintRotationDegrees,
      boundsWgs84: manualBoundsWgs84,
      footprintWgs84: manualFootprintWgs84,
    },
  })
  return {
    ...config,
    savedAt: new Date().toISOString(),
  }
}

function getOpenTopoStatusLabel(raster, demType) {
  const sourceName = raster?.sourceName || 'OpenTopography ' + demType
  const rows = Number.isFinite(raster?.rows) ? raster.rows : '-'
  const cols = Number.isFinite(raster?.cols) ? raster.cols : '-'
  return '已获取 ' + sourceName + ' · ' + rows + ' x ' + cols + ' · ' + formatResolution(raster?.resolutionMeters)
}

function getElevationSourceLabel(model, demRaster, useSampledTerrain) {
  if (model?.terrain?.precision?.source?.name) return model.terrain.precision.source.name
  if (demRaster) return demRaster.sourceName || '高精 DEM'
  return useSampledTerrain ? 'ArcGIS WorldElevation3D' : 'GPX 高程'
}

function getSurfaceTextureStatusLabel(surfaceTexture) {
  if (!surfaceTexture) return '等待模型'
  const zoomLabel = surfaceTexture.budgetLimited && surfaceTexture.requestedZoom
    ? 'z' + surfaceTexture.requestedZoom + '->z' + surfaceTexture.zoom
    : 'z' + surfaceTexture.zoom
  const parts = [
    surfaceTexture.source?.name || '卫星影像',
    zoomLabel,
    surfaceTexture.textureWidth + ' x ' + surfaceTexture.textureHeight,
    surfaceTexture.tileCount + ' tiles',
  ]
  if (surfaceTexture.missingTileCount) {
    parts.push('缺 ' + surfaceTexture.missingTileCount)
  }
  return parts.join(' · ')
}

function getSurfaceTextureStatusTone(surfaceTexture) {
  return surfaceTexture?.qualityWarnings?.length || surfaceTexture?.missingTileCount ? 'warning' : 'success'
}

function getSurfaceTextureSuccessMessage(surfaceTexture) {
  return surfaceTexture?.qualityWarnings?.[0] || '卫星贴图已生成'
}

function reportSurfaceTextureComplete(surfaceTexture) {
  if (getSurfaceTextureStatusTone(surfaceTexture) === 'warning') {
    showWarning(getSurfaceTextureSuccessMessage(surfaceTexture))
    return
  }
  showSuccess('卫星贴图已生成')
}

function getSurfaceTextureProgressLabel(progress) {
  const plan = progress?.plan
  if (!plan) return '生成中'
  if (progress.phase === 'plan') {
    return '计划 ' + getSurfaceTextureStatusLabel(plan)
  }
  if (progress.phase === 'loading-tile') {
    return '读取瓦片 ' + progress.completedTiles + '/' + progress.totalTiles + ' · z' + plan.zoom
  }
  if (progress.phase === 'drawn-tile') {
    return '绘制瓦片 ' + progress.completedTiles + '/' + progress.totalTiles + ' · z' + plan.zoom
  }
  if (progress.phase === 'encoding') {
    return '压缩贴图 ' + plan.textureWidth + ' x ' + plan.textureHeight
  }
  return getSurfaceTextureStatusLabel(plan)
}

function isReusableGoogleSession(sessionState, apiKey) {
  if (!sessionState?.session || sessionState.apiKey !== apiKey) return false
  const expiryTime = Date.parse(sessionState.expiry || '')
  return !Number.isFinite(expiryTime) || expiryTime > Date.now() + 60 * 1000
}

function meshToGeometry(mesh, options = {}) {
  if (!mesh?.faces?.length) return null
  const positions = []
  const colors = []
  const uvs = []
  const heightRange = mesh.vertices.reduce((range, vertex) => {
    if (!Number.isFinite(vertex?.y)) return range
    return {
      min: Math.min(range.min, vertex.y),
      max: Math.max(range.max, vertex.y),
    }
  }, { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY })
  const minY = Number.isFinite(heightRange.min) ? heightRange.min : 0
  const maxY = Number.isFinite(heightRange.max) ? heightRange.max : minY
  const color = new THREE.Color()
  mesh.faces.forEach((face) => {
    const displayFace = [face[0], face[2], face[1]]
    displayFace.forEach((index) => {
      const vertex = mesh.vertices[index]
      const displayVertex = toThreeYUpCoordinateVertex(vertex)
      positions.push(displayVertex.x, displayVertex.y, displayVertex.z)
      if (options.surfaceTextureDimensions) {
        const uv = getTerrainSurfaceUv(vertex, options.surfaceTextureDimensions)
        uvs.push(uv.u, uv.v)
      }
      if (options.vertexColors) {
        const t = maxY > minY ? (vertex.y - minY) / (maxY - minY) : 0
        if (t > 0.78) {
          color.set('#f4f1e8')
        } else if (t > 0.34) {
          color.set('#c79435')
        } else {
          color.set('#1f9f72')
        }
        colors.push(color.r, color.g, color.b)
      }
    })
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  if (uvs.length) {
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  }
  if (options.vertexColors) {
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  }
  geometry.computeVertexNormals()
  return geometry
}

function configureSurfaceTextureMap(texture) {
  if (!texture) return null
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = false
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

function loadSurfaceTextureMap(surfaceTexture) {
  if (!surfaceTexture?.imageUrl) return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      surfaceTexture.imageUrl,
      (texture) => resolve(configureSurfaceTextureMap(texture)),
      undefined,
      reject,
    )
  })
}

function splitTerrainMeshForSurfaceTexture(mesh) {
  const topFaces = []
  const sideFaces = []
  const isTopFace = (face) => face.every((index) => {
    const vertex = mesh.vertices[index]
    return Number.isFinite(vertex?.y) && vertex.y > 0
  })

  mesh.faces.forEach((face) => {
    if (isTopFace(face)) {
      topFaces.push(face)
      return
    }
    sideFaces.push(face)
  })

  return {
    topMesh: { ...mesh, name: mesh.name + '-top', faces: topFaces },
    sideMesh: { ...mesh, name: mesh.name + '-sides', faces: sideFaces },
  }
}

function disposeMaterial(material) {
  if (!material) return
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial)
    return
  }
  if (material.map) material.map.dispose()
  material.dispose()
}

function createModelGroup(model, { surfaceTextureMap = null } = {}) {
  const group = new THREE.Group()
  group.userData.coordinateSystem = {
    type: 'three-y-up-right-handed',
    xAxis: 'east',
    yAxis: 'up',
    zAxis: 'south',
    internalSource: {
      xAxis: 'east',
      yAxis: 'up',
      zAxis: 'north',
    },
  }
  const baseGeometry = meshToGeometry(model.meshes.base)
  if (baseGeometry) {
    group.add(new THREE.Mesh(
      baseGeometry,
      new THREE.MeshStandardMaterial({ color: '#171717', roughness: 0.64, metalness: 0.02 }),
    ))
  }
  if (surfaceTextureMap) {
    const { topMesh, sideMesh } = splitTerrainMeshForSurfaceTexture(model.meshes.terrain)
    const terrainSideGeometry = meshToGeometry(sideMesh)
    if (terrainSideGeometry) {
      const terrainSideMaterial = new THREE.MeshStandardMaterial({
        color: '#5c6252',
        roughness: 0.88,
        metalness: 0.02,
        side: THREE.DoubleSide,
      })
      group.add(new THREE.Mesh(terrainSideGeometry, terrainSideMaterial))
    }
    const terrainTopGeometry = meshToGeometry(topMesh, {
      surfaceTextureDimensions: model.stats,
    })
    if (terrainTopGeometry) {
      group.add(new THREE.Mesh(
        terrainTopGeometry,
        new THREE.MeshStandardMaterial({
          map: surfaceTextureMap,
          roughness: 0.9,
          metalness: 0.02,
          side: THREE.DoubleSide,
        }),
      ))
    }
  } else {
    const terrainGeometry = meshToGeometry(model.meshes.terrain, {
      vertexColors: true,
    })
    if (terrainGeometry) {
      group.add(new THREE.Mesh(
        terrainGeometry,
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.9,
          metalness: 0.02,
          side: THREE.DoubleSide,
        }),
      ))
    }
  }
  const lowlandGeometry = meshToGeometry(model.meshes.lowland)
  if (lowlandGeometry) {
    group.add(new THREE.Mesh(
      lowlandGeometry,
      new THREE.MeshStandardMaterial({
        color: '#1f9f72',
        roughness: 0.76,
        metalness: 0.02,
        side: THREE.DoubleSide,
      }),
    ))
  }
  // Export keeps the full printable colour shells; the preview avoids
  // rebuilding oversized shells synchronously when a texture already shows them.
  const hasPreviewElevationBands = Boolean(model.meshes.elevationBands?.length)
  const previewColorBandFaceCount = [
    ...(model.meshes.elevationBands || []),
    ...(model.meshes.satelliteBands || []),
  ].reduce((total, mesh) => total + (mesh?.faces?.length || 0), 0)
  const renderPrintableColorBands = hasPreviewElevationBands
    || (previewColorBandFaceCount <= PREVIEW_COLOR_BAND_FACE_BUDGET
      && !(surfaceTextureMap && model.colorBands?.mode === 'satellite'))
  const bandMeshes = renderPrintableColorBands
    ? (model.meshes.elevationBands?.length
      ? model.meshes.elevationBands
      : model.meshes.satelliteBands?.length
        ? model.meshes.satelliteBands
        : [])
    : []
  const bandColorInfo = model.colorBands?.elevationBands?.bands
    || model.colorBands?.satelliteBands?.bands
    || []
  bandMeshes.forEach((bandMesh, index) => {
    if (!bandMesh?.faces?.length) return
    const geometry = meshToGeometry(bandMesh)
    if (!geometry) return
    const color = bandColorInfo[index]?.displayColor || '#808080'
    group.add(new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.76,
        metalness: 0.02,
        side: THREE.DoubleSide,
      }),
    ))
  })
  const contourGeometry = meshToGeometry(model.meshes.contours)
  if (contourGeometry) {
    group.add(new THREE.Mesh(
      contourGeometry,
      new THREE.MeshStandardMaterial({
        color: '#f5f5f4',
        roughness: 0.72,
        metalness: 0.02,
      }),
    ))
  }
  const snowlineGeometry = meshToGeometry(model.meshes.snowline)
  if (snowlineGeometry) {
    group.add(new THREE.Mesh(
      snowlineGeometry,
      new THREE.MeshStandardMaterial({
        color: '#f5f5f4',
        roughness: 0.7,
        metalness: 0.02,
      }),
    ))
  }
  const snowGeometry = meshToGeometry(model.meshes.snow)
  if (snowGeometry) {
    group.add(new THREE.Mesh(
      snowGeometry,
      new THREE.MeshStandardMaterial({
        color: '#f5f5f4',
        roughness: 0.74,
        metalness: 0.02,
      }),
    ))
  }
  const trackGeometry = meshToGeometry(model.meshes.track)
  if (trackGeometry) {
    const trackMesh = new THREE.Mesh(
      trackGeometry,
      new THREE.MeshStandardMaterial({
        color: '#d63b2e',
        roughness: 0.48,
        metalness: 0.02,
      }),
    )
    trackMesh.name = 'track-red'
    group.add(trackMesh)
  }
  const labelGeometry = meshToGeometry(model.meshes.text)
  if (labelGeometry) {
    group.add(new THREE.Mesh(
      labelGeometry,
      new THREE.MeshStandardMaterial({ color: '#f5f5f4', roughness: 0.58, metalness: 0.02 }),
    ))
  }
  return group
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1200)
}

function downloadTextFile(file) {
  downloadBlob(new Blob([file.content], { type: file.mimeType }), file.name)
}

function TerrainRouteMap({
  points,
  terrainBounds,
  terrainBoundsMode = 'auto',
  manualFootprintWgs84,
  manualFootprintShape = 'rectangle',
  manualFootprintRotationDegrees = 0,
  manualDrawRequest = 0,
  onBoundsModeChange,
  onManualFootprintChange,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const lastManualDrawRequestRef = useRef(0)
  const [drawingBounds, setDrawingBounds] = useState(false)

  const startManualBoundsDraw = useCallback(() => {
    if (!points.length) return
    onBoundsModeChange?.('manual')
    setDrawingBounds(true)
  }, [onBoundsModeChange, points.length])

  useEffect(() => {
    if (!manualDrawRequest || manualDrawRequest === lastManualDrawRequestRef.current) return
    lastManualDrawRequestRef.current = manualDrawRequest
    startManualBoundsDraw()
  }, [manualDrawRequest, startManualBoundsDraw])

  useEffect(() => {
    if (!containerRef.current) return undefined
    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
      })
      L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(mapRef.current)
    }
    return undefined
  }, [])

  useEffect(() => {
    if (terrainBoundsMode !== 'manual') {
      setDrawingBounds(false)
    }
  }, [terrainBoundsMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !points.length) return undefined
    const layerGroup = L.layerGroup().addTo(map)
    const latLngs = points.map((point) => [point.latitude, point.longitude])
    const terrainLatLngBounds = toLeafletBounds(terrainBounds)
    const manualFootprintLatLngs = terrainBoundsMode === 'manual'
      ? footprintToLeafletLatLngs(manualFootprintWgs84)
      : null
    const isCustomFootprint = manualFootprintShape === 'custom'
    let cleanupManualLayer = () => {}
    if (manualFootprintLatLngs?.length || terrainLatLngBounds?.isValid()) {
      const terrainLayer = manualFootprintLatLngs?.length
        ? L.polygon(manualFootprintLatLngs, {
          color: '#2563eb',
          weight: 2,
          opacity: 0.8,
          fillColor: '#2563eb',
          fillOpacity: 0.1,
          dashArray: '9 5',
        })
        : L.rectangle(terrainLatLngBounds, {
        color: terrainBoundsMode === 'manual' ? '#2563eb' : '#0f766e',
        weight: 2,
        opacity: 0.75,
        fillColor: terrainBoundsMode === 'manual' ? '#2563eb' : '#0f766e',
        fillOpacity: 0.08,
        dashArray: terrainBoundsMode === 'manual' ? '9 5' : '6 6',
      })
      terrainLayer.addTo(layerGroup)
      if (terrainBoundsMode === 'manual' && terrainLayer.pm && onManualFootprintChange) {
        const handleLayerChanged = () => {
          const nextFootprint = leafletLayerToWgs84Footprint(terrainLayer)
          if (nextFootprint) onManualFootprintChange(nextFootprint, manualFootprintShape)
        }
        const manualEditOptions = {
          snappable: false,
          allowSelfIntersection: false,
          allowEditing: isCustomFootprint,
          allowScale: true,
          uniformScaling: true,
          centerScaling: true,
          addVertexOnClick: isCustomFootprint,
          preventMarkerRemoval: !isCustomFootprint,
        }
        try {
          terrainLayer.pm.setOptions?.(manualEditOptions)
          // 自定义多边形保留顶点编辑；预设形状只给拖动和等比缩放手柄，避免被改成随机形状。
          if (isCustomFootprint) {
            terrainLayer.pm.enable(manualEditOptions)
          }
          terrainLayer.pm.enableScale?.()
          terrainLayer.pm.enableLayerDrag?.()
          terrainLayer.on('pm:edit', handleLayerChanged)
          terrainLayer.on('pm:scaleend', handleLayerChanged)
          terrainLayer.on('pm:dragend', handleLayerChanged)
          cleanupManualLayer = () => {
            terrainLayer.off('pm:edit', handleLayerChanged)
            terrainLayer.off('pm:scaleend', handleLayerChanged)
            terrainLayer.off('pm:dragend', handleLayerChanged)
            terrainLayer.pm.disableScale?.()
            terrainLayer.pm.disableLayerDrag?.()
            terrainLayer.pm.disable?.()
          }
        } catch (error) {
          console.warn('[TerrainRouteMap] Failed to enable manual bounds editing', error)
        }
      }
    }
    L.polyline(latLngs, {
      color: '#d63b2e',
      weight: 4,
      opacity: 0.92,
    }).addTo(layerGroup)
    L.circleMarker(latLngs[0], {
      radius: 5,
      color: '#0f766e',
      fillColor: '#0f766e',
      fillOpacity: 1,
    }).addTo(layerGroup)
    L.circleMarker(latLngs[latLngs.length - 1], {
      radius: 5,
      color: '#b91c1c',
      fillColor: '#b91c1c',
      fillOpacity: 1,
    }).addTo(layerGroup)
    const routeBounds = L.latLngBounds(latLngs)
    const footprintBounds = manualFootprintLatLngs?.length ? L.latLngBounds(manualFootprintLatLngs) : null
    const fitBounds = footprintBounds?.isValid()
      ? L.latLngBounds(footprintBounds.getSouthWest(), footprintBounds.getNorthEast()).extend(routeBounds)
      : terrainLatLngBounds?.isValid()
      ? L.latLngBounds(terrainLatLngBounds.getSouthWest(), terrainLatLngBounds.getNorthEast()).extend(routeBounds)
      : routeBounds
    map.fitBounds(fitBounds, { padding: [24, 24], animate: false })
    return () => {
      cleanupManualLayer()
      layerGroup.remove()
    }
  }, [manualFootprintShape, manualFootprintWgs84, onManualFootprintChange, points, terrainBounds, terrainBoundsMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !drawingBounds || !points.length || !onManualFootprintChange || !map.pm) return undefined

    const container = map.getContainer()
    const drawStyle = {
      color: '#2563eb',
      weight: 2,
      opacity: 0.92,
      fillColor: '#2563eb',
      fillOpacity: 0.12,
      dashArray: '3 3',
    }

    const handleCreate = (event) => {
      const layer = event.layer
      const drawnBounds = leafletBoundsToWgs84Bounds(layer?.getBounds?.())
      const footprint = manualFootprintShape !== 'custom' && drawnBounds
        ? createPresetFootprintPolygon(drawnBounds, manualFootprintShape, manualFootprintRotationDegrees)
        : leafletLayerToWgs84Footprint(layer)
      if (layer) map.removeLayer(layer)
      setDrawingBounds(false)
      const bounds = manualFootprintToBoundsWgs84(footprint)
      if (!footprint || !bounds) return
      const spanLat = Math.abs(bounds.north - bounds.south)
      const spanLon = Math.abs(bounds.east - bounds.west)
      if (spanLat < 0.00001 || spanLon < 0.00001) return
      onManualFootprintChange(footprint, manualFootprintShape)
    }
    const handleDrawEnd = () => {
      setDrawingBounds(false)
    }
    const handleManualFootprintContextUndo = (event) => {
      const originalEvent = event.originalEvent || event
      originalEvent?.preventDefault?.()
      originalEvent?.stopPropagation?.()
      try {
        map.pm?.Draw?.Polygon?._removeLastVertex?.()
      } catch (error) {
        console.warn('[TerrainRouteMap] Failed to undo the last manual footprint vertex', error)
      }
    }

    map.dragging.disable()
    container.classList.add('terrain-model-map--drawing')
    map.on('pm:create', handleCreate)
    map.on('pm:drawend', handleDrawEnd)
    const drawType = manualFootprintShape === 'custom' ? 'Polygon' : 'Rectangle'
    const drawOptions = {
      snappable: false,
      continueDrawing: false,
      tooltips: false,
      pathOptions: drawStyle,
    }
    if (drawType === 'Polygon') {
      map.on('contextmenu', handleManualFootprintContextUndo)
      container.addEventListener('contextmenu', handleManualFootprintContextUndo, true)
      map.pm.enableDraw('Polygon', drawOptions)
    } else {
      map.pm.enableDraw('Rectangle', drawOptions)
    }

    return () => {
      map.off('pm:create', handleCreate)
      map.off('pm:drawend', handleDrawEnd)
      map.off('contextmenu', handleManualFootprintContextUndo)
      container.removeEventListener('contextmenu', handleManualFootprintContextUndo, true)
      map.pm.disableDraw(drawType)
      map.dragging.enable()
      container.classList.remove('terrain-model-map--drawing')
    }
  }, [drawingBounds, manualFootprintRotationDegrees, manualFootprintShape, onManualFootprintChange, points.length])

  return (
    <div className={'terrain-model-map-frame' + (drawingBounds ? ' terrain-model-map-frame--drawing' : '')}>
      <div ref={containerRef} className="terrain-model-map" aria-label="轨迹地图预览" />
      {drawingBounds && (
        <div className="terrain-model-map-status terrain-model-map-status--drawing" aria-hidden="true">
          <span className="material-symbols-outlined">select_all</span>
          <strong>正在框选范围</strong>
        </div>
      )}
      {terrainBounds && (
        <div className="terrain-model-map-legend" aria-hidden="true">
          <span className="terrain-model-map-legend__bounds" />
          <strong>{terrainBoundsMode === 'manual' ? '手动采集范围' : '地形采集范围'}</strong>
        </div>
      )}
    </div>
  )
}

function TerrainPreview({ model, surfaceTexture }) {
  const canvasHostRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const [previewError, setPreviewError] = useState(null)

  const setCameraView = useCallback((view) => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls || !model) return

    const modelSize = Math.max(model.stats.modelWidthMm, model.stats.modelDepthMm, model.stats.maxHeightMm)
    const targetY = model.stats.maxHeightMm * 0.32
    const positions = {
      reset: [modelSize * 0.82, modelSize * 0.62, modelSize * 1.12],
      overhead: [modelSize * 0.08, modelSize * 1.42, modelSize * 0.38],
      front: [0, modelSize * 0.48, modelSize * 1.36],
      east: [modelSize * 1.36, modelSize * 0.48, 0],
    }
    const nextPosition = positions[view] || positions.reset
    camera.up.set(0, 1, 0)
    controls.target.set(0, targetY, 0)
    camera.position.set(...nextPosition)
    camera.lookAt(controls.target)
    camera.updateProjectionMatrix()
    controls.update()
  }, [model])

  useEffect(() => {
    if (!canvasHostRef.current) return undefined
    if (!model) {
      setPreviewError(null)
      canvasHostRef.current.replaceChildren()
      cameraRef.current = null
      controlsRef.current = null
      return undefined
    }
    const container = canvasHostRef.current
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch (error) {
      void error
      setPreviewError('WebGL 预览不可用')
      container.replaceChildren()
      return undefined
    }
    setPreviewError(null)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0xf7f5ef, 1)
    container.replaceChildren(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#f7f5ef')
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1200)
    camera.up.set(0, 1, 0)
    const controls = new OrbitControls(camera, renderer.domElement)
    cameraRef.current = camera
    controlsRef.current = controls
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.rotateSpeed = 0.72
    controls.zoomSpeed = 0.86
    controls.panSpeed = 0.72
    controls.enablePan = true
    controls.screenSpacePanning = true
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    }
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    }
    controls.target.set(0, model.stats.maxHeightMm * 0.32, 0)
    scene.add(new THREE.HemisphereLight('#ffffff', '#c7b99c', 1.8))
    const sun = new THREE.DirectionalLight('#ffffff', 2.2)
    sun.position.set(120, 160, 100)
    scene.add(sun)

    // Invalidate-driven rendering: instead of an unconditional rAF loop (which
    // pegged the GPU/main thread forever — catastrophic with a large satellite
    // texture + high-poly mesh), we only draw when something changes. Crucially,
    // each change schedules a short BURST of frames rather than a single frame,
    // so the new model/texture is guaranteed to paint even across the async
    // texture load and React effect re-runs (a single missed frame would
    // otherwise leave the previous model frozen on screen). When nothing is
    // changing and the camera has settled, the loop stops (0 idle frames).
    let running = true
    let rafId = null
    let pendingFrames = 0
    const loop = () => {
      rafId = null
      if (!running) return
      let cameraMoving = false
      try {
        cameraMoving = controls.update()
        renderer.render(scene, camera)
      } catch (error) {
        void error
        running = false
        setPreviewError('WebGL 预览不可用')
        container.replaceChildren()
        return
      }
      if (pendingFrames > 0) pendingFrames -= 1
      if (cameraMoving || pendingFrames > 0) {
        rafId = window.requestAnimationFrame(loop)
      }
    }
    const invalidate = (frames = 12) => {
      if (!running) return
      if (frames > pendingFrames) pendingFrames = frames
      if (rafId === null) rafId = window.requestAnimationFrame(loop)
    }
    // Interaction emits 'change'; a couple of frames + damping keep it smooth.
    const handleControlsChange = () => invalidate(2)
    controls.addEventListener('change', handleControlsChange)

    let modelGroup = null
    loadSurfaceTextureMap(surfaceTexture)
      .catch((error) => {
        void error
        setPreviewError('卫星贴图加载失败，已使用高度色带')
        return null
      })
      .then((surfaceTextureMap) => {
        if (!running) {
          if (surfaceTextureMap) surfaceTextureMap.dispose()
          return
        }
        modelGroup = createModelGroup(model, { surfaceTextureMap })
        scene.add(modelGroup)
        invalidate()
      })

    const modelSize = Math.max(model.stats.modelWidthMm, model.stats.modelDepthMm, model.stats.maxHeightMm)
    controls.minDistance = modelSize * 0.34
    controls.maxDistance = modelSize * 4.8
    controls.minPolarAngle = 0.1
    controls.maxPolarAngle = Math.PI * 0.49
    camera.position.set(modelSize * 0.82, modelSize * 0.62, modelSize * 1.12)
    camera.near = 0.1
    camera.far = modelSize * 12
    camera.lookAt(controls.target)
    camera.updateProjectionMatrix()

    const resize = () => {
      const rect = container.getBoundingClientRect()
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false)
      camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height)
      camera.updateProjectionMatrix()
      invalidate(2)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    invalidate()

    return () => {
      running = false
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      controls.removeEventListener('change', handleControlsChange)
      observer.disconnect()
      controls.dispose()
      renderer.dispose()
      cameraRef.current = null
      controlsRef.current = null
      scene.traverse((item) => {
        if (item.geometry) item.geometry.dispose()
        if (item.material) disposeMaterial(item.material)
      })
      container.replaceChildren()
    }
  }, [model, surfaceTexture])

  return (
    <div className="terrain-model-preview">
      <div className="terrain-model-preview__canvas" ref={canvasHostRef} />
      {model && !previewError && (
        <div className="terrain-model-preview__orientation" aria-label="预览方向">
          <span className="terrain-model-preview__orientation-north">北</span>
          <span className="terrain-model-preview__orientation-east">东</span>
        </div>
      )}
      {model && !previewError && (
        <div className="terrain-model-preview__camera" aria-label="预览视角">
          <button type="button" aria-label="重置视角" title="重置视角" onClick={() => setCameraView('reset')}>
            <span className="material-symbols-outlined" aria-hidden="true">home</span>
            <span>重置</span>
          </button>
          <button type="button" aria-label="俯视" title="俯视" onClick={() => setCameraView('overhead')}>
            <span className="material-symbols-outlined" aria-hidden="true">vertical_align_top</span>
            <span>俯视</span>
          </button>
          <button type="button" aria-label="正面" title="正面" onClick={() => setCameraView('front')}>
            <span className="material-symbols-outlined" aria-hidden="true">flip_to_front</span>
            <span>正面</span>
          </button>
          <button type="button" aria-label="东侧" title="东侧" onClick={() => setCameraView('east')}>
            <span className="material-symbols-outlined" aria-hidden="true">east</span>
            <span>东侧</span>
          </button>
        </div>
      )}
      {!model && <div className="terrain-model-preview__empty">等待生成</div>}
      {model && previewError && (
        <div className="terrain-model-preview__empty terrain-model-preview__empty--error">
          <strong>{previewError}</strong>
          <span>当前浏览器无法创建 3D 画布，导出文件不受影响。</span>
        </div>
      )}
    </div>
  )
}

export default function TerrainModelPage() {
  const [track, setTrack] = useState(null)
  const [model, setModel] = useState(null)
  const [storedTerrainModelConfig] = useState(readStoredTerrainModelConfig)
  const [options, setOptions] = useState(() => storedTerrainModelConfig.options)
  const [useSampledTerrain, setUseSampledTerrain] = useState(storedTerrainModelConfig.useSampledTerrain)
  const [demRaster, setDemRaster] = useState(null)
  const [demFileName, setDemFileName] = useState('')
  const [storedOpenTopoApiKey] = useState(readStoredOpenTopoApiKey)
  const [openTopoApiKey, setOpenTopoApiKey] = useState(storedOpenTopoApiKey)
  const [rememberOpenTopoApiKey, setRememberOpenTopoApiKey] = useState(Boolean(storedOpenTopoApiKey))
  const [openTopoDemType, setOpenTopoDemType] = useState(storedTerrainModelConfig.openTopoDemType)
  const [openTopoStatus, setOpenTopoStatus] = useState({ tone: 'idle', label: '等待 GPX' })
  const [fetchingOpenTopo, setFetchingOpenTopo] = useState(false)
  const [surfaceTextureEnabled, setSurfaceTextureEnabled] = useState(storedTerrainModelConfig.surfaceTexture.enabled)
  const [surfaceTextureSourceKey, setSurfaceTextureSourceKey] = useState(storedTerrainModelConfig.surfaceTexture.sourceKey)
  const [surfaceTextureQuality, setSurfaceTextureQuality] = useState(storedTerrainModelConfig.surfaceTexture.quality)
  const [surfaceTextureGoogleApiKey, setSurfaceTextureGoogleApiKey] = useState(DEFAULT_GOOGLE_MAPS_TILE_API_KEY)
  const [surfaceTextureGoogleSession, setSurfaceTextureGoogleSession] = useState(null)
  const [surfaceTextureCesiumAccessToken, setSurfaceTextureCesiumAccessToken] = useState(DEFAULT_CESIUM_ION_TOKEN)
  const [surfaceTextureCesiumAssetId, setSurfaceTextureCesiumAssetId] = useState(storedTerrainModelConfig.surfaceTexture.cesiumAssetId)
  const [surfaceTextureCesiumUrlTemplate, setSurfaceTextureCesiumUrlTemplate] = useState(storedTerrainModelConfig.surfaceTexture.cesiumUrlTemplate)
  const [surfaceTexture, setSurfaceTexture] = useState(null)
  const [surfaceTextureStatus, setSurfaceTextureStatus] = useState({ tone: 'idle', label: '等待模型' })
  const [buildingSurfaceTexture, setBuildingSurfaceTexture] = useState(false)
  const [building, setBuilding] = useState(false)
  const [exportingGlb, setExportingGlb] = useState(false)
  const [exportingFiles, setExportingFiles] = useState(false)
  const exportingFilesRef = useRef(false)
  const [fileName, setFileName] = useState('')
  const [terrainBoundsMode, setTerrainBoundsMode] = useState(storedTerrainModelConfig.manualFootprint.mode)
  const [manualDrawRequest, setManualDrawRequest] = useState(0)
  const [manualFootprintShape, setManualFootprintShape] = useState(storedTerrainModelConfig.manualFootprint.shape)
  const [manualFootprintRotationDegrees, setManualFootprintRotationDegrees] = useState(storedTerrainModelConfig.manualFootprint.rotationDegrees)
  const [manualFootprintWgs84, setManualFootprintWgs84] = useState(storedTerrainModelConfig.manualFootprint.footprintWgs84)
  const [manualBoundsWgs84, setManualBoundsWgs84] = useState(storedTerrainModelConfig.manualFootprint.boundsWgs84)
  const summary = useMemo(() => track ? summarizeTrack(track.points) : null, [track])
  const rawExportBaseName = useMemo(() => (
    fileName.replace(/\.gpx$/i, '') || track?.name || 'door-terrain-model'
  ), [fileName, track?.name])
  const exportBaseName = useMemo(() => toAsciiSafeExportBaseName(rawExportBaseName), [rawExportBaseName])
  const parsedManualBoundsWgs84 = useMemo(() => (
    parseManualBoundsWgs84(manualBoundsWgs84)
  ), [manualBoundsWgs84])
  const activeManualFootprintWgs84 = useMemo(() => (
    terrainBoundsMode === 'manual' ? normalizeManualFootprintWgs84(manualFootprintWgs84) : null
  ), [manualFootprintWgs84, terrainBoundsMode])
  const activeTerrainBoundsWgs84 = terrainBoundsMode === 'manual' ? parsedManualBoundsWgs84 : null
  const manualTerrainBoundsReady = useMemo(() => (
    terrainBoundsMode !== 'manual'
      || Boolean(activeTerrainBoundsWgs84)
  ), [activeTerrainBoundsWgs84, terrainBoundsMode])
  const autoTerrainBounds = useMemo(() => (
    track?.points?.length
      ? buildBufferedWgs84Bounds(track.points, { paddingMeters: options.paddingMeters })
      : null
  ), [options.paddingMeters, track])
  const terrainBounds = useMemo(() => (
    terrainBoundsMode === 'manual' ? activeTerrainBoundsWgs84 : autoTerrainBounds
  ), [activeTerrainBoundsWgs84, autoTerrainBounds, terrainBoundsMode])
  const terrainOptions = useMemo(() => ({
    ...options,
    terrainBoundsWgs84: activeTerrainBoundsWgs84,
    terrainFootprintWgs84: activeManualFootprintWgs84,
    terrainFootprintRotationDegrees: terrainBoundsMode === 'manual' ? manualFootprintRotationDegrees : 0,
  }), [activeManualFootprintWgs84, activeTerrainBoundsWgs84, manualFootprintRotationDegrees, options, terrainBoundsMode])
  const modelSizing = useMemo(() => (
    track?.points?.length
      ? recommendModelDimensionsForTrack(track.points, terrainOptions)
      : {
        modelWidthMm: options.modelWidthMm,
        modelDepthMm: options.modelDepthMm,
        longSideMm: options.modelLongSideMm,
        aspectRatio: options.modelWidthMm / Math.max(options.modelDepthMm, 1),
        widthMeters: null,
        depthMeters: null,
        paddingMeters: options.paddingMeters,
      }
  ), [options, terrainOptions, track])
  const generationOptions = useMemo(() => (
    track?.points?.length ? buildTerrainModelOptions(track.points, terrainOptions) : terrainOptions
  ), [terrainOptions, track])
  // Options shared between the lightweight export plan (rendered eagerly) and
  // the heavy file materialization (only on an explicit download click).
  const exportOptions = useMemo(() => ({
    baseName: rawExportBaseName,
    surfaceTexture: surfaceTextureEnabled ? surfaceTexture : null,
  }), [rawExportBaseName, surfaceTexture, surfaceTextureEnabled])
  // Build only file descriptors + manifest here (~30ms even at ultra grids).
  // Serializing the actual STL/3MF content used to run on every model/texture
  // change inside this memo and blocked the main thread for seconds — that work
  // now happens lazily in the download handlers via buildTerrainModelExportFile
  // / buildTerrainModelExportFiles.
  const exportPlan = useMemo(() => (
    model ? buildTerrainModelExportPlan(model, exportOptions) : null
  ), [model, exportOptions])
  const exportFiles = exportPlan?.files || []
  const printReadiness = useMemo(() => (
    model ? evaluateTerrainModelReadiness(model) : null
  ), [model])
  const reliefRecommendation = useMemo(() => (
    track?.points?.length ? recommendTerrainReliefOptions(track.points, generationOptions) : null
  ), [generationOptions, track])
  const printRecommendation = reliefRecommendation?.printReadable || null
  const activeReliefRecommendation = reliefRecommendation?.active || null
  const highPrecisionRecommendation = useMemo(() => (
    track?.points?.length
      ? recommendHighPrecisionTerrainOptions(track.points, generationOptions, demRaster || {
        sourceName: useSampledTerrain ? 'ArcGIS WorldElevation3D Terrain3D' : 'GPX 高程',
      })
      : null
  ), [demRaster, generationOptions, track, useSampledTerrain])
  const elevationSourceLabel = useMemo(
    () => getElevationSourceLabel(model, demRaster, useSampledTerrain),
    [demRaster, model, useSampledTerrain],
  )
  const exportBlockedBySurfaceTexture = surfaceTextureEnabled && (!surfaceTexture || buildingSurfaceTexture)

  useEffect(() => {
    const apiKey = openTopoApiKey.trim()
    if (rememberOpenTopoApiKey && apiKey) {
      storeOpenTopoApiKey(apiKey)
      return
    }
    removeStoredOpenTopoApiKey()
  }, [openTopoApiKey, rememberOpenTopoApiKey])

  useEffect(() => {
    storeTerrainModelConfig(buildTerrainModelConfigSnapshot({
      options,
      useSampledTerrain,
      openTopoDemType,
      surfaceTextureEnabled,
      surfaceTextureSourceKey,
      surfaceTextureQuality,
      surfaceTextureCesiumAssetId,
      surfaceTextureCesiumUrlTemplate,
      terrainBoundsMode,
      manualFootprintShape,
      manualFootprintRotationDegrees,
      manualBoundsWgs84,
      manualFootprintWgs84,
    }))
  }, [
    manualBoundsWgs84,
    manualFootprintRotationDegrees,
    manualFootprintShape,
    manualFootprintWgs84,
    openTopoDemType,
    options,
    surfaceTextureCesiumAssetId,
    surfaceTextureCesiumUrlTemplate,
    surfaceTextureEnabled,
    surfaceTextureQuality,
    surfaceTextureSourceKey,
    terrainBoundsMode,
    useSampledTerrain,
  ])

  const resetGeneratedOutputs = useCallback(() => {
    setModel(null)
    setSurfaceTexture(null)
    setSurfaceTextureStatus({ tone: 'idle', label: '等待模型' })
  }, [])

  const applyTerrainModelConfig = useCallback((config) => {
    const nextConfig = normalizeTerrainModelSavedConfig(config)
    setOptions(nextConfig.options)
    setUseSampledTerrain(nextConfig.useSampledTerrain)
    setOpenTopoDemType(nextConfig.openTopoDemType)
    setSurfaceTextureEnabled(nextConfig.surfaceTexture.enabled)
    setSurfaceTextureSourceKey(nextConfig.surfaceTexture.sourceKey)
    setSurfaceTextureQuality(nextConfig.surfaceTexture.quality)
    setSurfaceTextureCesiumAssetId(nextConfig.surfaceTexture.cesiumAssetId)
    setSurfaceTextureCesiumUrlTemplate(nextConfig.surfaceTexture.cesiumUrlTemplate)
    setTerrainBoundsMode(nextConfig.manualFootprint.mode)
    setManualFootprintShape(nextConfig.manualFootprint.shape)
    setManualFootprintRotationDegrees(nextConfig.manualFootprint.rotationDegrees)
    setManualFootprintWgs84(nextConfig.manualFootprint.footprintWgs84)
    setManualBoundsWgs84(nextConfig.manualFootprint.boundsWgs84)
    setSurfaceTextureGoogleSession(null)
    setOpenTopoStatus({ tone: 'idle', label: nextConfig.manualFootprint.mode === 'manual' ? '等待获取' : '等待 GPX' })
    resetGeneratedOutputs()
  }, [resetGeneratedOutputs])

  const handleExportConfig = useCallback(() => {
    const config = buildTerrainModelConfigSnapshot({
      options,
      useSampledTerrain,
      openTopoDemType,
      surfaceTextureEnabled,
      surfaceTextureSourceKey,
      surfaceTextureQuality,
      surfaceTextureCesiumAssetId,
      surfaceTextureCesiumUrlTemplate,
      terrainBoundsMode,
      manualFootprintShape,
      manualFootprintRotationDegrees,
      manualBoundsWgs84,
      manualFootprintWgs84,
    })
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    downloadBlob(blob, exportBaseName + '-terrain-config.json')
    showSuccess('配置已导出')
  }, [
    exportBaseName,
    manualBoundsWgs84,
    manualFootprintRotationDegrees,
    manualFootprintShape,
    manualFootprintWgs84,
    openTopoDemType,
    options,
    surfaceTextureCesiumAssetId,
    surfaceTextureCesiumUrlTemplate,
    surfaceTextureEnabled,
    surfaceTextureQuality,
    surfaceTextureSourceKey,
    terrainBoundsMode,
    useSampledTerrain,
  ])

  const handleImportConfigFile = useCallback(async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const imported = JSON.parse(await file.text())
      applyTerrainModelConfig(imported)
      storeTerrainModelConfig(normalizeTerrainModelSavedConfig(imported))
      showSuccess('配置已导入')
    } catch (error) {
      showError(error.message || '配置导入失败')
    } finally {
      event.target.value = ''
    }
  }, [applyTerrainModelConfig])

  const updateUseSampledTerrain = useCallback((value) => {
    resetGeneratedOutputs()
    setUseSampledTerrain(Boolean(value))
  }, [resetGeneratedOutputs])

  const updateTerrainBoundsMode = useCallback((value) => {
    const nextMode = value === 'manual' ? 'manual' : 'auto'
    setTerrainBoundsMode(nextMode)
    resetGeneratedOutputs()
    setOpenTopoStatus({ tone: 'idle', label: '等待获取' })
  }, [resetGeneratedOutputs])

  const startManualTerrainBoundsDraw = useCallback(() => {
    if (!track?.points?.length) {
      showError('请先上传 GPX')
      return
    }
    const baseBounds = activeTerrainBoundsWgs84 || autoTerrainBounds
    if (!baseBounds) {
      showError('自动范围尚未生成')
      return
    }
    if (manualFootprintShape !== 'rectangle' && manualFootprintShape !== 'custom') {
      const presetFootprint = createPresetFootprintPolygon(baseBounds, manualFootprintShape, manualFootprintRotationDegrees)
      applyManualTerrainFootprint(presetFootprint, manualFootprintShape)
      return
    }
    if (terrainBoundsMode !== 'manual' || !activeTerrainBoundsWgs84) {
      const initialFootprint = createPresetFootprintPolygon(baseBounds, 'rectangle', manualFootprintRotationDegrees)
      const initialBounds = manualFootprintToBoundsWgs84(initialFootprint) || baseBounds
      setTerrainBoundsMode('manual')
      setManualBoundsWgs84(boundsToInputValues(initialBounds))
      setManualFootprintWgs84(initialFootprint)
      resetGeneratedOutputs()
      setOpenTopoStatus({ tone: 'idle', label: '等待获取' })
      setManualDrawRequest((current) => current + 1)
      return
    }
    setTerrainBoundsMode('manual')
    resetGeneratedOutputs()
    setOpenTopoStatus({ tone: 'idle', label: '等待获取' })
    setManualDrawRequest((current) => current + 1)
  }, [activeTerrainBoundsWgs84, autoTerrainBounds, manualFootprintRotationDegrees, manualFootprintShape, resetGeneratedOutputs, terrainBoundsMode, track])

  const updateManualBoundsWgs84 = useCallback((key, value) => {
    setManualBoundsWgs84((current) => {
      const next = {
        ...current,
        [key]: value,
      }
      const nextBounds = applyManualTerrainBounds(next)
      if (nextBounds) {
        setManualFootprintShape('rectangle')
        setManualFootprintWgs84(createPresetFootprintPolygon(nextBounds, 'rectangle', manualFootprintRotationDegrees))
      }
      return next
    })
    resetGeneratedOutputs()
    setOpenTopoStatus({ tone: 'idle', label: '等待获取' })
  }, [manualFootprintRotationDegrees, resetGeneratedOutputs])

  const applyManualTerrainFootprint = useCallback((footprint, shape = manualFootprintShape) => {
    const nextFootprint = normalizeManualFootprintWgs84(footprint)
    const nextBounds = manualFootprintToBoundsWgs84(nextFootprint)
    if (!nextBounds) {
      showError('手动范围无效')
      return
    }
    setManualFootprintShape(MANUAL_FOOTPRINT_SHAPES.some((item) => item.key === shape) ? shape : 'custom')
    setManualFootprintWgs84(nextFootprint)
    setManualBoundsWgs84(boundsToInputValues(nextBounds))
    setTerrainBoundsMode('manual')
    resetGeneratedOutputs()
    setOpenTopoStatus({ tone: 'idle', label: '等待获取' })
  }, [manualFootprintShape, resetGeneratedOutputs])

  const applyCurrentTerrainBounds = useCallback(() => {
    if (!autoTerrainBounds) return
    const presetShape = manualFootprintShape === 'custom' ? 'rectangle' : manualFootprintShape
    applyManualTerrainFootprint(createPresetFootprintPolygon(autoTerrainBounds, presetShape, manualFootprintRotationDegrees), presetShape)
  }, [applyManualTerrainFootprint, autoTerrainBounds, manualFootprintRotationDegrees, manualFootprintShape])

  const updateManualFootprintRotation = useCallback((value) => {
    const nextAngle = normalizeManualFootprintRotationDegrees(value)
    if (nextAngle === manualFootprintRotationDegrees) return
    if (manualFootprintShape === 'custom') {
      setManualFootprintRotationDegrees(nextAngle)
      return
    }
    const currentFootprint = normalizeManualFootprintWgs84(manualFootprintWgs84)
    const baseBounds = activeTerrainBoundsWgs84 || autoTerrainBounds
    const nextFootprint = currentFootprint
      ? rotateManualFootprintWgs84(currentFootprint, nextAngle - manualFootprintRotationDegrees)
      : createPresetFootprintPolygon(baseBounds, manualFootprintShape, nextAngle)
    const nextBounds = manualFootprintToBoundsWgs84(nextFootprint)
    if (!nextFootprint || !nextBounds) {
      showError('框选旋转角度无效')
      return
    }
    setManualFootprintRotationDegrees(nextAngle)
    setManualFootprintWgs84(nextFootprint)
    setManualBoundsWgs84(boundsToInputValues(nextBounds))
    setTerrainBoundsMode('manual')
    resetGeneratedOutputs()
    setOpenTopoStatus({ tone: 'idle', label: '等待获取' })
  }, [
    activeTerrainBoundsWgs84,
    autoTerrainBounds,
    manualFootprintRotationDegrees,
    manualFootprintShape,
    manualFootprintWgs84,
    resetGeneratedOutputs,
  ])

  const updateManualFootprintShape = useCallback((shape) => {
    const nextShape = MANUAL_FOOTPRINT_SHAPES.some((item) => item.key === shape) ? shape : 'rectangle'
    setManualFootprintShape(nextShape)
    if (nextShape === 'custom') {
      if (!track?.points?.length) {
        showError('请先上传 GPX')
        return
      }
      const baseBounds = activeTerrainBoundsWgs84 || autoTerrainBounds
      if (baseBounds && !activeManualFootprintWgs84) {
        const presetFootprint = createPresetFootprintPolygon(baseBounds, 'rectangle', manualFootprintRotationDegrees)
        setManualBoundsWgs84(boundsToInputValues(manualFootprintToBoundsWgs84(presetFootprint) || baseBounds))
        setManualFootprintWgs84(presetFootprint)
      }
      setTerrainBoundsMode('manual')
      resetGeneratedOutputs()
      setOpenTopoStatus({ tone: 'idle', label: '等待获取' })
      setManualDrawRequest((current) => current + 1)
      return
    }
    const baseBounds = activeTerrainBoundsWgs84 || autoTerrainBounds
    if (!baseBounds) return
    applyManualTerrainFootprint(createPresetFootprintPolygon(baseBounds, nextShape, manualFootprintRotationDegrees), nextShape)
  }, [activeManualFootprintWgs84, activeTerrainBoundsWgs84, applyManualTerrainFootprint, autoTerrainBounds, manualFootprintRotationDegrees, resetGeneratedOutputs, track])

  const updateOption = useCallback((key, value) => {
    const nextValue = Number(value)
    resetGeneratedOutputs()
    setOptions((current) => {
      const nextOptions = {
        ...current,
        [key]: nextValue,
      }
      if (!track?.points?.length || !Number.isFinite(nextValue)) return nextOptions
      if (key !== 'maxReliefMm' && key !== 'verticalScale') return nextOptions
      const sizedOptions = buildTerrainModelOptions(track.points, {
        ...nextOptions,
        terrainBoundsWgs84: activeTerrainBoundsWgs84,
        terrainFootprintWgs84: activeManualFootprintWgs84,
        terrainFootprintRotationDegrees: terrainBoundsMode === 'manual' ? manualFootprintRotationDegrees : 0,
      })
      const recommendation = recommendTerrainReliefOptions(track.points, sizedOptions).active
      if (key === 'maxReliefMm') {
        return {
          ...nextOptions,
          verticalScale: resolveVerticalScaleForReliefTarget(
            recommendation.elevationRangeMeters,
            nextValue,
            current.verticalScale,
          ),
        }
      }
      if (key === 'verticalScale') {
        const targetReliefMm = recommendation.elevationRangeMeters * nextValue
        return {
          ...nextOptions,
          maxReliefMm: Math.max(
            Number(current.maxReliefMm) || 0,
            Number.isFinite(targetReliefMm) ? Number(targetReliefMm.toFixed(1)) : Number(current.maxReliefMm) || 0,
          ),
        }
      }
      return nextOptions
    })
  }, [activeManualFootprintWgs84, activeTerrainBoundsWgs84, manualFootprintRotationDegrees, resetGeneratedOutputs, terrainBoundsMode, track])

  const updateSizingOption = useCallback((key, value) => {
    const nextValue = Number(value)
    setModel(null)
    setSurfaceTexture(null)
    setSurfaceTextureStatus({ tone: 'idle', label: '等待模型' })
    setOptions((current) => {
      const nextOptions = {
        ...current,
        [key]: Number.isFinite(nextValue) ? nextValue : current[key],
      }
      if (!track?.points?.length) {
        return {
          ...nextOptions,
          ...(key === 'modelLongSideMm'
            ? {
              modelWidthMm: nextOptions.modelLongSideMm,
              modelDepthMm: nextOptions.modelLongSideMm,
            }
            : {}),
        }
      }
      const sizedOptions = buildTerrainModelOptions(track.points, {
        ...nextOptions,
        terrainBoundsWgs84: activeTerrainBoundsWgs84,
        terrainFootprintWgs84: activeManualFootprintWgs84,
        terrainFootprintRotationDegrees: terrainBoundsMode === 'manual' ? manualFootprintRotationDegrees : 0,
      })
      return {
        ...nextOptions,
        modelWidthMm: sizedOptions.modelWidthMm,
        modelDepthMm: sizedOptions.modelDepthMm,
      }
    })
  }, [activeManualFootprintWgs84, activeTerrainBoundsWgs84, manualFootprintRotationDegrees, terrainBoundsMode, track])

  const updateStringOption = useCallback((key, value) => {
    resetGeneratedOutputs()
    setOptions((current) => ({
      ...current,
      [key]: value,
    }))
  }, [resetGeneratedOutputs])

  const updateTerrainQuality = useCallback((value) => {
    const preset = TERRAIN_QUALITY_PRESETS[value] || TERRAIN_QUALITY_PRESETS.standard
    resetGeneratedOutputs()
    setOptions((current) => ({
      ...current,
      terrainQuality: value,
      gridRows: preset.rows,
      gridCols: preset.cols,
      elevationSmoothingPasses: preset.smoothing,
    }))
  }, [resetGeneratedOutputs])

  const updateBooleanOption = useCallback((key, value) => {
    resetGeneratedOutputs()
    setOptions((current) => ({
      ...current,
      [key]: Boolean(value),
    }))
  }, [resetGeneratedOutputs])

  const updateOptionalNumberOption = useCallback((key, value) => {
    resetGeneratedOutputs()
    setOptions((current) => ({
      ...current,
      [key]: value === '' ? '' : Number(value),
    }))
  }, [resetGeneratedOutputs])

  const updateReliefMode = useCallback((value) => {
    const nextMode = normalizeReliefMode(value)
    setModel(null)
    setSurfaceTexture(null)
    setSurfaceTextureStatus({ tone: 'idle', label: '等待模型' })
    setOptions((current) => {
      const sizedOptions = track?.points?.length
        ? buildTerrainModelOptions(track.points, {
          ...current,
          reliefMode: value,
          terrainBoundsWgs84: activeTerrainBoundsWgs84,
          terrainFootprintWgs84: activeManualFootprintWgs84,
          terrainFootprintRotationDegrees: terrainBoundsMode === 'manual' ? manualFootprintRotationDegrees : 0,
        })
        : { ...current, reliefMode: value }
      const recommendation = track?.points?.length
        ? recommendTerrainReliefOptions(track.points, sizedOptions).active
        : null
      return {
        ...current,
        modelWidthMm: sizedOptions.modelWidthMm ?? current.modelWidthMm,
        modelDepthMm: sizedOptions.modelDepthMm ?? current.modelDepthMm,
        reliefMode: nextMode,
        ...(recommendation
          ? {
            maxReliefMm: recommendation.maxReliefMm,
            verticalScale: recommendation.verticalScale,
            contourIntervalMeters: recommendation.contourIntervalMeters,
          }
          : {}),
      }
    })
  }, [activeManualFootprintWgs84, activeTerrainBoundsWgs84, manualFootprintRotationDegrees, terrainBoundsMode, track])

  const applyReliefRecommendation = useCallback((recommendation) => {
    if (!recommendation) return
    setModel(null)
    setSurfaceTexture(null)
    setSurfaceTextureStatus({ tone: 'idle', label: '等待模型' })
    setOptions((current) => ({
      ...current,
      reliefMode: normalizeReliefMode(recommendation.mode),
      maxReliefMm: recommendation.maxReliefMm,
      verticalScale: recommendation.verticalScale,
      contourIntervalMeters: recommendation.contourIntervalMeters,
    }))
  }, [])

  const applyHighPrecisionRecommendation = useCallback((recommendation) => {
    if (!recommendation) return
    resetGeneratedOutputs()
    setOptions((current) => ({
      ...current,
      terrainQuality: recommendation.terrainQuality,
      gridRows: recommendation.gridRows,
      gridCols: recommendation.gridCols,
      elevationSmoothingPasses: recommendation.elevationSmoothingPasses,
      targetModelGridMm: recommendation.targetModelGridMm,
    }))
  }, [resetGeneratedOutputs])

  // 一键「真实地貌」：把行业实践（高网格 + 不平滑 + 卫星取色 + 卫星贴图预览）与
  // 起伏两档组合成单次操作。tier: 'stable'（稳妥可打印）| 'dramatic'（地貌优先戏剧化）。
  const applyRealisticTerrainPreset = useCallback((tier) => {
    if (!track?.points?.length) return
    resetGeneratedOutputs()
    const reliefMode = tier === 'dramatic' ? 'terrain-forward' : 'print-readable'
    const reliefRec = recommendTerrainReliefOptions(track.points, { ...generationOptions, reliefMode })
    const relief = tier === 'dramatic' ? reliefRec.terrainForward : reliefRec.printReadable
    const precision = recommendHighPrecisionTerrainOptions(track.points, generationOptions, {
      ...(demRaster || {}),
      sourceName: demRaster?.sourceName || (useSampledTerrain ? 'ArcGIS WorldElevation3D Terrain3D' : 'GPX 高程'),
      targetModelGridMm: 0.3,
    })
    // 数字预览：开启卫星贴图（Esri World Imagery）
    setSurfaceTextureEnabled(true)
    setSurfaceTextureSourceKey('esriWorldImagery')
    setOptions((current) => ({
      ...current,
      // 几何保真：网格顶到打印分辨率 + 不平滑
      terrainQuality: precision?.terrainQuality ?? current.terrainQuality,
      gridRows: precision?.gridRows ?? current.gridRows,
      gridCols: precision?.gridCols ?? current.gridCols,
      targetModelGridMm: precision?.targetModelGridMm ?? current.targetModelGridMm,
      elevationSmoothingPasses: 0,
      // 起伏档
      reliefMode: relief?.mode ?? reliefMode,
      maxReliefMm: relief?.maxReliefMm ?? current.maxReliefMm,
      verticalScale: relief?.verticalScale ?? current.verticalScale,
      contourIntervalMeters: relief?.contourIntervalMeters ?? current.contourIntervalMeters,
      // 真实地貌配色：从卫星影像取色，裁到 ~4 AMS 槽
      colorMode: 'satellite',
      terrainColorBandsEnabled: false,
      snowlineEnabled: false,
      snowlineElevationMeters: '',
      satelliteColorStrategy: 'realistic',
      satelliteTerrainColorLimit: 4,
    }))
  }, [track, generationOptions, demRaster, useSampledTerrain, resetGeneratedOutputs])

  const handleFileChange = useCallback(async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = parseGpxTrack(text)
      setFileName(file.name)
      setTrack(parsed)
      setTerrainBoundsMode('auto')
      setManualBoundsWgs84(boundsToInputValues(null))
      setModel(null)
      setSurfaceTexture(null)
      setSurfaceTextureStatus({ tone: 'idle', label: '等待模型' })
      setOpenTopoStatus({ tone: 'idle', label: '等待获取' })
      setOptions((current) => {
        const sizedOptions = buildTerrainModelOptions(parsed.points, {
          ...current,
          terrainBoundsWgs84: null,
        })
        const recommendation = recommendTerrainReliefOptions(parsed.points, sizedOptions).active
        const printStyle = recommendTerrainPrintStyleOptions(parsed.points, sizedOptions)
        const highPrecision = demRaster
          ? recommendHighPrecisionTerrainOptions(parsed.points, sizedOptions, demRaster)
          : null
        return {
          ...current,
          modelWidthMm: sizedOptions.modelWidthMm,
          modelDepthMm: sizedOptions.modelDepthMm,
          terrainColorBandsEnabled: printStyle.terrainColorBandsEnabled,
          lowlandPercentile: Math.round(printStyle.lowlandPercentile * 100),
          lowlandCapThicknessMm: printStyle.lowlandCapThicknessMm,
          snowlineEnabled: printStyle.snowlineEnabled,
          snowlineElevationMeters: printStyle.snowlineElevationMeters ?? '',
          snowlinePercentile: Math.round(printStyle.snowlinePercentile * 100),
          snowCapThicknessMm: printStyle.snowCapThicknessMm,
          ...(highPrecision
            ? {
              terrainQuality: highPrecision.terrainQuality,
              gridRows: highPrecision.gridRows,
              gridCols: highPrecision.gridCols,
              elevationSmoothingPasses: highPrecision.elevationSmoothingPasses,
              targetModelGridMm: highPrecision.targetModelGridMm,
            }
            : {}),
          ...(recommendation
            ? {
              maxReliefMm: recommendation.maxReliefMm,
              verticalScale: recommendation.verticalScale,
              contourIntervalMeters: recommendation.contourIntervalMeters,
            }
            : {}),
        }
      })
      showSuccess('GPX 已载入')
    } catch (error) {
      setTrack(null)
      setModel(null)
      setSurfaceTexture(null)
      setSurfaceTextureStatus({ tone: 'idle', label: '等待模型' })
      setOpenTopoStatus({ tone: 'idle', label: '等待 GPX' })
      showError(error.message || 'GPX 解析失败')
    }
  }, [demRaster])

  const handleDemFileChange = useCallback(async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const raster = parseArcAsciiGrid(text, { sourceName: file.name })
      setDemRaster(raster)
      setDemFileName(file.name)
      setUseSampledTerrain(false)
      setModel(null)
      setSurfaceTexture(null)
      setSurfaceTextureStatus({ tone: 'idle', label: '等待模型' })
      setOpenTopoStatus({ tone: 'idle', label: '等待在线获取' })
      setOptions((current) => {
        if (!track?.points?.length) return current
        const sizedOptions = buildTerrainModelOptions(track.points, {
          ...current,
          terrainBoundsWgs84: activeTerrainBoundsWgs84,
          terrainFootprintWgs84: activeManualFootprintWgs84,
          terrainFootprintRotationDegrees: terrainBoundsMode === 'manual' ? manualFootprintRotationDegrees : 0,
        })
        const recommendation = recommendHighPrecisionTerrainOptions(track.points, sizedOptions, raster)
        return {
          ...current,
          modelWidthMm: sizedOptions.modelWidthMm,
          modelDepthMm: sizedOptions.modelDepthMm,
          terrainQuality: recommendation.terrainQuality,
          gridRows: recommendation.gridRows,
          gridCols: recommendation.gridCols,
          elevationSmoothingPasses: recommendation.elevationSmoothingPasses,
          targetModelGridMm: recommendation.targetModelGridMm,
        }
      })
      showSuccess('高精 DEM 已载入')
    } catch (error) {
      setDemRaster(null)
      setDemFileName('')
      showError(error.message || 'DEM 解析失败')
    } finally {
      event.target.value = ''
    }
  }, [activeManualFootprintWgs84, activeTerrainBoundsWgs84, manualFootprintRotationDegrees, terrainBoundsMode, track])

  const handleFetchOpenTopographyDem = useCallback(async () => {
    if (!track?.points?.length) {
      showError('请先上传 GPX')
      return
    }
    if (terrainBoundsMode === 'manual' && !manualTerrainBoundsReady) {
      showError('手动范围无效')
      return
    }
    const apiKey = openTopoApiKey.trim()
    if (!apiKey) {
      showError('请先填写 OpenTopography API Key')
      return
    }
    const demType = OPENTOPOGRAPHY_DEM_TYPES[openTopoDemType] ? openTopoDemType : 'COP30'
    const demTypeConfig = OPENTOPOGRAPHY_DEM_TYPES[demType]
    setFetchingOpenTopo(true)
    setOpenTopoStatus({ tone: 'loading', label: '请求中' })
    try {
      const bounds = buildBufferedWgs84Bounds(track.points, {
        paddingMeters: options.paddingMeters,
        terrainBoundsWgs84: activeTerrainBoundsWgs84,
      })
      const raster = await fetchOpenTopographyGlobalAsciiGrid({
        apiKey,
        demType,
        bounds,
        resolutionMeters: demTypeConfig.resolutionMeters,
      })
      setDemRaster(raster)
      setDemFileName('OpenTopography-' + demType + '.asc')
      setUseSampledTerrain(false)
      setModel(null)
      setSurfaceTexture(null)
      setSurfaceTextureStatus({ tone: 'idle', label: '等待模型' })
      setOpenTopoStatus({ tone: 'success', label: getOpenTopoStatusLabel(raster, demType) })
      setOptions((current) => {
        const sizedOptions = buildTerrainModelOptions(track.points, {
          ...current,
          terrainBoundsWgs84: activeTerrainBoundsWgs84,
          terrainFootprintWgs84: activeManualFootprintWgs84,
          terrainFootprintRotationDegrees: terrainBoundsMode === 'manual' ? manualFootprintRotationDegrees : 0,
        })
        const recommendation = recommendHighPrecisionTerrainOptions(track.points, sizedOptions, raster)
        return {
          ...current,
          modelWidthMm: sizedOptions.modelWidthMm,
          modelDepthMm: sizedOptions.modelDepthMm,
          terrainQuality: recommendation.terrainQuality,
          gridRows: recommendation.gridRows,
          gridCols: recommendation.gridCols,
          elevationSmoothingPasses: recommendation.elevationSmoothingPasses,
          targetModelGridMm: recommendation.targetModelGridMm,
        }
      })
      showSuccess('OpenTopography DEM 已载入')
    } catch (error) {
      const message = error.message || 'OpenTopography DEM 获取失败'
      setOpenTopoStatus({ tone: 'error', label: '请求失败：' + message })
      showError(message)
    } finally {
      setFetchingOpenTopo(false)
    }
  }, [activeManualFootprintWgs84, activeTerrainBoundsWgs84, manualFootprintRotationDegrees, manualTerrainBoundsReady, openTopoApiKey, openTopoDemType, options.paddingMeters, terrainBoundsMode, track])

  const getSurfaceTextureSourceOptions = useCallback(async () => {
    if (surfaceTextureSourceKey === 'googleSatellite') {
      const apiKey = surfaceTextureGoogleApiKey.trim()
      if (!apiKey) {
        throw new Error('请填写 Google Maps Tiles API Key')
      }
      if (isReusableGoogleSession(surfaceTextureGoogleSession, apiKey)) {
        return {
          apiKey,
          session: surfaceTextureGoogleSession.session,
        }
      }
      const nextSession = await createGoogleMapTilesSession({
        apiKey,
        mapType: 'satellite',
        language: 'zh-CN',
        region: 'CN',
      })
      setSurfaceTextureGoogleSession({
        apiKey,
        session: nextSession.session,
        expiry: nextSession.expiry,
      })
      return {
        apiKey,
        session: nextSession.session,
      }
    }

    if (surfaceTextureSourceKey === 'cesiumIonRaster') {
      const accessToken = surfaceTextureCesiumAccessToken.trim()
      const assetId = surfaceTextureCesiumAssetId.trim()
      const urlTemplate = surfaceTextureCesiumUrlTemplate.trim()
      if (urlTemplate) {
        return {
          accessToken,
          assetId,
          urlTemplate,
        }
      }
      const nextOptions = await fetchCesiumIonRasterSourceOptions({
        accessToken,
        assetId,
      })
      setSurfaceTextureCesiumUrlTemplate(nextOptions.urlTemplate)
      return nextOptions
    }

    return {}
  }, [
    surfaceTextureCesiumAccessToken,
    surfaceTextureCesiumAssetId,
    surfaceTextureCesiumUrlTemplate,
    surfaceTextureGoogleApiKey,
    surfaceTextureGoogleSession,
    surfaceTextureSourceKey,
  ])

  const buildSurfaceTextureForModel = useCallback(async (targetModel = model) => {
    const boundsWgs84 = targetModel?.terrain?.boundsWgs84 || terrainBounds
    if (!boundsWgs84) {
      showError('无法确定贴图范围，请先生成模型或上传 GPX')
      return null
    }
    setBuildingSurfaceTexture(true)
    setSurfaceTextureStatus({ tone: 'loading', label: '准备贴图' })
    try {
      const sourceOptions = await getSurfaceTextureSourceOptions()
      const textureQuality = SURFACE_TEXTURE_QUALITY_PRESETS[surfaceTextureQuality]
        || SURFACE_TEXTURE_QUALITY_PRESETS.standard
      const texturePlan = buildSurfaceTextureTilePlan(boundsWgs84, {
        sourceKey: surfaceTextureSourceKey,
        sourceOptions,
        maxTextureSize: textureQuality.maxTextureSize,
        maxTexturePixels: textureQuality.maxTexturePixels,
        maxTiles: textureQuality.maxTiles,
      })
      setSurfaceTextureStatus({
        tone: 'loading',
        label: '计划 ' + getSurfaceTextureStatusLabel(texturePlan),
      })
      const nextSurfaceTexture = await buildSurfaceTextureDataUrl(boundsWgs84, {
        sourceKey: surfaceTextureSourceKey,
        sourceOptions,
        maxTextureSize: textureQuality.maxTextureSize,
        maxTexturePixels: textureQuality.maxTexturePixels,
        maxTiles: textureQuality.maxTiles,
        yieldEveryTiles: 2,
        includeRawImageData: options.colorMode === 'satellite',
        onProgress: (progress) => {
          setSurfaceTextureStatus({
            tone: 'loading',
            label: getSurfaceTextureProgressLabel(progress),
          })
        },
      })
      setSurfaceTexture(nextSurfaceTexture)
      setSurfaceTextureStatus({
        tone: getSurfaceTextureStatusTone(nextSurfaceTexture),
        label: getSurfaceTextureStatusLabel(nextSurfaceTexture),
      })
      reportSurfaceTextureComplete(nextSurfaceTexture)
      return nextSurfaceTexture
    } catch (error) {
      const message = error.message || '卫星贴图生成失败'
      setSurfaceTexture(null)
      setSurfaceTextureStatus({ tone: 'error', label: '生成失败：' + message })
      showError(message)
      return null
    } finally {
      setBuildingSurfaceTexture(false)
    }
  }, [getSurfaceTextureSourceOptions, model, options.colorMode, surfaceTextureQuality, surfaceTextureSourceKey, terrainBounds])

  const handleGenerate = useCallback(async () => {
    if (!track?.points?.length) {
      showError('请先上传 GPX')
      return
    }
    if (terrainBoundsMode === 'manual' && !manualTerrainBoundsReady) {
      showError('手动范围无效')
      return
    }
    setBuilding(true)
    try {
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve()))

      // For satellite colour-mapping mode with surface texture enabled,
      // generate the texture first so we can extract pixel data, then pass
      // it into the model for per-face colour clustering.
      let textureImageData = null
      let textureWidthPx = 512
      let textureHeightPx = 512
      const useSatelliteMode = options.colorMode === 'satellite' && surfaceTextureEnabled

      if (useSatelliteMode) {
        const surfaceResult = await buildSurfaceTextureForModel(null)
        if (surfaceResult?.rawImageData) {
          textureImageData = surfaceResult.rawImageData
          textureWidthPx = surfaceResult.textureWidth || textureWidthPx
          textureHeightPx = surfaceResult.textureHeight || textureHeightPx
          setSurfaceTexture(surfaceResult)
          setSurfaceTextureStatus({
            tone: getSurfaceTextureStatusTone(surfaceResult),
            label: getSurfaceTextureStatusLabel(surfaceResult),
          })
        }
      }

      const distanceLabel = summary?.distanceMeters
        ? formatDistance(summary.distanceMeters).replace(/\s+/g, '').toUpperCase()
        : ''
      const nextModel = await buildTerrainModel(track.points, {
        ...generationOptions,
        terrainBoundsWgs84: activeTerrainBoundsWgs84,
        terrainFootprintWgs84: activeManualFootprintWgs84,
        terrainFootprintRotationDegrees: terrainBoundsMode === 'manual' ? manualFootprintRotationDegrees : 0,
        labelText: generationOptions.labelText || distanceLabel,
        secondaryLabelText: generationOptions.secondaryLabelText || '中奥致远',
        elevationSourceType: demRaster ? (demRaster.sourceType || 'uploaded-aaigrid-dem') : (useSampledTerrain ? 'arcgis-terrain3d' : ''),
        elevationSourceName: demRaster ? demRaster.sourceName : (useSampledTerrain ? 'ArcGIS WorldElevation3D Terrain3D' : 'GPX 高程'),
        elevationSourceResolutionMeters: demRaster?.resolutionMeters || null,
        elevationSourceBoundsWgs84: demRaster?.requestBoundsWgs84 || demRaster?.bounds || null,
        sampleElevations: demRaster
          ? (samples) => sampleRasterElevations(samples, demRaster)
          : useSampledTerrain
          ? (samples) => sampleArcGisTerrain(samples, {
            chunkSize: generationOptions.terrainQuality === 'ultra' ? 6000 : 9000,
          })
          : undefined,
        // Satellite colour-mapping data (only passed when in satellite mode)
        rawImageData: textureImageData,
        textureWidth: textureWidthPx,
        textureHeight: textureHeightPx,
      })
      setModel(nextModel)

      if (surfaceTextureEnabled && !useSatelliteMode) {
        setSurfaceTexture(null)
        setSurfaceTextureStatus({ tone: 'loading', label: '生成中' })
        await buildSurfaceTextureForModel(nextModel)
      } else if (!surfaceTextureEnabled) {
        setSurfaceTexture(null)
        setSurfaceTextureStatus({ tone: 'idle', label: '等待生成' })
      }
      showSuccess('模型已生成')
    } catch (error) {
      showError(error.message || '模型生成失败')
    } finally {
      setBuilding(false)
    }
  }, [activeManualFootprintWgs84, activeTerrainBoundsWgs84, buildSurfaceTextureForModel, demRaster, generationOptions, manualFootprintRotationDegrees, manualTerrainBoundsReady, options.colorMode, summary?.distanceMeters, surfaceTextureEnabled, terrainBoundsMode, track, useSampledTerrain])

  const handleDownloadZip = useCallback(async () => {
    if (exportBlockedBySurfaceTexture) {
      showError(buildingSurfaceTexture
        ? '卫星贴图生成中，请稍后再导出'
        : '请先生成卫星贴图，或关闭卫星贴图后导出')
      return
    }
    if (!model || exportingFilesRef.current) return
    exportingFilesRef.current = true
    setExportingFiles(true)
    try {
      // Let the "导出中" state paint before the heavy STL/3MF serialization,
      // which is intentionally deferred to this explicit download action.
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
      const files = buildTerrainModelExportFiles(model, exportOptions)
      if (!files.length) return
      const zipBytes = buildTerrainModelExportArchive(files)
      const blob = new Blob([zipBytes], { type: 'application/zip' })
      downloadBlob(blob, `${exportBaseName}-terrain-model.zip`)
    } catch (error) {
      showError(error.message || '导出失败')
    } finally {
      exportingFilesRef.current = false
      setExportingFiles(false)
    }
  }, [buildingSurfaceTexture, exportBaseName, exportBlockedBySurfaceTexture, exportOptions, model])

  const handleDownloadFile = useCallback(async (fileDescriptor) => {
    if (!model || !fileDescriptor?.name || exportingFilesRef.current) return
    exportingFilesRef.current = true
    setExportingFiles(true)
    try {
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
      const file = buildTerrainModelExportFile(model, exportOptions, fileDescriptor.name)
      if (!file) {
        showError('未找到导出文件：' + fileDescriptor.name)
        return
      }
      downloadTextFile(file)
    } catch (error) {
      showError(error.message || '导出失败')
    } finally {
      exportingFilesRef.current = false
      setExportingFiles(false)
    }
  }, [exportOptions, model])

  const handleDownloadGlb = useCallback(async () => {
    if (!model) return
    if (exportBlockedBySurfaceTexture) {
      showError(buildingSurfaceTexture
        ? '卫星贴图生成中，请稍后再导出'
        : '请先生成卫星贴图，或关闭卫星贴图后导出')
      return
    }
    setExportingGlb(true)
    let group = null
    try {
      const surfaceTextureMap = await loadSurfaceTextureMap(surfaceTexture)
      const exporter = new GLTFExporter()
      group = createModelGroup(model, { surfaceTextureMap })
      const result = await new Promise((resolve, reject) => {
        exporter.parse(
          group,
          resolve,
          reject,
          { binary: true },
        )
      })
      const blob = result instanceof ArrayBuffer
        ? new Blob([result], { type: 'model/gltf-binary' })
        : new Blob([JSON.stringify(result)], { type: 'model/gltf+json' })
      const glbFileName = surfaceTexture
        ? `${exportBaseName}-satellite-texture.glb`
        : `${exportBaseName}-geometry-preview.glb`
      downloadBlob(blob, glbFileName)
    } catch (error) {
      showError(error.message || 'GLB 导出失败')
    } finally {
      if (group) {
        group.traverse((item) => {
          if (item.geometry) item.geometry.dispose()
          if (item.material) disposeMaterial(item.material)
        })
      }
      setExportingGlb(false)
    }
  }, [buildingSurfaceTexture, exportBaseName, exportBlockedBySurfaceTexture, model, surfaceTexture])

  return (
    <div className="terrain-model-page">
      <section className="terrain-model-shell">
        <div className="terrain-model-left">
          <div className="terrain-model-panel terrain-model-panel--map">
            <div className="terrain-model-panel__head">
              <h2>轨迹地图</h2>
              <span>{summary ? formatDistance(summary.distanceMeters) : '-'}</span>
            </div>
            <TerrainRouteMap
              points={track?.points || []}
              terrainBounds={terrainBounds}
              terrainBoundsMode={terrainBoundsMode}
              manualFootprintWgs84={activeManualFootprintWgs84}
              manualFootprintShape={manualFootprintShape}
              manualFootprintRotationDegrees={manualFootprintRotationDegrees}
              manualDrawRequest={manualDrawRequest}
              onBoundsModeChange={updateTerrainBoundsMode}
              onManualFootprintChange={applyManualTerrainFootprint}
            />
            <TerrainBoundsControlPanel
              points={track?.points || []}
              mode={terrainBoundsMode}
              bounds={terrainBounds}
              activeManualBounds={activeTerrainBoundsWgs84}
              manualFootprintShape={manualFootprintShape}
              manualFootprintRotationDegrees={manualFootprintRotationDegrees}
              manualFootprintVertexCount={activeManualFootprintWgs84?.length || 0}
              manualBoundsWgs84={manualBoundsWgs84}
              manualReady={manualTerrainBoundsReady}
              paddingMeters={options.paddingMeters}
              modelSizing={modelSizing}
              onPaddingChange={(value) => updateSizingOption('paddingMeters', value)}
              onAuto={() => updateTerrainBoundsMode('auto')}
              onDrawManual={startManualTerrainBoundsDraw}
              onUseAutoAsManual={applyCurrentTerrainBounds}
              onManualFootprintShapeChange={updateManualFootprintShape}
              onManualFootprintRotationChange={updateManualFootprintRotation}
              onManualBoundChange={updateManualBoundsWgs84}
            />
          </div>

          <div className="terrain-model-panel terrain-model-panel--controls">
            <div className="terrain-model-panel__head">
              <h2>模型设置</h2>
              <span>{model ? `${model.stats.terrainTriangles + model.stats.lowlandTriangles + model.stats.contourTriangles + model.stats.snowlineTriangles + model.stats.snowTriangles + model.stats.trackTriangles + model.stats.baseTriangles + model.stats.labelTriangles} tris` : '按流程配置'}</span>
            </div>
            <div className="terrain-model-controls">
              <div className="terrain-model-realistic-preset" aria-label="真实地貌一键预设">
                <div className="terrain-model-realistic-preset__head">
                  <span className="material-symbols-outlined" aria-hidden="true">landscape</span>
                  <div>
                    <strong>真实地貌（推荐）</strong>
                    <p>一键套用高精网格、卫星取色和数字预览贴图；起伏选一档即可。</p>
                  </div>
                </div>
                <div className="terrain-model-realistic-preset__actions">
                  <button
                    type="button"
                    disabled={!track}
                    onClick={() => applyRealisticTerrainPreset('stable')}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">verified</span>
                    <span>稳妥可打印</span>
                  </button>
                  <button
                    type="button"
                    className="terrain-model-realistic-preset__dramatic"
                    disabled={!track}
                    onClick={() => applyRealisticTerrainPreset('dramatic')}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">terrain</span>
                    <span>地貌优先 · 戏剧化</span>
                  </button>
                </div>
              </div>
              <ControlSection icon="database" title="① 数据来源" description="DEM、API Key 和在线高精数据状态集中在这里，先确认数据再调模型。">
              {highPrecisionRecommendation && (
                <>
                  <div className="terrain-model-status-strip terrain-model-status-strip--two">
                    <div>
                      <span>高精 DEM</span>
                      <strong>
                        {highPrecisionRecommendation.gridRows} x {highPrecisionRecommendation.gridCols}
                        {' / '}
                        {formatNumber(highPrecisionRecommendation.precision.gridSpacingMm.min, ' mm')}
                      </strong>
                    </div>
                    <div>
                      <span>来源</span>
                      <strong>
                        {elevationSourceLabel}
                        {' / '}
                        {formatResolution(highPrecisionRecommendation.precision.source.resolutionMeters)}
                      </strong>
                    </div>
                  </div>
                  <div className="terrain-model-action-row terrain-model-action-row--single">
                    <button type="button" onClick={() => applyHighPrecisionRecommendation(highPrecisionRecommendation)}>
                      <span className="material-symbols-outlined">grid_view</span>
                      <span>应用高精网格</span>
                    </button>
                  </div>
                </>
              )}
              <label>
                <span>OpenTopography API Key</span>
                <input
                  type="password"
                  value={openTopoApiKey}
                  placeholder="免费账号 API Key"
                  autoComplete="off"
                  onChange={(event) => setOpenTopoApiKey(event.target.value)}
                />
              </label>
              <label className="terrain-model-check terrain-model-check--field">
                <span>本机保存</span>
                <span className="terrain-model-check__control">
                  <span className="terrain-model-check__state">{rememberOpenTopoApiKey ? '已开启' : '关闭'}</span>
                  <input
                    type="checkbox"
                    checked={rememberOpenTopoApiKey}
                    onChange={(event) => setRememberOpenTopoApiKey(event.target.checked)}
                  />
                  <span className="material-symbols-outlined terrain-model-check__indicator" aria-hidden="true">check</span>
                </span>
              </label>
              <label>
                <span>OpenTopography DEM</span>
                <select value={openTopoDemType} onChange={(event) => setOpenTopoDemType(event.target.value)}>
                  {Object.entries(OPENTOPOGRAPHY_DEM_TYPES).map(([key, item]) => (
                    <option key={key} value={key}>{item.label}</option>
                  ))}
                </select>
              </label>
              <div className="terrain-model-status-strip terrain-model-status-strip--three">
                <div>
                  <span>在线高精 DEM</span>
                  <strong>{OPENTOPOGRAPHY_DEM_TYPES[openTopoDemType]?.label || 'Copernicus 30m'}</strong>
                </div>
                <div>
                  <span>请求范围</span>
                  <strong>
                    {track?.points?.length
                      ? terrainBoundsMode === 'manual'
                        ? activeTerrainBoundsWgs84 ? '手动框选范围 / ' + formatBoundsSize(terrainBounds) : '等待手动范围'
                        : 'GPX + ' + formatNumber(options.paddingMeters, ' m') + ' / ' + formatBoundsSize(terrainBounds)
                      : '等待 GPX'}
                  </strong>
                </div>
                <div>
                  <span>DEM 状态</span>
                  <strong className={`terrain-model-status terrain-model-status--${openTopoStatus.tone}`}>
                    {fetchingOpenTopo ? '请求中' : openTopoStatus.label}
                  </strong>
                </div>
              </div>
              <div className="terrain-model-action-row terrain-model-action-row--single">
                <button type="button" disabled={!track || fetchingOpenTopo || !manualTerrainBoundsReady} onClick={handleFetchOpenTopographyDem}>
                  <span className="material-symbols-outlined">cloud_download</span>
                  <span>{fetchingOpenTopo ? '获取中' : '获取 DEM'}</span>
                </button>
              </div>
              </ControlSection>

              {/* ── 模型规格：外形、尺寸、起伏 + 高级子项 ─────────────── */}
              <ControlSection icon="straighten" title="② 模型规格" description="外形、尺寸、起伏倍率和底座/磁铁等制造参数。">
              <label>
                <span>地形精度</span>
                <select value={options.terrainQuality} onChange={(event) => updateTerrainQuality(event.target.value)}>
                  {Object.entries(TERRAIN_QUALITY_PRESETS).map(([key, preset]) => (
                    <option key={key} value={key}>{preset.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>外形</span>
                <select value={options.shapeType} onChange={(event) => updateStringOption('shapeType', event.target.value)}>
                  <option value="hexagon">六边形</option>
                  <option value="triangle">三角形</option>
                  <option value="rectangle">矩形</option>
                  <option value="circle">圆形</option>
                </select>
              </label>
              <label>
                <span>成品长边 mm</span>
                <input type="number" value={options.modelLongSideMm} min="40" max="260" step="5" onChange={(event) => updateSizingOption('modelLongSideMm', event.target.value)} />
              </label>
              <div className="terrain-model-size-readout">
                <span>自动宽深</span>
                <strong>{formatNumber(modelSizing.modelWidthMm, ' mm')} x {formatNumber(modelSizing.modelDepthMm, ' mm')}</strong>
                <p>{track?.points?.length ? (terrainBoundsMode === 'manual' ? '按手动采集范围比例锁定' : '按自动采集范围比例锁定') : '上传 GPX 后自动计算比例'}</p>
              </div>
              <div className="terrain-model-relief-mode" aria-label="起伏模式">
                <span>起伏模式</span>
                <div role="group" aria-label="起伏模式">
                  <button
                    type="button"
                    className={normalizeReliefMode(options.reliefMode) === 'realistic' ? 'is-active' : ''}
                    aria-pressed={normalizeReliefMode(options.reliefMode) === 'realistic'}
                    onClick={() => updateReliefMode('realistic')}
                  >
                    真实优先
                  </button>
                  <button
                    type="button"
                    className={normalizeReliefMode(options.reliefMode) === 'print-readable' ? 'is-active' : ''}
                    aria-pressed={normalizeReliefMode(options.reliefMode) === 'print-readable'}
                    onClick={() => updateReliefMode('print-readable')}
                  >
                    打印可读
                  </button>
                  <button
                    type="button"
                    className={normalizeReliefMode(options.reliefMode) === 'terrain-forward' ? 'is-active' : ''}
                    aria-pressed={normalizeReliefMode(options.reliefMode) === 'terrain-forward'}
                    onClick={() => updateReliefMode('terrain-forward')}
                  >
                    地貌优先
                  </button>
                </div>
              </div>
              {reliefRecommendation && (
                <>
                  <div className="terrain-model-status-strip terrain-model-status-strip--two">
                    <div>
                      <span>当前模式</span>
                      <strong>
                        {getReliefModeLabel(options.reliefMode)}
                        {' / '}
                        {formatNumber(activeReliefRecommendation?.maxReliefMm, ' mm')}
                        {' / '}
                        {activeReliefRecommendation?.contourIntervalMeters || '-'} m
                      </strong>
                    </div>
                    <div>
                      <span>真实比例</span>
                      <strong>
                        真实 {formatNumber(activeReliefRecommendation?.realScaleReliefMm, ' mm')}
                        {' / '}
                        {formatNumber(activeReliefRecommendation?.verticalExaggeration, 'x')}
                      </strong>
                    </div>
                  </div>
                  <div className="terrain-model-action-row terrain-model-action-row--three">
                    <button type="button" onClick={() => applyReliefRecommendation(reliefRecommendation.realistic)}>
                      <span className="material-symbols-outlined">straighten</span>
                      <span>真实优先</span>
                    </button>
                    <button type="button" onClick={() => applyReliefRecommendation(reliefRecommendation.printReadable)}>
                      <span className="material-symbols-outlined">auto_fix_high</span>
                      <span>打印可读</span>
                    </button>
                    {reliefRecommendation.terrainForward && (
                      <button type="button" onClick={() => applyReliefRecommendation(reliefRecommendation.terrainForward)}>
                        <span className="material-symbols-outlined">terrain</span>
                        <span>地貌优先</span>
                      </button>
                    )}
                  </div>
                </>
              )}
              <details className="terrain-model-subsection">
                <summary><span className="material-symbols-outlined" aria-hidden="true">tune</span>高级几何</summary>
                <div className="terrain-model-subsection__grid">
              <label>
                <span>网格行</span>
                <input type="number" value={options.gridRows} min="8" max="320" step="4" onChange={(event) => updateOption('gridRows', event.target.value)} />
              </label>
              <label>
                <span>网格列</span>
                <input type="number" value={options.gridCols} min="8" max="320" step="4" onChange={(event) => updateOption('gridCols', event.target.value)} />
              </label>
              <label>
                <span>保峰超采样</span>
                <select value={options.terrainSupersample ?? 1} onChange={(event) => updateOption('terrainSupersample', event.target.value)}>
                  <option value="1">关闭（更快）</option>
                  <option value="2">2× 保峰（更尖锐，较慢）</option>
                  <option value="3">3× 保峰（最尖锐，最慢）</option>
                </select>
              </label>
              <label>
                <span>地形底厚 mm</span>
                <input type="number" value={options.baseHeightMm} min="0.6" max="12" step="0.2" onChange={(event) => updateOption('baseHeightMm', event.target.value)} />
              </label>
              <label>
                <span>高程倍率</span>
                <input type="number" value={options.verticalScale} min="0.001" max="2" step="0.005" onChange={(event) => updateOption('verticalScale', event.target.value)} />
              </label>
              <label>
                <span>最大起伏 mm</span>
                <input type="number" value={options.maxReliefMm} min="3" max="90" step="0.5" onChange={(event) => updateOption('maxReliefMm', event.target.value)} />
              </label>
              <label>
                <span>面网格 mm</span>
                <input type="number" value={options.targetModelGridMm} min="0.25" max="1.2" step="0.01" onChange={(event) => updateOption('targetModelGridMm', event.target.value)} />
              </label>
              <label>
                <span>平滑次数</span>
                <input type="number" value={options.elevationSmoothingPasses} min="0" max="4" step="1" onChange={(event) => updateOption('elevationSmoothingPasses', event.target.value)} />
              </label>
                </div>
              </details>
              <details className="terrain-model-subsection">
                <summary><span className="material-symbols-outlined" aria-hidden="true">manufacturing</span>底座与铭牌</summary>
                <div className="terrain-model-subsection__grid">
              <label>
                <span>黑边宽 mm</span>
                <input type="number" value={options.frameWidthMm} min="0" max="28" step="0.5" onChange={(event) => updateOption('frameWidthMm', event.target.value)} />
              </label>
              <label>
                <span>黑底厚 mm</span>
                <input type="number" value={options.basePlateHeightMm} min="0" max="10" step="0.2" onChange={(event) => updateOption('basePlateHeightMm', event.target.value)} />
              </label>
              <label className="terrain-model-check terrain-model-check--field">
                <span>磁铁孔</span>
                <span className="terrain-model-check__control">
                  <span className="terrain-model-check__state">{options.magnetHoleEnabled ? '已开启' : '关闭'}</span>
                  <input type="checkbox" checked={options.magnetHoleEnabled} onChange={(event) => updateBooleanOption('magnetHoleEnabled', event.target.checked)} />
                  <span className="material-symbols-outlined terrain-model-check__indicator" aria-hidden="true">check</span>
                </span>
              </label>
              <label>
                <span>孔数量</span>
                <input type="number" value={options.magnetHoleCount} min="2" max="12" step="1" disabled={!options.magnetHoleEnabled} onChange={(event) => updateOption('magnetHoleCount', event.target.value)} />
              </label>
              <label>
                <span>孔直径 mm</span>
                <input type="number" value={options.magnetHoleDiameterMm} min="3" max="18" step="0.5" disabled={!options.magnetHoleEnabled} onChange={(event) => updateOption('magnetHoleDiameterMm', event.target.value)} />
              </label>
              <label>
                <span>孔内缩 mm</span>
                <input type="number" value={options.magnetHoleInsetMm} min="3" max="40" step="1" disabled={!options.magnetHoleEnabled} onChange={(event) => updateOption('magnetHoleInsetMm', event.target.value)} />
              </label>
              <label>
                <span>正面文字</span>
                <input type="text" value={options.labelText} placeholder={summary ? formatDistance(summary.distanceMeters).replace(/\s+/g, '').toUpperCase() : '23.40KM'} onChange={(event) => updateStringOption('labelText', event.target.value)} />
              </label>
              <label>
                <span>背面文字</span>
                <input type="text" value={options.secondaryLabelText} placeholder="中奥致远" onChange={(event) => updateStringOption('secondaryLabelText', event.target.value)} />
              </label>
              <label>
                <span>文字凸起 mm</span>
                <input type="number" value={options.labelRaisedMm} min="0.4" max="3" step="0.1" onChange={(event) => updateOption('labelRaisedMm', event.target.value)} />
              </label>
              <label>
                <span>底座网格</span>
                <input type="number" value={options.baseGridResolution} min="18" max="96" step="2" onChange={(event) => updateOption('baseGridResolution', event.target.value)} />
              </label>
                </div>
              </details>
              </ControlSection>

              <ControlSection icon="palette" title="③ 打印外观" description="颜色分件策略、色带配置和耗材类型。">
              <div className="terrain-model-color-mode-switch" aria-label="色彩模式">
                {['elevation', 'satellite'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={options.colorMode === mode ? 'is-active' : ''}
                    onClick={() => {
                      setModel(null)
                      setSurfaceTexture(null)
                      setSurfaceTextureStatus({ tone: 'idle', label: '等待模型' })
                      setOptions((current) => ({
                        ...current,
                        colorMode: mode,
                        terrainColorBandsEnabled: mode === 'satellite' ? false : true,
                        snowlineEnabled: mode === 'satellite' ? false : current.snowlineEnabled,
                        snowlineElevationMeters: mode === 'satellite' ? '' : current.snowlineElevationMeters,
                      }))
                    }}
                  >
                    {mode === 'elevation' ? '海拔分层' : '卫星色彩映射'}
                  </button>
                ))}
              </div>
              {options.colorMode === 'elevation' && (
                <div className="terrain-model-elevation-bands" aria-label="海拔分层配置">
                  <div className="terrain-model-preset-row" aria-label="色彩预设">
                    {Object.entries({
                      classic: { name: '经典地形', icon: 'terrain' },
                      monochrome: { name: '极简黑白', icon: 'contrast' },
                      inferno: { name: '炽热轨迹', icon: 'local_fire_department' },
                      alps: { name: '阿尔卑斯', icon: 'landscape' },
                    }).map(([presetKey, preset]) => (
                      <button
                        key={presetKey}
                        type="button"
                        onClick={() => {
                          setModel(null)
                          setSurfaceTexture(null)
                          setSurfaceTextureStatus({ tone: 'idle', label: '等待模型' })
                          const presetBands = {
                            classic: [
                              { name: '低地', percentile: 0.28, color: '#2E8B57', thicknessMm: 0.5 },
                              { name: '丘陵', percentile: 0.50, color: '#8B9A46', thicknessMm: 0.5 },
                              { name: '中山', percentile: 0.72, color: '#B8964E', thicknessMm: 0.5 },
                              { name: '高山', percentile: 0.90, color: '#9E8E7E', thicknessMm: 0.5 },
                              { name: '雪冠', percentile: 1.0, color: '#F0EDE5', thicknessMm: 0.5 },
                            ],
                            monochrome: [
                              { name: '底层', percentile: 0.40, color: '#4A4A4A', thicknessMm: 0.45 },
                              { name: '中层', percentile: 0.70, color: '#8A8A8A', thicknessMm: 0.45 },
                              { name: '高层', percentile: 0.90, color: '#BEBEBE', thicknessMm: 0.45 },
                              { name: '顶层', percentile: 1.0, color: '#F5F5F5', thicknessMm: 0.45 },
                            ],
                            inferno: [
                              { name: '低地', percentile: 0.25, color: '#4A1C0E', thicknessMm: 0.5 },
                              { name: '缓坡', percentile: 0.50, color: '#A83C1C', thicknessMm: 0.5 },
                              { name: '陡坡', percentile: 0.75, color: '#E8863A', thicknessMm: 0.5 },
                              { name: '山脊', percentile: 0.92, color: '#F5D45A', thicknessMm: 0.5 },
                              { name: '峰顶', percentile: 1.0, color: '#FFF8E7', thicknessMm: 0.5 },
                            ],
                            alps: [
                              { name: '谷地', percentile: 0.22, color: '#3D7A3E', thicknessMm: 0.5 },
                              { name: '林线', percentile: 0.48, color: '#6B8C42', thicknessMm: 0.5 },
                              { name: '草甸', percentile: 0.66, color: '#B5A87A', thicknessMm: 0.5 },
                              { name: '岩壁', percentile: 0.82, color: '#8B7D6B', thicknessMm: 0.5 },
                              { name: '冰川', percentile: 0.94, color: '#D4D9DF', thicknessMm: 0.5 },
                              { name: '雪峰', percentile: 1.0, color: '#F8F9FA', thicknessMm: 0.5 },
                            ],
                          }[presetKey]
                          setOptions((current) => ({
                            ...current,
                            terrainColorBandsEnabled: true,
                            elevationBands: presetBands,
                          }))
                        }}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">{preset.icon}</span>
                        <strong>{preset.name}</strong>
                      </button>
                    ))}
                  </div>
                  <div className="terrain-model-band-editor" aria-label="色带列表">
                    <div className="terrain-model-band-head" aria-hidden="true">
                      <span>颜色</span>
                      <span>名称</span>
                      <span>占比 %</span>
                      <span />
                    </div>
                    {options.elevationBands.map((band, index) => (
                      <div key={index} className="terrain-model-band-row">
                        <label className="terrain-model-band-color" title="点击修改颜色">
                          <span className="terrain-model-band-swatch" style={{ background: band.color }} />
                          <input
                            type="color"
                            value={band.color}
                            aria-label="颜色"
                            onChange={(event) => {
                              resetGeneratedOutputs()
                              setOptions((current) => {
                                const next = [...current.elevationBands]
                                next[index] = { ...next[index], color: event.target.value }
                                return { ...current, elevationBands: next }
                              })
                            }}
                          />
                        </label>
                        <input
                          className="terrain-model-band-name"
                          type="text"
                          value={band.name}
                          maxLength={10}
                          aria-label="名称"
                          onChange={(event) => {
                            resetGeneratedOutputs()
                            setOptions((current) => {
                              const next = [...current.elevationBands]
                              next[index] = { ...next[index], name: event.target.value }
                              return { ...current, elevationBands: next }
                            })
                          }}
                        />
                        <input
                          className="terrain-model-band-pct"
                          type="number"
                          value={Math.round(band.percentile * 100)}
                          min={index === 0 ? 5 : Math.round((options.elevationBands[index - 1]?.percentile || 0) * 100) + 1}
                          max={index === options.elevationBands.length - 1 ? 100 : 99}
                          step="1"
                          aria-label="占比"
                          onChange={(event) => {
                            resetGeneratedOutputs()
                            setOptions((current) => {
                              const next = [...current.elevationBands]
                              next[index] = { ...next[index], percentile: Number(event.target.value) / 100 }
                              return { ...current, elevationBands: next }
                            })
                          }}
                        />
                        {options.elevationBands.length > 2 ? (
                          <button
                            type="button"
                            className="terrain-model-band-remove"
                            title="删除色带"
                            onClick={() => {
                              resetGeneratedOutputs()
                              setOptions((current) => ({
                                ...current,
                                elevationBands: current.elevationBands.filter((_, i) => i !== index),
                              }))
                            }}
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">close</span>
                          </button>
                        ) : (
                          <span className="terrain-model-band-remove terrain-model-band-remove--empty" aria-hidden="true" />
                        )}
                      </div>
                    ))}
                    {options.elevationBands.length < 7 && (
                      <button
                        type="button"
                        className="terrain-model-band-add"
                        onClick={() => {
                          resetGeneratedOutputs()
                          setOptions((current) => {
                            const last = current.elevationBands[current.elevationBands.length - 1]
                            const newPercentile = Math.min(1, (last?.percentile || 0.9) - 0.05)
                            return {
                              ...current,
                              elevationBands: [...current.elevationBands, {
                                name: '色带 ' + (current.elevationBands.length + 1),
                                percentile: newPercentile > (last?.percentile || 0.9) ? 1 : newPercentile + 0.1,
                                color: '#808080',
                                thicknessMm: 0.5,
                              }],
                            }
                          })
                        }}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">add</span> 添加色带
                      </button>
                    )}
                  </div>
                  <label>
                    <span>色带互锁 mm</span>
                    <input type="number" value={options.bandInterlockMm} min="0.05" max="0.5" step="0.05" disabled={!options.terrainColorBandsEnabled} onChange={(event) => updateOption('bandInterlockMm', event.target.value)} />
                  </label>
                </div>
              )}
              {options.colorMode === 'satellite' && (
                <div className="terrain-model-satellite-config" aria-label="卫星色彩配置">
                  <p className="terrain-model-satellite-hint">色彩由卫星图自动提取，并按可打印材料色压缩。请确保已开启贴图预览。</p>
                  <label>
                    <span>卫星来源</span>
                    <select
                      value={surfaceTextureSourceKey}
                      onChange={(event) => {
                        setSurfaceTextureSourceKey(event.target.value)
                        setSurfaceTextureGoogleSession(null)
                        setSurfaceTexture(null)
                        setSurfaceTextureStatus({ tone: 'idle', label: model ? '等待生成' : '等待模型' })
                      }}
                    >
                      {Object.values(SURFACE_TEXTURE_SOURCES).map((source) => (
                        <option key={source.key} value={source.key}>{source.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>色彩策略</span>
                    <select value={options.satelliteColorStrategy} onChange={(event) => updateStringOption('satelliteColorStrategy', event.target.value)}>
                      {SATELLITE_COLOR_STRATEGY_OPTIONS.map((strategy) => (
                        <option key={strategy.key} value={strategy.key}>{strategy.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>色彩数量</span>
                    <input type="number" value={options.satelliteColorCount} min="4" max="7" step="1" onChange={(event) => updateOption('satelliteColorCount', event.target.value)} />
                  </label>
                  <label>
                    <span>地貌色上限</span>
                    <input type="number" value={options.satelliteTerrainColorLimit} min="0" max="7" step="1" onChange={(event) => updateOption('satelliteTerrainColorLimit', event.target.value)} />
                  </label>
                  <label>
                    <span>小色块 mm2</span>
                    <input type="number" value={options.satelliteMinPatchAreaMm2} min="0" max="5000" step="5" onChange={(event) => updateOption('satelliteMinPatchAreaMm2', event.target.value)} />
                  </label>
                  <label>
                    <span>色彩平滑</span>
                    <input type="range" value={options.satelliteColorSmoothing} min="0" max="100" step="5" onChange={(event) => updateOption('satelliteColorSmoothing', event.target.value)} />
                  </label>
                  {model?.colorBands?.satelliteBands && (
                    <div className="terrain-model-satellite-metrics" aria-label="卫星色彩打印状态">
                      <div>
                        <span>材料槽</span>
                        <strong>{(model.colorBands.satelliteBands.materialBudget?.reservedSlots || 0) + (model.colorBands.satelliteBands.bandCount || 0)}/{model.colorBands.satelliteBands.materialBudget?.maxSlots || 6}</strong>
                      </div>
                      <div>
                        <span>地貌色</span>
                        <strong>{model.colorBands.satelliteBands.bandCount || 0}/{model.colorBands.satelliteBands.materialBudget?.terrainColorLimit || options.satelliteColorCount}</strong>
                      </div>
                      <div>
                        <span>小色块</span>
                        <strong>{model.colorBands.satelliteBands.cleanup?.mergedPatchCount || 0}</strong>
                      </div>
                    </div>
                  )}
                  {model?.colorBands?.satelliteBands?.clusterCenters && (
                    <div className="terrain-model-cluster-preview" aria-label="提取色彩">
                      {model.colorBands.satelliteBands.clusterCenters.map((center, index) => (
                        <div key={index} className="terrain-model-cluster-swatch">
                          <span className="terrain-model-cluster-color" style={{ background: center.hex }} />
                          <code>{center.hex}</code>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="terrain-model-section-divider" />
              <label>
                <span>耗材类型</span>
                <select value={options.filamentType} onChange={(event) => {
                  resetGeneratedOutputs()
                  setOptions((current) => ({ ...current, filamentType: event.target.value }))
                }}>
                  {['PLA Basic', 'PLA Matte', 'PLA Silk', 'PETG', 'ABS'].map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>
              </ControlSection>

              <ControlSection icon="layers" title="④ 表现细节" description="等高线、雪线和轨迹的线宽盖厚，按需开启。" collapsible defaultOpen={false}>
              <label>
                <span>等高距 m</span>
                <input type="number" value={options.contourIntervalMeters} min="5" max="500" step="5" disabled={!options.contourEnabled} onChange={(event) => updateOption('contourIntervalMeters', event.target.value)} />
              </label>
              <label>
                <span>等高线宽 mm</span>
                <input type="number" value={options.contourWidthMm} min="0.2" max="2" step="0.05" disabled={!options.contourEnabled} onChange={(event) => updateOption('contourWidthMm', event.target.value)} />
              </label>
              <label>
                <span>等高线高 mm</span>
                <input type="number" value={options.contourHeightMm} min="0.1" max="1.5" step="0.05" disabled={!options.contourEnabled} onChange={(event) => updateOption('contourHeightMm', event.target.value)} />
              </label>
              <label>
                <span>低地百分位</span>
                <input type="number" value={options.lowlandPercentile} min="5" max="60" step="1" disabled={options.colorMode === 'satellite' || !options.terrainColorBandsEnabled} onChange={(event) => updateOption('lowlandPercentile', event.target.value)} />
              </label>
              <label>
                <span>低地盖厚 mm</span>
                <input type="number" value={options.lowlandCapThicknessMm} min="0.2" max="1.5" step="0.05" disabled={options.colorMode === 'satellite' || !options.terrainColorBandsEnabled} onChange={(event) => updateOption('lowlandCapThicknessMm', event.target.value)} />
              </label>
              <label>
                <span>雪线 m</span>
                <input type="number" value={options.snowlineElevationMeters} min="-500" max="9000" step="10" disabled={!options.snowlineEnabled} onChange={(event) => updateOptionalNumberOption('snowlineElevationMeters', event.target.value)} />
              </label>
              <label>
                <span>雪线百分位</span>
                <input type="number" value={options.snowlinePercentile} min="50" max="98" step="1" disabled={!options.snowlineEnabled || options.snowlineElevationMeters !== ''} onChange={(event) => updateOption('snowlinePercentile', event.target.value)} />
              </label>
              <label>
                <span>雪盖厚 mm</span>
                <input type="number" value={options.snowCapThicknessMm} min="0.2" max="1.5" step="0.05" disabled={!options.snowlineEnabled} onChange={(event) => updateOption('snowCapThicknessMm', event.target.value)} />
              </label>
              <label>
                <span>轨迹宽 mm</span>
                <input type="number" value={options.trackWidthMm} min="0.4" max="8" step="0.1" onChange={(event) => updateOption('trackWidthMm', event.target.value)} />
              </label>
              <label>
                <span>轨迹高 mm</span>
                <input type="number" value={options.trackHeightMm} min="0.2" max="6" step="0.1" onChange={(event) => updateOption('trackHeightMm', event.target.value)} />
              </label>
              </ControlSection>

              <ControlSection icon="satellite_alt" title="⑤ 贴图预览" description="卫星影像用于 GLB 和客户预览；STL/3MF 仍以分件分色打印为准。" collapsible defaultOpen={surfaceTextureEnabled}>
              <label className="terrain-model-check terrain-model-check--field">
                <span>卫星贴图</span>
                <span className="terrain-model-check__control">
                  <span className="terrain-model-check__state">{surfaceTextureEnabled ? '已开启' : '关闭'}</span>
                  <input
                    type="checkbox"
                    checked={surfaceTextureEnabled}
                    onChange={(event) => {
                      const enabled = event.target.checked
                      setSurfaceTextureEnabled(enabled)
                      if (!enabled) {
                        setSurfaceTexture(null)
                        setSurfaceTextureStatus({ tone: 'idle', label: '等待模型' })
                      }
                    }}
                  />
                  <span className="material-symbols-outlined terrain-model-check__indicator" aria-hidden="true">check</span>
                </span>
              </label>
              <label>
                <span>贴图源</span>
                <select
                  value={surfaceTextureSourceKey}
                  disabled={!surfaceTextureEnabled}
                  onChange={(event) => {
                    setSurfaceTextureSourceKey(event.target.value)
                    setSurfaceTextureGoogleSession(null)
                    setSurfaceTexture(null)
                    setSurfaceTextureStatus({ tone: 'idle', label: model ? '等待生成' : '等待模型' })
                  }}
                >
                  {Object.values(SURFACE_TEXTURE_SOURCES).map((source) => (
                    <option key={source.key} value={source.key}>{source.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>贴图精度</span>
                <select
                  value={surfaceTextureQuality}
                  disabled={!surfaceTextureEnabled}
                  onChange={(event) => {
                    setSurfaceTextureQuality(event.target.value)
                    setSurfaceTexture(null)
                    setSurfaceTextureStatus({ tone: 'idle', label: model ? '等待生成' : '等待模型' })
                  }}
                >
                  {Object.entries(SURFACE_TEXTURE_QUALITY_PRESETS).map(([key, preset]) => (
                    <option key={key} value={key}>{preset.label}</option>
                  ))}
                </select>
              </label>
              {surfaceTextureSourceKey === 'googleSatellite' && (
                <label>
                  <span>Google Maps Tiles API Key</span>
                  <input
                    type="password"
                    value={surfaceTextureGoogleApiKey}
                    placeholder="Maps Tiles API Key"
                    autoComplete="off"
                    disabled={!surfaceTextureEnabled}
                    onChange={(event) => {
                      setSurfaceTextureGoogleApiKey(event.target.value)
                      setSurfaceTextureGoogleSession(null)
                      setSurfaceTexture(null)
                      setSurfaceTextureStatus({ tone: 'idle', label: model ? '等待生成' : '等待模型' })
                    }}
                  />
                </label>
              )}
              {surfaceTextureSourceKey === 'cesiumIonRaster' && (
                <>
                  <label>
                    <span>Cesium ion Token</span>
                    <input
                      type="password"
                      value={surfaceTextureCesiumAccessToken}
                      placeholder="VITE_CESIUM_ION_TOKEN"
                      autoComplete="off"
                      disabled={!surfaceTextureEnabled}
                      onChange={(event) => {
                        setSurfaceTextureCesiumAccessToken(event.target.value)
                        setSurfaceTexture(null)
                        setSurfaceTextureStatus({ tone: 'idle', label: model ? '等待生成' : '等待模型' })
                      }}
                    />
                  </label>
                  <label>
                    <span>Cesium ion Asset ID</span>
                    <input
                      type="text"
                      value={surfaceTextureCesiumAssetId}
                      placeholder="Raster imagery asset"
                      disabled={!surfaceTextureEnabled}
                      onChange={(event) => {
                        setSurfaceTextureCesiumAssetId(event.target.value)
                        setSurfaceTexture(null)
                        setSurfaceTextureStatus({ tone: 'idle', label: model ? '等待生成' : '等待模型' })
                      }}
                    />
                  </label>
                  <label>
                    <span>Cesium ion URL 模板</span>
                    <input
                      type="text"
                      value={surfaceTextureCesiumUrlTemplate}
                      placeholder="https://.../{z}/{x}/{y}.png"
                      disabled={!surfaceTextureEnabled}
                      onChange={(event) => {
                        setSurfaceTextureCesiumUrlTemplate(event.target.value)
                        setSurfaceTexture(null)
                        setSurfaceTextureStatus({ tone: 'idle', label: model ? '等待生成' : '等待模型' })
                      }}
                    />
                  </label>
                </>
              )}
              <div className="terrain-model-status-strip terrain-model-status-strip--three">
                <div>
                  <span>表面贴图</span>
                  <strong>{SURFACE_TEXTURE_SOURCES[surfaceTextureSourceKey]?.name || '卫星影像'}</strong>
                </div>
                <div>
                  <span>贴图状态</span>
                  <strong className={`terrain-model-status terrain-model-status--${surfaceTextureStatus.tone}`}>
                    {surfaceTextureStatus.label}
                  </strong>
                </div>
                <div>
                  <span>预算</span>
                  <strong>
                    {SURFACE_TEXTURE_QUALITY_PRESETS[surfaceTextureQuality]?.maxTextureSize || 2048}px
                    {' / '}
                    {SURFACE_TEXTURE_QUALITY_PRESETS[surfaceTextureQuality]?.maxTiles || 24} tiles
                  </strong>
                </div>
              </div>
              <div className="terrain-model-action-row terrain-model-action-row--single">
                <button
                  type="button"
                  disabled={!surfaceTextureEnabled || !model || buildingSurfaceTexture}
                  onClick={() => buildSurfaceTextureForModel(model)}
                >
                  <span className="material-symbols-outlined">satellite_alt</span>
                  <span>{buildingSurfaceTexture ? '生成中' : '生成贴图'}</span>
                </button>
              </div>
              </ControlSection>
            </div>
          </div>
        </div>

        <div className="terrain-model-right">
          <section className="terrain-model-toolbar">
            <label className="terrain-model-file terrain-model-file--gpx">
              <input type="file" accept=".gpx,application/gpx+xml" onChange={handleFileChange} />
              <span className="material-symbols-outlined">upload_file</span>
              <span>{fileName || '选择 GPX'}</span>
            </label>
            <div className="terrain-model-toolbar__row">
              <label className="terrain-model-file terrain-model-file--dem">
                <input type="file" accept=".asc,.txt,.dem,.grd,text/plain" onChange={handleDemFileChange} />
                <span className="material-symbols-outlined">terrain</span>
                <span>{demFileName || '高精 DEM'}</span>
              </label>
              <label className="terrain-model-toggle">
                <input
                  type="checkbox"
                  checked={useSampledTerrain}
                  disabled={Boolean(demRaster)}
                  onChange={(event) => updateUseSampledTerrain(event.target.checked)}
                />
                <span>ArcGIS 高程</span>
              </label>
            </div>
            <button type="button" className="terrain-model-btn terrain-model-btn--primary terrain-model-btn--generate" disabled={!track || building || !manualTerrainBoundsReady} onClick={handleGenerate}>
              <span className="material-symbols-outlined">deployed_code</span>
              <span>{building ? '生成中' : '生成模型'}</span>
            </button>
            {model && (
              <div className="terrain-model-toolbar__row">
                <button type="button" className="terrain-model-btn" disabled={!model} onClick={handleDownloadZip}>
                  <span className="material-symbols-outlined">archive</span>
                  <span>{exportingFiles ? '导出中' : '下载 ZIP'}</span>
                </button>
                <button type="button" className="terrain-model-btn" disabled={!model || exportBlockedBySurfaceTexture || exportingGlb} onClick={handleDownloadGlb}>
                  <span className="material-symbols-outlined">view_in_ar</span>
                  <span>{exportBlockedBySurfaceTexture ? '等待贴图' : exportingGlb ? '导出中' : surfaceTexture ? '下载贴图 GLB' : '下载 GLB'}</span>
                </button>
              </div>
            )}
            <div className="terrain-model-toolbar__row terrain-model-toolbar__config">
              <button type="button" className="terrain-model-btn terrain-model-btn--ghost" onClick={handleExportConfig} title="导出配置">
                <span className="material-symbols-outlined">download</span>
                <span>导出配置</span>
              </button>
              <label className="terrain-model-btn terrain-model-btn--ghost terrain-model-config-file" title="导入配置">
                <input type="file" accept="application/json,.json" onChange={handleImportConfigFile} />
                <span className="material-symbols-outlined">upload</span>
                <span>导入配置</span>
              </label>
            </div>
          </section>

          <TerrainWorkflowStrip
            track={track}
            fileName={fileName}
            demRaster={demRaster}
            demFileName={demFileName}
            useSampledTerrain={useSampledTerrain}
            model={model}
            readiness={printReadiness}
            highPrecisionRecommendation={highPrecisionRecommendation}
            surfaceTexture={surfaceTexture}
            exportFiles={exportFiles}
          />

          <div className="terrain-model-panel terrain-model-panel--preview">
            <div className="terrain-model-panel__head">
              <h2>3D 预览</h2>
              <span>{model ? `${formatNumber(model.stats.modelWidthMm, ' mm')} x ${formatNumber(model.stats.modelDepthMm, ' mm')}` : '-'}</span>
            </div>
            <TerrainPreview model={model} surfaceTexture={surfaceTextureEnabled ? surfaceTexture : null} />
          </div>

          {(printRecommendation || model) && (
            <ReliefScaleMeter model={model} recommendation={activeReliefRecommendation || printRecommendation} options={options} />
          )}

          <div className="terrain-model-stats">
            <div><span>点数</span><strong>{summary?.pointCount || '-'}</strong></div>
            <div><span>距离</span><strong>{summary ? formatDistance(summary.distanceMeters) : '-'}</strong></div>
            <div><span>海拔</span><strong>{summary ? `${formatNumber(summary.minElevationMeters, ' m')} / ${formatNumber(summary.maxElevationMeters, ' m')}` : '-'}</strong></div>
            <div><span>模型高度</span><strong>{model ? formatNumber(model.stats.maxHeightMm, ' mm') : '-'}</strong></div>
            <div><span>采样</span><strong>{model ? `${model.terrain.rows} x ${model.terrain.cols}` : '-'}</strong></div>
            <div><span>面网格</span><strong>{model?.terrain?.precision?.gridSpacingMm ? formatNumber(model.terrain.precision.gridSpacingMm.min, ' mm') : '-'}</strong></div>
            <div><span>垂直夸张</span><strong>{model ? formatNumber(model.stats.verticalExaggeration, 'x') : '-'}</strong></div>
            <div><span>低地分色</span><strong>{model?.colorBands?.lowland?.enabled ? formatNumber(model.colorBands.lowland.coverageRatio * 100, '%') : '-'}</strong></div>
            <div><span>贴图</span><strong>{surfaceTexture ? surfaceTexture.source?.name || '卫星影像' : '-'}</strong></div>
          </div>

          <PrintReadinessPanel readiness={printReadiness} />

          <DeliveryPanel
            files={exportFiles}
            manifest={exportPlan?.manifest || null}
            model={model}
            exportBlocked={exportingFiles}
            onDownload={handleDownloadFile}
          />
        </div>
      </section>
    </div>
  )
}

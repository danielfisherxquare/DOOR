const OPENTOPOGRAPHY_GLOBAL_DEM_ENDPOINT = 'https://portal.opentopography.org/API/globaldem'
const METERS_PER_DEGREE_LAT = 111320

function toNumber(value, fallback = null) {
  const nextValue = Number(value)
  return Number.isFinite(nextValue) ? nextValue : fallback
}

function normalizeHeaderKey(value) {
  return String(value || '').trim().toLowerCase()
}

function readRequiredHeader(header, key) {
  const value = header.get(key)
  if (!Number.isFinite(value)) {
    throw new Error(`DEM ASCII Grid 缺少 ${key} 头信息`)
  }
  return value
}

function estimateResolutionMeters(cellSizeDegrees, bounds) {
  if (!Number.isFinite(cellSizeDegrees) || cellSizeDegrees <= 0) return null
  const centerLatitude = Number.isFinite(bounds?.south) && Number.isFinite(bounds?.north)
    ? (bounds.south + bounds.north) / 2
    : 0
  const latitudeMeters = cellSizeDegrees * METERS_PER_DEGREE_LAT
  const longitudeMeters = latitudeMeters * Math.cos((centerLatitude * Math.PI) / 180)
  return Number((Math.max(latitudeMeters, Math.abs(longitudeMeters)) || latitudeMeters).toFixed(2))
}

function normalizeWgs84Bounds(value) {
  if (!value || typeof value !== 'object') return null
  const readBound = (item) => {
    if (item === null || item === undefined || item === '') return null
    return toNumber(item)
  }
  const bounds = {
    south: readBound(value.south),
    north: readBound(value.north),
    west: readBound(value.west),
    east: readBound(value.east),
  }
  if (!Object.values(bounds).every(Number.isFinite)) return null
  if (bounds.south >= bounds.north || bounds.west >= bounds.east) return null
  return bounds
}

function unionWgs84Bounds(a, b) {
  if (!a) return b
  if (!b) return a
  return {
    south: Math.min(a.south, b.south),
    north: Math.max(a.north, b.north),
    west: Math.min(a.west, b.west),
    east: Math.max(a.east, b.east),
  }
}

function roundWgs84Bounds(bounds) {
  return {
    south: Number(bounds.south.toFixed(7)),
    north: Number(bounds.north.toFixed(7)),
    west: Number(bounds.west.toFixed(7)),
    east: Number(bounds.east.toFixed(7)),
  }
}

export function buildBufferedWgs84Bounds(points, options = {}) {
  const normalizedPoints = Array.isArray(points) ? points : []
  const validPoints = normalizedPoints
    .map((point) => ({
      latitude: toNumber(point?.latitude),
      longitude: toNumber(point?.longitude),
    }))
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
  if (!validPoints.length) {
    throw new Error('DEM 请求缺少有效轨迹范围')
  }
  const latitudes = validPoints.map((point) => point.latitude)
  const longitudes = validPoints.map((point) => point.longitude)
  const south = Math.min(...latitudes)
  const north = Math.max(...latitudes)
  const west = Math.min(...longitudes)
  const east = Math.max(...longitudes)
  const manualBounds = normalizeWgs84Bounds(
    options.terrainBoundsWgs84
      ?? options.manualTerrainBoundsWgs84
      ?? options.manualBoundsWgs84
      ?? options.boundsWgs84,
  )
  if (manualBounds) {
    return roundWgs84Bounds(unionWgs84Bounds(manualBounds, { south, north, west, east }))
  }

  const centerLatitude = (south + north) / 2
  const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos((centerLatitude * Math.PI) / 180) || METERS_PER_DEGREE_LAT
  const paddingMeters = Math.max(0, Number.isFinite(Number(options.paddingMeters)) ? Number(options.paddingMeters) : 300)
  const minSpanMeters = Math.max(60, Number.isFinite(Number(options.minSpanMeters)) ? Number(options.minSpanMeters) : 600)
  const minLatPad = Math.max(0, (minSpanMeters - Math.max(0, north - south) * METERS_PER_DEGREE_LAT) / 2)
  const minLonPad = Math.max(0, (minSpanMeters - Math.max(0, east - west) * metersPerDegreeLon) / 2)
  const latPad = (paddingMeters + minLatPad) / METERS_PER_DEGREE_LAT
  const lonPad = (paddingMeters + minLonPad) / Math.max(Math.abs(metersPerDegreeLon), 1)
  return {
    south: Number((south - latPad).toFixed(7)),
    north: Number((north + latPad).toFixed(7)),
    west: Number((west - lonPad).toFixed(7)),
    east: Number((east + lonPad).toFixed(7)),
  }
}

export function parseArcAsciiGrid(text, metadata = {}) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const header = new Map()
  const dataLines = []

  lines.forEach((line) => {
    const [rawKey, ...rest] = line.split(/\s+/)
    const key = normalizeHeaderKey(rawKey)
    if (rest.length === 1 && /^[a-z_]+$/i.test(rawKey) && dataLines.length === 0) {
      header.set(key, toNumber(rest[0]))
    } else {
      dataLines.push(line)
    }
  })

  const cols = readRequiredHeader(header, 'ncols')
  const rows = readRequiredHeader(header, 'nrows')
  const cellSize = readRequiredHeader(header, 'cellsize')
  const xllCorner = header.get('xllcorner')
  const xllCenter = header.get('xllcenter')
  const yllCorner = header.get('yllcorner')
  const yllCenter = header.get('yllcenter')
  const west = Number.isFinite(xllCenter) ? xllCenter - cellSize / 2 : xllCorner
  const south = Number.isFinite(yllCenter) ? yllCenter - cellSize / 2 : yllCorner
  if (!Number.isFinite(west) || !Number.isFinite(south)) {
    throw new Error('DEM ASCII Grid 缺少 xllcorner/xllcenter 或 yllcorner/yllcenter')
  }
  const noDataValue = Number.isFinite(header.get('nodata_value')) ? header.get('nodata_value') : -9999
  const values = dataLines
    .join(' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((value) => {
      const number = toNumber(value)
      if (!Number.isFinite(number) || number === noDataValue) return null
      return number
    })

  const expectedCount = cols * rows
  if (values.length !== expectedCount) {
    throw new Error(`DEM ASCII Grid 数据量不匹配：期望 ${expectedCount} 个高程值，实际 ${values.length} 个`)
  }

  const bounds = {
    west,
    east: west + cols * cellSize,
    south,
    north: south + rows * cellSize,
  }

  return {
    format: 'AAIGrid',
    sourceName: metadata.sourceName || 'arc-ascii-grid',
    sourceType: metadata.sourceType || 'uploaded-aaigrid-dem',
    demType: metadata.demType || null,
    requestBoundsWgs84: metadata.requestBoundsWgs84 || null,
    resolutionMeters: Number.isFinite(Number(metadata.resolutionMeters))
      ? Number(metadata.resolutionMeters)
      : estimateResolutionMeters(cellSize, bounds),
    cols,
    rows,
    cellSizeDegrees: cellSize,
    noDataValue,
    bounds,
    values,
  }
}

function isInsideRaster(raster, point) {
  return point.longitude >= raster.bounds.west
    && point.longitude <= raster.bounds.east
    && point.latitude >= raster.bounds.south
    && point.latitude <= raster.bounds.north
}

export function createRasterElevationSampler(raster, options = {}) {
  const interpolation = options.interpolation || 'bilinear'
  const valueAt = (row, col) => {
    if (row < 0 || row >= raster.rows || col < 0 || col >= raster.cols) return null
    return raster.values[row * raster.cols + col]
  }
  return (point) => {
    const longitude = Number(point.longitude)
    const latitude = Number(point.latitude)
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
    if (!isInsideRaster(raster, { latitude, longitude })) return null

    const epsilon = 1e-9
    const rawColFloat = (longitude - raster.bounds.west) / raster.cellSizeDegrees - 0.5
    const rawRowFloat = (raster.bounds.north - latitude) / raster.cellSizeDegrees - 0.5
    if (rawColFloat < -epsilon || rawRowFloat < -epsilon || rawColFloat > raster.cols - 1 + epsilon || rawRowFloat > raster.rows - 1 + epsilon) {
      return null
    }
    const colFloat = Math.min(Math.max(rawColFloat, 0), raster.cols - 1)
    const rowFloat = Math.min(Math.max(rawRowFloat, 0), raster.rows - 1)

    const nearestCol = Math.round(colFloat)
    const nearestRow = Math.round(rowFloat)
    const nearestValue = valueAt(nearestRow, nearestCol)
    if (interpolation === 'nearest') return nearestValue

    const leftCol = Math.floor(colFloat)
    const topRow = Math.floor(rowFloat)
    const rightCol = Math.min(leftCol + 1, raster.cols - 1)
    const bottomRow = Math.min(topRow + 1, raster.rows - 1)
    const tx = colFloat - leftCol
    const ty = rowFloat - topRow
    const topLeft = valueAt(topRow, leftCol)
    if (Math.abs(tx) < 1e-9 && Math.abs(ty) < 1e-9) return topLeft

    const topRight = valueAt(topRow, rightCol)
    const bottomLeft = valueAt(bottomRow, leftCol)
    const bottomRight = valueAt(bottomRow, rightCol)
    if (![topLeft, topRight, bottomLeft, bottomRight].every(Number.isFinite)) {
      return nearestValue
    }

    const top = topLeft * (1 - tx) + topRight * tx
    const bottom = bottomLeft * (1 - tx) + bottomRight * tx
    return top * (1 - ty) + bottom * ty
  }
}

export function sampleRasterElevations(points, raster, options = {}) {
  const sampler = createRasterElevationSampler(raster, options)
  return points.map((point) => sampler(point))
}

export function buildOpenTopographyGlobalDemUrl({
  demType = 'COP30',
  bounds,
  apiKey,
  outputFormat = 'AAIGrid',
  endpoint = OPENTOPOGRAPHY_GLOBAL_DEM_ENDPOINT,
} = {}) {
  if (!apiKey) {
    throw new Error('OpenTopography API_Key 缺失')
  }
  const south = toNumber(bounds?.south)
  const north = toNumber(bounds?.north)
  const west = toNumber(bounds?.west)
  const east = toNumber(bounds?.east)
  if (![south, north, west, east].every(Number.isFinite) || south >= north || west >= east) {
    throw new Error('OpenTopography DEM 请求范围无效')
  }
  const url = new URL(endpoint)
  url.searchParams.set('demtype', demType)
  url.searchParams.set('south', String(south))
  url.searchParams.set('north', String(north))
  url.searchParams.set('west', String(west))
  url.searchParams.set('east', String(east))
  url.searchParams.set('outputFormat', outputFormat)
  url.searchParams.set('API_Key', apiKey)
  return url
}

export async function fetchOpenTopographyGlobalAsciiGrid(options = {}) {
  const url = buildOpenTopographyGlobalDemUrl({ ...options, outputFormat: 'AAIGrid' })
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : fetch
  const response = await fetchImpl(url)
  if (!response.ok) {
    throw new Error(`OpenTopography DEM 请求失败：HTTP ${response.status}`)
  }
  return parseArcAsciiGrid(await response.text(), {
    sourceName: `OpenTopography ${options.demType || 'COP30'}`,
    sourceType: 'opentopography-globaldem',
    demType: options.demType || 'COP30',
    requestBoundsWgs84: options.bounds || null,
    resolutionMeters: options.resolutionMeters,
  })
}

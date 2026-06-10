import { sanitizeElevationSeries } from './elevation.js'

const XML_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeXmlText(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&([a-z]+);/gi, (_, entity) => XML_ENTITIES[entity] || `&${entity};`)
    .trim()
}

function getAttribute(source, name) {
  const match = String(source || '').match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))
  return match ? match[1] : ''
}

function getFirstTagText(source, tagName) {
  const match = String(source || '').match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'))
  return match ? decodeXmlText(match[1]) : ''
}

function pickTrackName(gpxText) {
  const trackBlock = String(gpxText || '').match(/<trk\b[^>]*>([\s\S]*?)<\/trk>/i)?.[1] || ''
  return getFirstTagText(trackBlock, 'name')
    || getFirstTagText(gpxText, 'name')
    || '未命名轨迹'
}

function parsePointElements(gpxText) {
  const points = []
  const pattern = /<(trkpt|rtept)\b([^>]*)>([\s\S]*?)<\/\1>/gi
  let match = pattern.exec(gpxText)
  while (match) {
    const attrs = match[2] || ''
    const body = match[3] || ''
    const latitude = Number(getAttribute(attrs, 'lat'))
    const longitude = Number(getAttribute(attrs, 'lon'))
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      const elevationText = getFirstTagText(body, 'ele')
      const elevation = Number(elevationText)
      points.push({
        latitude,
        longitude,
        elevation: Number.isFinite(elevation) ? elevation : null,
      })
    }
    match = pattern.exec(gpxText)
  }
  return points
}

function haversineDistanceMeters(left, right) {
  const earthRadiusMeters = 6371000
  const toRadians = (value) => (value * Math.PI) / 180
  const dLat = toRadians(right.latitude - left.latitude)
  const dLon = toRadians(right.longitude - left.longitude)
  const lat1 = toRadians(left.latitude)
  const lat2 = toRadians(right.latitude)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a))
}

export function parseGpxTrack(gpxText) {
  if (!String(gpxText || '').trim()) {
    throw new Error('GPX 文件为空')
  }

  const points = parsePointElements(String(gpxText))
  if (points.length < 2) {
    throw new Error('GPX 至少需要包含 2 个轨迹点')
  }

  return {
    kind: 'gpx-track',
    name: pickTrackName(gpxText),
    points,
  }
}

export function summarizeTrack(points) {
  const normalized = Array.isArray(points) ? points : []
  let distanceMeters = 0
  const elevations = []

  normalized.forEach((point, index) => {
    if (index > 0) {
      distanceMeters += haversineDistanceMeters(normalized[index - 1], point)
    }
    if (Number.isFinite(point.elevation)) {
      elevations.push(point.elevation)
    }
  })

  const sanitizedElevations = sanitizeElevationSeries(elevations).values.filter(Number.isFinite)
  const usableElevations = sanitizedElevations.length ? sanitizedElevations : elevations
  const hasElevation = usableElevations.length > 0
  const minElevationMeters = hasElevation ? Math.min(...usableElevations) : null
  const maxElevationMeters = hasElevation ? Math.max(...usableElevations) : null

  return {
    pointCount: normalized.length,
    distanceMeters: Number(distanceMeters.toFixed(2)),
    minElevationMeters,
    maxElevationMeters,
    elevationGainMeters: hasElevation ? Number((maxElevationMeters - minElevationMeters).toFixed(2)) : null,
  }
}

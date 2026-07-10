import { pickNumber, round } from './numeric.js'

export function normalizeWgs84Bounds(value) {
  if (!value || typeof value !== 'object') return null
  const readBound = (item) => {
    if (item === null || item === undefined || item === '') return Number.NaN
    const number = Number(item)
    return Number.isFinite(number) ? number : Number.NaN
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

export function normalizeWgs84Footprint(value) {
  if (!Array.isArray(value)) return null
  const points = value
    .map((point) => {
      const latitude = Number(point?.latitude ?? point?.lat)
      const longitude = Number(point?.longitude ?? point?.lon ?? point?.lng)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
      return {
        latitude: round(latitude, 7),
        longitude: round(longitude, 7),
      }
    })
    .filter(Boolean)

  if (points.length > 1) {
    const first = points[0]
    const last = points[points.length - 1]
    if (first.latitude === last.latitude && first.longitude === last.longitude) points.pop()
  }
  return points.length >= 3 ? points.slice(0, 96) : null
}

export function getWgs84BoundsFromFootprint(footprint) {
  if (!Array.isArray(footprint) || footprint.length < 3) return null
  const latitudes = footprint.map((point) => point.latitude)
  const longitudes = footprint.map((point) => point.longitude)
  return normalizeWgs84Bounds({
    south: Math.min(...latitudes),
    north: Math.max(...latitudes),
    west: Math.min(...longitudes),
    east: Math.max(...longitudes),
  })
}

export function roundWgs84Bounds(bounds) {
  if (!bounds) return null
  return {
    south: round(bounds.south, 7),
    north: round(bounds.north, 7),
    west: round(bounds.west, 7),
    east: round(bounds.east, 7),
  }
}

export function roundWgs84Footprint(footprint) {
  const normalized = normalizeWgs84Footprint(footprint)
  return normalized
    ? normalized.map((point) => ({
        latitude: round(point.latitude, 7),
        longitude: round(point.longitude, 7),
      }))
    : null
}

function computeOrigin(points) {
  const totals = points.reduce(
    (acc, point) => ({
      latitude: acc.latitude + pickNumber(point.latitude),
      longitude: acc.longitude + pickNumber(point.longitude),
    }),
    { latitude: 0, longitude: 0 },
  )
  return {
    latitude: totals.latitude / points.length,
    longitude: totals.longitude / points.length,
  }
}

export function createProjection(points) {
  const origin = computeOrigin(points)
  const metersPerDegreeLat = 111320
  const metersPerDegreeLon = metersPerDegreeLat * Math.cos((origin.latitude * Math.PI) / 180) || 1
  return {
    origin,
    toLocal(point) {
      return {
        x: (pickNumber(point.longitude) - origin.longitude) * metersPerDegreeLon,
        z: (pickNumber(point.latitude) - origin.latitude) * metersPerDegreeLat,
        elevation: Number.isFinite(point.elevation) ? point.elevation : null,
      }
    },
    toWgs84(local) {
      return {
        latitude: origin.latitude + pickNumber(local.z) / metersPerDegreeLat,
        longitude: origin.longitude + pickNumber(local.x) / metersPerDegreeLon,
      }
    },
  }
}

function rotateLocalPoint(point, center, degrees) {
  const radians = (degrees * Math.PI) / 180
  const sin = Math.sin(radians)
  const cos = Math.cos(radians)
  const x = pickNumber(point?.x)
  const z = pickNumber(point?.z)
  const dx = x - center.x
  const dz = z - center.z
  return {
    x: center.x + dx * cos - dz * sin,
    z: center.z + dx * sin + dz * cos,
  }
}

export function getLocalFootprintFromWgs84(footprint, projection) {
  if (!Array.isArray(footprint) || footprint.length < 3 || !projection) return null
  const points = footprint
    .map((point) => projection.toLocal({ latitude: point.latitude, longitude: point.longitude }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z))
    .map((point) => ({ x: point.x, z: point.z }))
  return points.length >= 3 ? points : null
}

function getLocalFootprintCenter(footprint, projection) {
  const localFootprint = getLocalFootprintFromWgs84(footprint, projection)
  if (!localFootprint) return null
  const minX = Math.min(...localFootprint.map((point) => point.x))
  const maxX = Math.max(...localFootprint.map((point) => point.x))
  const minZ = Math.min(...localFootprint.map((point) => point.z))
  const maxZ = Math.max(...localFootprint.map((point) => point.z))
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return null
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }
}

export function normalizeTerrainFootprintRotationDegrees(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  const normalized = ((number % 360) + 360) % 360
  const signed = normalized > 180 ? normalized - 360 : normalized
  return Math.abs(signed) < 0.0001 ? 0 : Number(signed.toFixed(4))
}

export function createAlignedTerrainProjection(baseProjection, options = {}) {
  const footprintRotationDegrees = normalizeTerrainFootprintRotationDegrees(options.terrainFootprintRotationDegrees)
  if (!options.terrainFootprintWgs84 || Math.abs(footprintRotationDegrees) < 0.0001) {
    return {
      projection: baseProjection,
      footprintRotationDegrees: 0,
      exportAlignmentDegrees: 0,
      centerLocal: null,
    }
  }

  const centerLocal = getLocalFootprintCenter(options.terrainFootprintWgs84, baseProjection)
  if (!centerLocal) {
    return {
      projection: baseProjection,
      footprintRotationDegrees: 0,
      exportAlignmentDegrees: 0,
      centerLocal: null,
    }
  }

  const exportAlignmentDegrees = -footprintRotationDegrees
  return {
    projection: {
      origin: baseProjection.origin,
      toLocal(point) {
        const local = baseProjection.toLocal(point)
        const aligned = rotateLocalPoint(local, centerLocal, exportAlignmentDegrees)
        return {
          ...aligned,
          elevation: Number.isFinite(local.elevation) ? local.elevation : null,
        }
      },
      toWgs84(local) {
        const unaligned = rotateLocalPoint(local, centerLocal, footprintRotationDegrees)
        return baseProjection.toWgs84(unaligned)
      },
    },
    footprintRotationDegrees,
    exportAlignmentDegrees,
    centerLocal,
  }
}

export function getWgs84BoundsFromLocalBounds(bounds, projection) {
  if (!bounds || !projection) return null
  const corners = [
    { x: bounds.minX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.minZ },
    { x: bounds.maxX, z: bounds.maxZ },
    { x: bounds.minX, z: bounds.maxZ },
  ].map((corner) => projection.toWgs84(corner))
  return roundWgs84Bounds({
    south: Math.min(...corners.map((point) => point.latitude)),
    north: Math.max(...corners.map((point) => point.latitude)),
    west: Math.min(...corners.map((point) => point.longitude)),
    east: Math.max(...corners.map((point) => point.longitude)),
  })
}

export function getLocalBoundsFromWgs84(bounds, projection) {
  if (!bounds || !projection) return null
  const southwest = projection.toLocal({ latitude: bounds.south, longitude: bounds.west })
  const northeast = projection.toLocal({ latitude: bounds.north, longitude: bounds.east })
  const minX = Math.min(southwest.x, northeast.x)
  const maxX = Math.max(southwest.x, northeast.x)
  const minZ = Math.min(southwest.z, northeast.z)
  const maxZ = Math.max(southwest.z, northeast.z)
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || minX >= maxX || minZ >= maxZ) return null
  return { minX, maxX, minZ, maxZ }
}

export function getLocalBoundsFromFootprint(footprint, projection) {
  const points = getLocalFootprintFromWgs84(footprint, projection)
  if (!points) return null
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minZ = Math.min(...points.map((point) => point.z))
  const maxZ = Math.max(...points.map((point) => point.z))
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || minX >= maxX || minZ >= maxZ) return null
  return { minX, maxX, minZ, maxZ }
}

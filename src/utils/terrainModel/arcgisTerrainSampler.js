import * as Cesium from 'cesium'

const ARCGIS_TERRAIN_URL = 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'

let providerPromise = null

async function getTerrainProvider() {
  if (!providerPromise) {
    providerPromise = Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(ARCGIS_TERRAIN_URL)
  }
  return providerPromise
}

function normalizeChunkSize(value) {
  return Math.max(256, Math.min(Math.round(Number(value) || 9000), 12000))
}

export function createTerrainSampleBatches(points, options = {}) {
  const normalizedPoints = Array.isArray(points) ? points : []
  const chunkSize = normalizeChunkSize(options.chunkSize)
  const batches = []
  for (let index = 0; index < normalizedPoints.length; index += chunkSize) {
    batches.push(normalizedPoints.slice(index, index + chunkSize))
  }
  return batches
}

export async function sampleArcGisTerrain(points, options = {}) {
  const provider = await getTerrainProvider()
  const heights = []
  for (const batch of createTerrainSampleBatches(points, options)) {
    const cartographics = batch.map((point) => Cesium.Cartographic.fromDegrees(
      Number(point.longitude),
      Number(point.latitude),
    ))
    const sampled = await Cesium.sampleTerrainMostDetailed(provider, cartographics)
    heights.push(...sampled.map((point) => Number.isFinite(point.height) ? point.height : null))
  }
  return heights
}

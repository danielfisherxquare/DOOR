import * as Cesium from 'cesium'

const ARCGIS_TERRAIN_URL =
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'

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

function normalizeConcurrency(value) {
  return Math.max(1, Math.min(Math.round(Number(value) || 4), 6))
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

export async function sampleTerrainBatches(points, sampleBatch, options = {}) {
  const normalizedPoints = Array.isArray(points) ? points : []
  if (!normalizedPoints.length) return []
  if (typeof sampleBatch !== 'function') {
    throw new Error('sampleBatch must be a function')
  }
  const batches = createTerrainSampleBatches(normalizedPoints, options)
  const concurrency = normalizeConcurrency(options.concurrency ?? options.maxConcurrency)
  const heights = new Array(normalizedPoints.length)
  let nextBatchIndex = 0
  let completedBatches = 0
  let completedSamples = 0
  const starts = []
  batches.reduce((offset, batch, index) => {
    starts[index] = offset
    return offset + batch.length
  }, 0)

  const reportProgress = () => {
    if (typeof options.onProgress !== 'function') return
    options.onProgress({
      completedBatches,
      totalBatches: batches.length,
      completedSamples,
      totalSamples: normalizedPoints.length,
    })
  }

  const runNext = async () => {
    while (nextBatchIndex < batches.length) {
      const batchIndex = nextBatchIndex
      nextBatchIndex += 1
      const batch = batches[batchIndex]
      const sampled = await sampleBatch(batch, batchIndex)
      const offset = starts[batchIndex]
      batch.forEach((_, index) => {
        const value = Array.isArray(sampled) ? Number(sampled[index]) : NaN
        heights[offset + index] = Number.isFinite(value) ? value : null
      })
      completedBatches += 1
      completedSamples += batch.length
      reportProgress()
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, () => runNext()))
  return heights
}

export async function sampleArcGisTerrain(points, options = {}) {
  const provider = await getTerrainProvider()
  return sampleTerrainBatches(
    points,
    async (batch) => {
      const cartographics = batch.map((point) =>
        Cesium.Cartographic.fromDegrees(Number(point.longitude), Number(point.latitude))
      )
    const sampled = await Cesium.sampleTerrainMostDetailed(provider, cartographics)
      return sampled.map((point) => (Number.isFinite(point.height) ? point.height : null))
    },
    options
  )
}

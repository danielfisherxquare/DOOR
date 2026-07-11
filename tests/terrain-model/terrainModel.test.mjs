import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import PizZip from 'pizzip'

import { parseGpxTrack, summarizeTrack } from '../../src/utils/terrainModel/gpx.js'
import * as terrainModelModule from '../../src/utils/terrainModel/model.js'
import {
  buildTerrainModel,
  buildTerrainPrintPreflight,
  buildTerrainModelExportFiles,
  evaluateTerrainModelReadiness,
  meshToAsciiStl,
  normalizeBambuStudioProjectSettings,
  recommendModelDimensionsForTrack,
  recommendHighPrecisionTerrainOptions,
  recommendPrintReadableOptions,
  recommendTerrainPrintStyleOptions,
  recommendTerrainReliefOptions,
  toPrintCoordinateVertex,
} from '../../src/utils/terrainModel/model.js'
import {
  buildOpenTopographyGlobalDemUrl,
  buildBufferedWgs84Bounds,
  createRasterElevationSampler,
  fetchOpenTopographyGlobalAsciiGrid,
  parseArcAsciiGrid,
} from '../../src/utils/terrainModel/demRaster.js'
import {
  buildCesiumIonRasterTileUrl,
  buildBingImageryMetadataUrl,
  buildGoogleMapTileUrl,
  buildGoogleMapTilesSessionRequest,
  buildSurfaceTextureDataUrl,
  buildSurfaceTextureTilePlan,
  createGoogleMapTilesSession,
  fetchCesiumIonRasterSourceOptions,
  getTerrainSurfaceUv,
  resolveSurfaceTextureSource,
  SURFACE_TEXTURE_SOURCES,
} from '../../src/utils/terrainModel/surfaceTexture.js'
import { createTerrainSampleBatches } from '../../src/utils/terrainModel/arcgisTerrainSampler.js'
import { removeLocalElevationSpikes, prepareElevationGrid } from '../../src/utils/terrainModel/elevation.js'

function parseAsciiStlVertices(stlText) {
  return Array.from(String(stlText).matchAll(/vertex\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g))
    .map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
      z: Number(match[3]),
    }))
}

function boundsForVertices(vertices) {
  return {
    x: [Math.min(...vertices.map((vertex) => vertex.x)), Math.max(...vertices.map((vertex) => vertex.x))],
    y: [Math.min(...vertices.map((vertex) => vertex.y)), Math.max(...vertices.map((vertex) => vertex.y))],
    z: [Math.min(...vertices.map((vertex) => vertex.z)), Math.max(...vertices.map((vertex) => vertex.z))],
  }
}

function rotateWgs84Polygon(points, degrees, center) {
  const cosLatitude = Math.max(0.000001, Math.cos(center.latitude * Math.PI / 180))
  const radians = degrees * Math.PI / 180
  const sin = Math.sin(radians)
  const cos = Math.cos(radians)
  return points.map((point) => {
    const x = (point.longitude - center.longitude) * cosLatitude
    const y = point.latitude - center.latitude
    return {
      latitude: center.latitude + x * sin + y * cos,
      longitude: center.longitude + (x * cos - y * sin) / cosLatitude,
    }
  })
}

function countDistinctRounded(values, decimals = 3) {
  return new Set(values.map((value) => Number(value.toFixed(decimals)))).size
}

function routePointInsideHexFootprint(model, point) {
  const bounds = model.terrain.boundsMeters
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerZ = (bounds.minZ + bounds.maxZ) / 2
  const halfWidth = bounds.width / 2
  const halfDepth = bounds.depth / 2
  const absX = Math.abs(point.x - centerX)
  const absZ = Math.abs(point.z - centerZ)
  const maxXAtZ = halfWidth - (halfWidth * 0.5 * absZ) / Math.max(halfDepth, 0.001)
  return absZ <= halfDepth + 0.05 && absX <= maxXAtZ + 0.05
}

const BAMBU_H2C_FILAMENT_VARIANT_COUNT = 2

function bambuH2cFilamentVariantCount(projectSettings) {
  return projectSettings.filament_colour.length * BAMBU_H2C_FILAMENT_VARIANT_COUNT
}

function assertBambuProjectArraysMatchFilamentVariantCount(projectSettings, keys) {
  const variantCount = bambuH2cFilamentVariantCount(projectSettings)
  for (const key of keys) {
    assert.equal(projectSettings[key].length, variantCount, key + ' should match the material slot x H2C variant count')
  }
}

function bambuH2cFilamentVariantSelfIndexes(projectSettings) {
  return projectSettings.filament_colour.flatMap((_, index) => [String(index + 1), String(index + 1)])
}

function assertBambuFlushSettingsMatchH2cVariants(projectSettings) {
  const slotCount = projectSettings.filament_colour.length
  const variantCount = bambuH2cFilamentVariantCount(projectSettings)
  assert.equal(
    projectSettings.flush_volumes_matrix.length,
    slotCount * variantCount,
    'flush_volumes_matrix should cover material slots x H2C nozzle variants',
  )
  assert.equal(projectSettings.flush_volumes_vector.length, variantCount)
  assert.deepEqual(projectSettings.flush_multiplier, ['1', '1'])
}

function parseThreeMfObjectVertices(modelXml, objectName) {
  const objectMatch = String(modelXml).match(new RegExp(
    '<object[^>]*name="' + objectName + '"[\\s\\S]*?<vertices>([\\s\\S]*?)<\\/vertices>',
  ))
  assert.ok(objectMatch, objectName + ' object exists in 3MF model')
  return Array.from(objectMatch[1].matchAll(/<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"\s*\/>/g))
    .map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
      z: Number(match[3]),
    }))
}

function createModelTerrainHeightAt(model) {
  const rows = model.terrain.rows
  const cols = model.terrain.cols
  const bounds = model.terrain.boundsMeters
  const scale = model.projection.scaleMmPerMeter
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerZ = (bounds.minZ + bounds.maxZ) / 2
  const stepX = (bounds.maxX - bounds.minX) / Math.max(cols - 1, 1)
  const stepZ = (bounds.maxZ - bounds.minZ) / Math.max(rows - 1, 1)
  const topHeights = model.meshes.terrain.vertices
    .slice(0, rows * cols)
    .map((vertex) => vertex.y)

  return (vertex) => {
    const localX = vertex.x / scale + centerX
    const localZ = vertex.z / scale + centerZ
    const rawCol = (localX - bounds.minX) / stepX
    const rawRow = (localZ - bounds.minZ) / stepZ
    const col = Math.min(Math.max(Math.floor(rawCol), 0), cols - 2)
    const row = Math.min(Math.max(Math.floor(rawRow), 0), rows - 2)
    const tx = Math.min(Math.max(rawCol - col, 0), 1)
    const tz = Math.min(Math.max(rawRow - row, 0), 1)
    const h00 = topHeights[row * cols + col]
    const h10 = topHeights[row * cols + col + 1]
    const h01 = topHeights[(row + 1) * cols + col]
    const h11 = topHeights[(row + 1) * cols + col + 1]
    const top = h00 * (1 - tx) + h10 * tx
    const bottom = h01 * (1 - tx) + h11 * tx
    return top * (1 - tz) + bottom * tz
  }
}

function maxFloatingClearance(vertices, supportHeightAt) {
  return vertices.reduce((maximum, vertex) => Math.max(maximum, vertex.y - supportHeightAt(vertex)), -Infinity)
}

function maxSurfacePenetration(vertices, supportHeightAt) {
  return vertices.reduce((maximum, vertex) => Math.max(maximum, supportHeightAt(vertex) - vertex.y), -Infinity)
}

function createSatelliteImageData(width, height, resolveRgb) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const [r, g, b] = resolveRgb(row, col)
      const index = (row * width + col) * 4
      data[index] = r
      data[index + 1] = g
      data[index + 2] = b
      data[index + 3] = 255
    }
  }
  return { data, width, height }
}

const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="door-test">
  <metadata><name>青城山越野 12K</name></metadata>
  <trk>
    <name>12K Trail</name>
    <trkseg>
      <trkpt lat="30.900000" lon="103.570000"><ele>710</ele></trkpt>
      <trkpt lat="30.900800" lon="103.571000"><ele>735</ele></trkpt>
      <trkpt lat="30.901600" lon="103.572200"><ele>760</ele></trkpt>
      <trkpt lat="30.902200" lon="103.573600"><ele>742</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`

test('parseGpxTrack extracts ordered track points and metadata', () => {
  const parsed = parseGpxTrack(gpx)

  assert.equal(parsed.name, '12K Trail')
  assert.equal(parsed.points.length, 4)
  assert.deepEqual(parsed.points[0], {
    latitude: 30.9,
    longitude: 103.57,
    elevation: 710,
  })

  const summary = summarizeTrack(parsed.points)
  assert.ok(summary.distanceMeters > 300)
  assert.equal(summary.minElevationMeters, 710)
  assert.equal(summary.maxElevationMeters, 760)
})

test('summarizeTrack ignores zero elevation voids on high-altitude tracks', () => {
  const points = [
    { latitude: 34.6, longitude: 99.6, elevation: 3980 },
    { latitude: 34.61, longitude: 99.61, elevation: 0 },
    { latitude: 34.62, longitude: 99.62, elevation: 4020 },
    { latitude: 34.63, longitude: 99.63, elevation: 4045 },
  ]

  const summary = summarizeTrack(points)

  assert.equal(summary.minElevationMeters, 3980)
  assert.equal(summary.maxElevationMeters, 4045)
  assert.equal(summary.elevationGainMeters, 65)
})

test('parseArcAsciiGrid samples high resolution DEM cells without using GPX interpolation', () => {
  const raster = parseArcAsciiGrid(`ncols 4
nrows 3
xllcorner 103.570
yllcorner 30.900
cellsize 0.001
NODATA_value -9999
100 110 130 160
90 -9999 120 150
80 95 115 140`, { sourceName: 'synthetic-arcgrid', resolutionMeters: 30 })

  assert.equal(raster.cols, 4)
  assert.equal(raster.rows, 3)
  assert.deepEqual(raster.bounds, {
    west: 103.57,
    east: 103.574,
    south: 30.9,
    north: 30.903,
  })
  assert.equal(raster.resolutionMeters, 30)

  const sample = createRasterElevationSampler(raster)
  assert.equal(sample({ latitude: 30.9025, longitude: 103.5705 }), 100)
  assert.equal(sample({ latitude: 30.9015, longitude: 103.5715 }), null)
  assert.equal(sample({ latitude: 30.899, longitude: 103.5705 }), null)
  assert.ok(sample({ latitude: 30.9015, longitude: 103.5725 }) > 100)
})

test('parseArcAsciiGrid estimates DEM resolution from AAIGrid cell size when metadata is absent', () => {
  const raster = parseArcAsciiGrid(`ncols 2
nrows 2
xllcorner 103.570
yllcorner 30.900
cellsize 0.0001
NODATA_value -9999
100 110
90 95`, { sourceName: 'opentopography-cop30' })

  assert.equal(raster.sourceName, 'opentopography-cop30')
  assert.ok(raster.resolutionMeters > 9)
  assert.ok(raster.resolutionMeters < 12)
})

test('buildOpenTopographyGlobalDemUrl creates an AAIGrid DEM request without hard-coding a vendor into the model builder', () => {
  const url = buildOpenTopographyGlobalDemUrl({
    demType: 'COP30',
    bounds: {
      south: 30.9,
      north: 30.94,
      west: 103.57,
      east: 103.62,
    },
    apiKey: 'test-key',
    outputFormat: 'AAIGrid',
  })

  assert.equal(url.origin, 'https://portal.opentopography.org')
  assert.equal(url.pathname, '/API/globaldem')
  assert.equal(url.searchParams.get('demtype'), 'COP30')
  assert.equal(url.searchParams.get('south'), '30.9')
  assert.equal(url.searchParams.get('north'), '30.94')
  assert.equal(url.searchParams.get('west'), '103.57')
  assert.equal(url.searchParams.get('east'), '103.62')
  assert.equal(url.searchParams.get('outputFormat'), 'AAIGrid')
  assert.equal(url.searchParams.get('API_Key'), 'test-key')
})

test('fetchOpenTopographyGlobalAsciiGrid preserves OpenTopography provenance for exports', async () => {
  const bounds = {
    south: 30.9,
    north: 30.9002,
    west: 103.57,
    east: 103.5702,
  }
  const raster = await fetchOpenTopographyGlobalAsciiGrid({
    demType: 'COP30',
    bounds,
    apiKey: 'test-key',
    resolutionMeters: 30,
    fetchImpl: async (url) => {
      assert.equal(url.searchParams.get('demtype'), 'COP30')
      assert.equal(url.searchParams.get('API_Key'), 'test-key')
      return {
        ok: true,
        text: async () => `ncols 2
nrows 2
xllcorner 103.570
yllcorner 30.900
cellsize 0.0001
NODATA_value -9999
100 110
90 95`,
      }
    },
  })

  assert.equal(raster.sourceName, 'OpenTopography COP30')
  assert.equal(raster.sourceType, 'opentopography-globaldem')
  assert.deepEqual(raster.requestBoundsWgs84, bounds)
  assert.equal(raster.demType, 'COP30')
  assert.equal(raster.resolutionMeters, 30)
})

test('buildBufferedWgs84Bounds pads uploaded GPX bounds for DEM API requests', () => {
  const bounds = buildBufferedWgs84Bounds([
    { latitude: 30.9, longitude: 103.57 },
    { latitude: 30.92, longitude: 103.61 },
  ], { paddingMeters: 300 })

  assert.ok(bounds.south < 30.9)
  assert.ok(bounds.north > 30.92)
  assert.ok(bounds.west < 103.57)
  assert.ok(bounds.east > 103.61)
  assert.ok(bounds.north - bounds.south > 0.02)
  assert.ok(bounds.east - bounds.west > 0.04)
})

test('buildBufferedWgs84Bounds can use a manual WGS84 terrain range for DEM requests', () => {
  const manualBounds = {
    south: 30.89,
    north: 30.93,
    west: 103.56,
    east: 103.62,
  }
  const bounds = buildBufferedWgs84Bounds([
    { latitude: 30.9, longitude: 103.57 },
    { latitude: 30.92, longitude: 103.61 },
  ], {
    paddingMeters: 1200,
    terrainBoundsWgs84: manualBounds,
  })

  assert.deepEqual(bounds, manualBounds)
})

test('buildBufferedWgs84Bounds ignores incomplete manual WGS84 bounds', () => {
  const bounds = buildBufferedWgs84Bounds([
    { latitude: 30.9, longitude: 103.57 },
    { latitude: 30.92, longitude: 103.61 },
  ], {
    paddingMeters: 0,
    terrainBoundsWgs84: {
      south: '',
      north: 30.93,
      west: 103.56,
      east: 103.62,
    },
  })

  assert.ok(bounds.south > 30.89)
  assert.ok(bounds.north < 30.93)
  assert.ok(bounds.west > 103.56)
  assert.ok(bounds.east < 103.62)
})

test('createTerrainSampleBatches caps high precision terrain requests into stable chunks', () => {
  const points = Array.from({ length: 25005 }, (_, index) => ({
    latitude: 30.9 + index * 0.000001,
    longitude: 103.57,
  }))

  const batches = createTerrainSampleBatches(points, { chunkSize: 9000 })

  assert.deepEqual(batches.map((batch) => batch.length), [9000, 9000, 7005])
  assert.equal(batches[0][0], points[0])
  assert.equal(batches[2][7004], points[25004])
})

test('buildTerrainModel creates printable terrain and raised route meshes', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 8,
    gridCols: 8,
    modelWidthMm: 120,
    modelDepthMm: 90,
    baseHeightMm: 2,
    verticalScale: 0.25,
    trackWidthMm: 2.4,
    trackHeightMm: 1.2,
    sampleElevations: async (samples) => samples.map((sample, index) => (
      700 + (sample.latitude - 30.9) * 11000 + (index % 3)
    )),
  })

  assert.equal(model.kind, 'door-terrain-track-model')
  assert.equal(model.terrain.rows, 8)
  assert.equal(model.terrain.cols, 8)
  assert.ok(model.stats.modelWidthMm <= 120)
  assert.ok(model.stats.modelDepthMm <= 90)
  assert.ok(model.stats.elevationGainMeters > 0)
  assert.ok(model.meshes.terrain.vertices.length > 100)
  assert.ok(model.meshes.terrain.faces.length > 100)
  assert.ok(model.meshes.track.vertices.length > 0)
  assert.ok(model.meshes.track.faces.length > 0)
  assert.ok(model.meshes.combined.faces.length > model.meshes.terrain.faces.length)
})

test('buildTerrainModel defaults to a slicer-safe low raised route height', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 4,
    gridCols: 4,
    baseHeightMm: 2,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map(() => 600),
  })

  assert.equal(model.stats.maxHeightMm, 2.6)
})

test('buildTerrainModel simplifies over-dense route geometry at print scale', async () => {
  const densePoints = Array.from({ length: 120 }, (_, index) => ({
    latitude: 30 + index * 0.00005,
    longitude: 103 + Math.sin(index / 2) * 0.000003,
    elevation: 620 + index * 0.1,
  }))
  const commonOptions = {
    gridRows: 6,
    gridCols: 6,
    modelWidthMm: 120,
    modelDepthMm: 80,
    trackWidthMm: 2,
    trackHeightMm: 0.6,
    sampleElevations: async (samples) => samples.map(() => 620),
  }
  const denseModel = await buildTerrainModel(densePoints, {
    ...commonOptions,
    trackSimplifyToleranceMm: 0,
  })
  const simplifiedModel = await buildTerrainModel(densePoints, commonOptions)

  assert.ok(simplifiedModel.meshes.track.faces.length < denseModel.meshes.track.faces.length / 4)
  assert.ok(simplifiedModel.meshes.track.faces.length >= 12)
})

test('buildTerrainModel merges ultra terrain grids without overflowing the call stack', async () => {
  const points = Array.from({ length: 24 }, (_, index) => ({
    latitude: 30 + index * 0.0002,
    longitude: 103 + Math.sin(index / 3) * 0.001 + index * 0.00015,
    elevation: 700 + Math.sin(index / 2) * 80 + index * 3,
  }))

  const model = await buildTerrainModel(points, {
    gridRows: 320,
    gridCols: 320,
    modelWidthMm: 120,
    modelDepthMm: 104,
    maxReliefMm: 18,
    elevationSmoothingPasses: 0,
    basePlateHeightMm: 3,
    frameWidthMm: 8,
    shapeType: 'rectangle',
    labelText: '54.38KM',
    secondaryLabelText: 'ArcSpro',
  })

  assert.equal(model.terrain.rows, 320)
  assert.equal(model.terrain.cols, 320)
  assert.ok(model.meshes.combined.vertices.length > 200000)
  assert.ok(model.meshes.combined.faces.length > model.meshes.terrain.faces.length)
})

test('print exports convert internal Three Y-up vertices to slicer Z-up coordinates without mirroring east or north', () => {
  const eastNorthUpMesh = {
    name: 'axis-check',
    vertices: [
      { x: 0, y: 1, z: 0 },
      { x: 12, y: 2, z: 0 },
      { x: 12, y: 3, z: 24 },
    ],
    faces: [[0, 1, 2]],
  }

  assert.deepEqual(toPrintCoordinateVertex(eastNorthUpMesh.vertices[2]), {
    x: 12,
    y: 24,
    z: 3,
  })

  const stl = meshToAsciiStl(eastNorthUpMesh, 'axis-check')

  assert.match(stl, /vertex 0\.00000 0\.00000 1\.00000/)
  assert.match(stl, /vertex 12\.00000 0\.00000 2\.00000/)
  assert.match(stl, /vertex 12\.00000 24\.00000 3\.00000/)
})

test('preview and GLB coordinates convert internal northing to right-handed Three Y-up axes', () => {
  assert.equal(typeof terrainModelModule.toThreeYUpCoordinateVertex, 'function')

  const internalVertex = { x: 12, y: 3, z: 24 }

  assert.deepEqual(terrainModelModule.toThreeYUpCoordinateVertex(internalVertex), {
    x: 12,
    y: 3,
    z: -24,
  })
  assert.deepEqual(toPrintCoordinateVertex(internalVertex), {
    x: 12,
    y: 24,
    z: 3,
  })
})

test('route local coordinates keep longitude east as positive x and latitude north as positive z', async () => {
  const asymmetricTrack = [
    { latitude: 30, longitude: 103, elevation: 100 },
    { latitude: 30, longitude: 103.01, elevation: 110 },
    { latitude: 30.01, longitude: 103.01, elevation: 120 },
  ]

  const model = await buildTerrainModel(asymmetricTrack, {
    gridRows: 8,
    gridCols: 8,
    shapeType: 'rectangle',
    modelWidthMm: 120,
    modelDepthMm: 90,
    paddingMeters: 0,
    sampleElevations: async (samples) => samples.map(() => 100),
  })
  const [start, east, north] = model.route.localPoints

  assert.ok(east.x > start.x)
  assert.equal(east.z, start.z)
  assert.equal(north.x, east.x)
  assert.ok(north.z > east.z)
})

test('non-rectangular terrain footprints expand enough to keep route corners printable', async () => {
  const cornerTrack = [
    { latitude: 30, longitude: 103, elevation: 100 },
    { latitude: 30, longitude: 103.012, elevation: 108 },
    { latitude: 30.012, longitude: 103.012, elevation: 116 },
    { latitude: 30.012, longitude: 103, elevation: 124 },
  ]

  const model = await buildTerrainModel(cornerTrack, {
    gridRows: 24,
    gridCols: 24,
    shapeType: 'hexagon',
    modelWidthMm: 120,
    modelDepthMm: 120,
    frameWidthMm: 0,
    basePlateHeightMm: 0,
    sampleElevations: async (samples) => samples.map((sample) => (
      100 + (sample.latitude - 30) * 1000 + (sample.longitude - 103) * 1000
    )),
  })

  assert.ok(model.stats.terrainWidthMm <= 120)
  assert.ok(model.stats.terrainDepthMm <= 120)
  assert.ok(
    model.route.localPoints.every((point) => routePointInsideHexFootprint(model, point)),
    'all GPX route points should remain inside the generated hexagon footprint',
  )
})

test('buildTerrainModel preserves high precision DEM grids and writes source precision metadata', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 128,
    gridCols: 132,
    terrainQuality: 'high',
    elevationSourceName: 'synthetic-dem-10m',
    elevationSourceResolutionMeters: 10,
    modelWidthMm: 120,
    modelDepthMm: 90,
    baseHeightMm: 2,
    verticalScale: 0.08,
    maxReliefMm: 34,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((sample, index) => (
      800
        + Math.sin((sample.latitude - 30.9) * 9000) * 22
        + Math.cos((sample.longitude - 103.57) * 7000) * 16
        + (index % 7)
    )),
  })

  assert.equal(model.terrain.rows, 128)
  assert.equal(model.terrain.cols, 132)
  assert.equal(model.terrain.precision.preset, 'high')
  assert.equal(model.terrain.precision.sampleCount, 128 * 132)
  assert.equal(model.terrain.precision.source.name, 'synthetic-dem-10m')
  assert.equal(model.terrain.precision.source.resolutionMeters, 10)
  assert.ok(model.terrain.precision.gridSpacingMm.x > 0)
  assert.ok(model.terrain.precision.gridSpacingMm.z > 0)
  assert.ok(model.terrain.precision.gridSpacingMm.min < 1)
  assert.ok(model.terrain.precision.gridSpacingMeters.x > 0)
  assert.ok(model.terrain.precision.gridSpacingMeters.z > 0)
  assert.ok(model.terrain.boundsWgs84.west < model.terrain.boundsWgs84.east)
  assert.ok(model.terrain.boundsWgs84.south < model.terrain.boundsWgs84.north)
  assert.ok(model.terrain.boundsWgs84.west < points[0].longitude)
  assert.ok(model.terrain.boundsWgs84.north > points.at(-1).latitude)
  assert.ok(model.stats.terrainTriangles > 32000)

  const files = buildTerrainModelExportFiles(model, { baseName: 'high-precision-dem' })
  const manifest = JSON.parse(files.at(-1).content)
  assert.equal(manifest.terrain.precision.preset, 'high')
  assert.equal(manifest.terrain.precision.sampleCount, 128 * 132)
  assert.equal(manifest.terrain.precision.source.resolutionMeters, 10)
  assert.ok(manifest.terrain.precision.gridSpacingMm.min < 1)
  assert.deepEqual(manifest.terrain.boundsWgs84, model.terrain.boundsWgs84)
})

test('buildTerrainModel samples and exports a manual WGS84 terrain range', async () => {
  const { points } = parseGpxTrack(gpx)
  const manualBounds = {
    south: 30.895,
    north: 30.906,
    west: 103.565,
    east: 103.58,
  }
  const sampledPoints = []
  const model = await buildTerrainModel(points, {
    gridRows: 6,
    gridCols: 6,
    shapeType: 'rectangle',
    modelWidthMm: 120,
    modelDepthMm: 88,
    paddingMeters: 0,
    terrainBoundsWgs84: manualBounds,
    sampleElevations: async (samples) => {
      sampledPoints.push(...samples)
      return samples.map((sample) => 900 + (sample.latitude - manualBounds.south) * 100)
    },
  })

  assert.equal(model.terrain.boundsSource, 'manual-wgs84')
  assert.deepEqual(model.terrain.requestedBoundsWgs84, manualBounds)
  assert.deepEqual(model.terrain.boundsWgs84, manualBounds)
  assert.equal(sampledPoints.length, 36)
  assert.ok(Math.min(...sampledPoints.map((sample) => sample.latitude)) <= manualBounds.south + 0.000001)
  assert.ok(Math.max(...sampledPoints.map((sample) => sample.latitude)) >= manualBounds.north - 0.000001)
  assert.ok(Math.min(...sampledPoints.map((sample) => sample.longitude)) <= manualBounds.west + 0.000001)
  assert.ok(Math.max(...sampledPoints.map((sample) => sample.longitude)) >= manualBounds.east - 0.000001)

  const files = buildTerrainModelExportFiles(model, { baseName: 'manual-bounds' })
  const manifest = JSON.parse(files.at(-1).content)
  assert.equal(manifest.terrain.boundsSource, 'manual-wgs84')
  assert.deepEqual(manifest.terrain.requestedBoundsWgs84, manualBounds)
  assert.deepEqual(manifest.terrain.boundsWgs84, manualBounds)
})

test('buildTerrainModel clips terrain and base to a manual WGS84 footprint polygon', async () => {
  const footprint = [
    { latitude: 30.895, longitude: 103.565 },
    { latitude: 30.906, longitude: 103.585 },
    { latitude: 30.895, longitude: 103.585 },
  ]
  const route = [
    { latitude: 30.898, longitude: 103.574, elevation: 900 },
    { latitude: 30.899, longitude: 103.578, elevation: 905 },
    { latitude: 30.901, longitude: 103.581, elevation: 910 },
  ]

  const model = await buildTerrainModel(route, {
    gridRows: 24,
    gridCols: 24,
    shapeType: 'custom',
    modelWidthMm: 120,
    modelDepthMm: 96,
    frameWidthMm: 0,
    basePlateHeightMm: 3,
    paddingMeters: 0,
    terrainFootprintWgs84: footprint,
    sampleElevations: async (samples) => samples.map((sample) => 900 + (sample.latitude - 30.895) * 120),
  })

  assert.equal(model.print.shapeType, 'custom')
  assert.equal(model.terrain.boundsSource, 'manual-footprint-wgs84')
  assert.deepEqual(model.terrain.requestedFootprintWgs84, footprint.map((point) => ({
    latitude: Number(point.latitude.toFixed(7)),
    longitude: Number(point.longitude.toFixed(7)),
  })))
  assert.ok(model.meshes.terrain.faces.length > 0)
  assert.ok(model.meshes.base.faces.length > 0)
  assert.ok(model.meshes.base.vertices.length >= 6)

  const rectangleModel = await buildTerrainModel(route, {
    gridRows: 24,
    gridCols: 24,
    shapeType: 'rectangle',
    modelWidthMm: 120,
    modelDepthMm: 96,
    frameWidthMm: 0,
    basePlateHeightMm: 3,
    paddingMeters: 0,
    terrainBoundsWgs84: model.terrain.boundsWgs84,
    sampleElevations: async (samples) => samples.map((sample) => 900 + (sample.latitude - 30.895) * 120),
  })

  assert.equal(model.meshes.base.vertices.length, 6)
  assert.ok(
    model.meshes.terrain.faces.length < rectangleModel.meshes.terrain.faces.length,
    'triangle footprint should remove terrain faces outside the selected polygon',
  )
})

test('buildTerrainModel can straighten a rotated manual footprint for print export', async () => {
  const center = { latitude: 30.9, longitude: 103.58 }
  const rectangleFootprint = [
    { latitude: 30.897, longitude: 103.574 },
    { latitude: 30.897, longitude: 103.586 },
    { latitude: 30.903, longitude: 103.586 },
    { latitude: 30.903, longitude: 103.574 },
  ]
  const rotatedFootprint = rotateWgs84Polygon(rectangleFootprint, 45, center)
  const route = [
    { latitude: 30.899, longitude: 103.579, elevation: 900 },
    { latitude: 30.9, longitude: 103.58, elevation: 904 },
    { latitude: 30.901, longitude: 103.581, elevation: 908 },
  ]

  const model = await buildTerrainModel(route, {
    gridRows: 14,
    gridCols: 14,
    shapeType: 'custom',
    modelWidthMm: 100,
    modelDepthMm: 80,
    frameWidthMm: 0,
    basePlateHeightMm: 3,
    paddingMeters: 0,
    terrainFootprintWgs84: rotatedFootprint,
    terrainFootprintRotationDegrees: 45,
    sampleElevations: async (samples) => samples.map(() => 900),
  })

  const topBaseRing = model.meshes.base.vertices.slice(0, 4)
  assert.equal(model.projection.footprintRotationDegrees, 45)
  assert.equal(model.projection.exportAlignmentDegrees, -45)
  assert.equal(countDistinctRounded(topBaseRing.map((vertex) => vertex.x)), 2)
  assert.equal(countDistinctRounded(topBaseRing.map((vertex) => vertex.z)), 2)
})

test('buildSurfaceTextureTilePlan caps satellite tiles and records real texture coverage', () => {
  const plan = buildSurfaceTextureTilePlan({
    west: 103.57,
    east: 103.62,
    south: 30.9,
    north: 30.94,
  }, {
    sourceKey: 'esriWorldImagery',
    zoom: 13,
    maxTiles: 16,
    maxTextureSize: 1024,
  })

  assert.equal(plan.source.key, 'esriWorldImagery')
  assert.equal(plan.zoom, 13)
  assert.ok(plan.tileCount > 0)
  assert.ok(plan.tileCount <= 16)
  assert.ok(plan.textureWidth <= 1024)
  assert.ok(plan.textureHeight <= 1024)
  assert.ok(plan.tiles.every((tile) => tile.url.includes('/13/')))
  assert.ok(plan.coverageBounds.west <= 103.57)
  assert.ok(plan.coverageBounds.east >= 103.62)
})

test('buildSurfaceTextureTilePlan treats requested zoom as a budgeted upper bound', () => {
  const plan = buildSurfaceTextureTilePlan({
    west: 102.75,
    east: 103.35,
    south: 29.75,
    north: 30.25,
  }, {
    sourceKey: 'esriWorldImagery',
    zoom: 15,
    maxTiles: 16,
    maxTextureSize: 1024,
  })

  assert.equal(plan.source.key, 'esriWorldImagery')
  assert.equal(plan.requestedZoom, 15)
  assert.equal(plan.budgetLimited, true)
  assert.ok(plan.zoom < 15)
  assert.ok(plan.tileCount <= 16)
  assert.ok(plan.textureWidth <= 1024)
  assert.ok(plan.textureHeight <= 1024)
  assert.ok(plan.tiles.every((tile) => tile.url.includes('/' + plan.zoom + '/')))
})

test('buildSurfaceTextureDataUrl loads tiles concurrently and keeps partial imagery usable', async () => {
  const previousDocument = globalThis.document
  const drawCalls = []
  const progress = []
  globalThis.document = {
    createElement: (tagName) => {
      assert.equal(tagName, 'canvas')
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: '',
          fillRect: () => {},
          drawImage: (...args) => drawCalls.push(args),
        }),
        toDataURL: () => 'data:image/jpeg;base64,texture',
      }
    },
  }

  let activeLoads = 0
  let maxActiveLoads = 0
  let attemptedLoads = 0
  try {
    const texture = await buildSurfaceTextureDataUrl({
      west: 103.57,
      east: 103.62,
      south: 30.9,
      north: 30.94,
    }, {
      sourceKey: 'esriWorldImagery',
      zoom: 13,
      maxTiles: 16,
      maxTextureSize: 1024,
      tileConcurrency: 3,
      allowPartialTiles: true,
      onProgress: (item) => progress.push(item),
      loadImage: async (url) => {
        attemptedLoads += 1
        const attempt = attemptedLoads
        activeLoads += 1
        maxActiveLoads = Math.max(maxActiveLoads, activeLoads)
        await new Promise((resolve) => setTimeout(resolve, 2))
        activeLoads -= 1
        if (attempt === 2) {
          throw new Error('simulated tile failure')
        }
        return { url }
      },
    })

    assert.equal(texture.tileCount, 6)
    assert.equal(texture.missingTileCount, 1)
    assert.ok(texture.qualityWarnings.some((warning) => warning.includes('1 张卫星贴图片加载失败')))
    assert.equal(maxActiveLoads, 3)
    assert.equal(drawCalls.length, 5)
    assert.equal(texture.imageUrl, 'data:image/jpeg;base64,texture')
    assert.ok(progress.some((item) => item.phase === 'missing-tile'))
    assert.ok(progress.some((item) => item.phase === 'drawn-tile'))
  } finally {
    globalThis.document = previousDocument
  }
})

test('Google Maps Tiles texture source uses the official session-token tile flow', () => {
  assert.equal(SURFACE_TEXTURE_SOURCES.googleSatellite.key, 'googleSatellite')
  assert.equal(SURFACE_TEXTURE_SOURCES.googleSatellite.kind, 'google-map-tiles')

  const request = buildGoogleMapTilesSessionRequest({
    apiKey: 'google key',
    mapType: 'satellite',
    language: 'zh-CN',
    region: 'CN',
  })
  assert.equal(request.method, 'POST')
  assert.equal(request.url, 'https://tile.googleapis.com/v1/createSession?key=google%20key')
  assert.equal(request.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(request.bodyText), {
    mapType: 'satellite',
    language: 'zh-CN',
    region: 'CN',
  })

  assert.equal(
    buildGoogleMapTileUrl({ apiKey: 'google key', session: 'session token', z: 13, x: 6454, y: 3384 }),
    'https://tile.googleapis.com/v1/2dtiles/13/6454/3384?session=session%20token&key=google%20key',
  )

  const plan = buildSurfaceTextureTilePlan({
    west: 103.57,
    east: 103.58,
    south: 30.9,
    north: 30.91,
  }, {
    sourceKey: 'googleSatellite',
    sourceOptions: { apiKey: 'google key', session: 'session token' },
    zoom: 13,
    maxTextureSize: 1024,
  })

  assert.equal(plan.source.key, 'googleSatellite')
  assert.ok(plan.tiles.length > 0)
  assert.ok(plan.tiles.every((tile) => tile.url.startsWith('https://tile.googleapis.com/v1/2dtiles/13/')))
  assert.ok(plan.tiles.every((tile) => tile.url.includes('session=session%20token')))
  assert.ok(plan.tiles.every((tile) => tile.url.includes('key=google%20key')))
})

test('createGoogleMapTilesSession validates Google session responses', async () => {
  let requestUrl = ''
  let requestInit = null
  const session = await createGoogleMapTilesSession({
    apiKey: 'google key',
    fetchImpl: async (url, init) => {
      requestUrl = url
      requestInit = init
      return {
        ok: true,
        json: async () => ({
          session: 'session token',
          expiry: '2026-06-01T00:00:00Z',
          tileWidth: 256,
          tileHeight: 256,
        }),
      }
    },
  })

  assert.equal(requestUrl, 'https://tile.googleapis.com/v1/createSession?key=google%20key')
  assert.equal(requestInit.method, 'POST')
  assert.equal(JSON.parse(requestInit.body).mapType, 'satellite')
  assert.deepEqual(session, {
    session: 'session token',
    expiry: '2026-06-01T00:00:00Z',
    tileWidth: 256,
    tileHeight: 256,
  })
})

test('Cesium ion texture source resolves configured raster XYZ templates without using 3D tiles', () => {
  assert.equal(SURFACE_TEXTURE_SOURCES.cesiumIonRaster.key, 'cesiumIonRaster')
  assert.equal(SURFACE_TEXTURE_SOURCES.cesiumIonRaster.kind, 'cesium-ion-raster')

  const source = resolveSurfaceTextureSource('cesiumIonRaster', {
    accessToken: 'ion token',
    assetId: '12345',
    urlTemplate: 'https://assets.cesium.com/12345/{z}/{x}/{y}.png?access_token={accessToken}',
  })

  assert.equal(source.key, 'cesiumIonRaster')
  assert.equal(source.sourceOptions.assetId, '12345')
  assert.equal(
    buildCesiumIonRasterTileUrl({
      urlTemplate: source.urlTemplate,
      accessToken: 'ion token',
      assetId: '12345',
      z: 13,
      x: 6454,
      y: 3384,
    }),
    'https://assets.cesium.com/12345/13/6454/3384.png?access_token=ion%20token',
  )

  const plan = buildSurfaceTextureTilePlan({
    west: 103.57,
    east: 103.58,
    south: 30.9,
    north: 30.91,
  }, {
    sourceKey: 'cesiumIonRaster',
    sourceOptions: {
      accessToken: 'ion token',
      assetId: '12345',
      urlTemplate: 'https://assets.cesium.com/{assetId}/{z}/{x}/{y}.png?access_token={accessToken}',
    },
    zoom: 13,
    maxTextureSize: 1024,
  })

  assert.equal(plan.source.key, 'cesiumIonRaster')
  assert.ok(plan.tiles.length > 0)
  assert.ok(plan.tiles.every((tile) => tile.url.includes('/12345/13/')))
  assert.ok(plan.tiles.every((tile) => tile.url.includes('access_token=ion%20token')))
})

test('fetchCesiumIonRasterSourceOptions extracts raster templates from Cesium ion endpoints', async () => {
  let requestUrl = ''
  const sourceOptions = await fetchCesiumIonRasterSourceOptions({
    accessToken: 'ion token',
    assetId: '12345',
    fetchImpl: async (url, init) => {
      requestUrl = url
      assert.equal(init.method, 'GET')
      return {
        ok: true,
        json: async () => ({
          type: 'IMAGERY',
          externalType: 'URL_TEMPLATE',
          options: {
            url: 'https://assets.cesium.com/12345/{z}/{x}/{y}.png',
          },
        }),
      }
    },
  })

  assert.equal(requestUrl, 'https://api.cesium.com/v1/assets/12345/endpoint?access_token=ion%20token')
  assert.deepEqual(sourceOptions, {
    accessToken: 'ion token',
    assetId: '12345',
    urlTemplate: 'https://assets.cesium.com/12345/{z}/{x}/{y}.png',
    endpointType: 'IMAGERY',
    externalType: 'URL_TEMPLATE',
  })
})

test('fetchCesiumIonRasterSourceOptions resolves Cesium ion Bing aerial endpoints to exportable quadkey tiles', async () => {
  const sourceOptions = await fetchCesiumIonRasterSourceOptions({
    accessToken: 'ion token',
    assetId: '2',
    fetchImpl: async (url) => {
      if (String(url).includes('api.cesium.com/v1/assets/2/endpoint')) {
        return {
          ok: true,
          json: async () => ({
            type: 'IMAGERY',
            externalType: 'BING',
            options: {
              key: 'bing key',
              url: 'https://dev.virtualearth.net',
              mapStyle: 'Aerial',
            },
          }),
        }
      }
      assert.equal(
        url,
        'https://dev.virtualearth.net/REST/v1/Imagery/Metadata/Aerial?output=json&include=ImageryProviders&key=bing%20key',
      )
      return {
        ok: true,
        json: async () => ({
          resourceSets: [{
            resources: [{
              imageUrl: 'https://ecn.{subdomain}.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=129&mkt={culture}',
              imageUrlSubdomains: ['t0', 't1'],
              zoomMin: 1,
              zoomMax: 19,
            }],
          }],
        }),
      }
    },
  })

  assert.equal(
    buildBingImageryMetadataUrl({
      baseUrl: 'https://dev.virtualearth.net',
      mapStyle: 'Aerial',
      key: 'bing key',
    }),
    'https://dev.virtualearth.net/REST/v1/Imagery/Metadata/Aerial?output=json&include=ImageryProviders&key=bing%20key',
  )
  assert.equal(sourceOptions.externalType, 'BING')
  assert.equal(sourceOptions.urlTemplate, 'https://ecn.{subdomain}.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=129&mkt={culture}')
  assert.deepEqual(sourceOptions.subdomains, ['t0', 't1'])
  assert.equal(sourceOptions.maxZoom, 19)

  const plan = buildSurfaceTextureTilePlan({
    west: 103.57,
    east: 103.58,
    south: 30.9,
    north: 30.91,
  }, {
    sourceKey: 'cesiumIonRaster',
    sourceOptions,
    zoom: 13,
    maxTextureSize: 1024,
  })

  assert.equal(plan.source.key, 'cesiumIonRaster')
  assert.ok(plan.tiles.every((tile) => /https:\/\/ecn\.t[01]\.tiles\.virtualearth\.net\/tiles\/a[0-3]+\.jpeg/.test(tile.url)))
  assert.ok(plan.tiles.every((tile) => tile.url.includes('mkt=zh-CN')))
  assert.ok(plan.tiles.every((tile) => !tile.url.includes('access_token=')))
})

test('getTerrainSurfaceUv maps west/east and north/south without mirroring the texture', () => {
  const dimensions = { terrainWidthMm: 120, terrainDepthMm: 80 }

  assert.deepEqual(getTerrainSurfaceUv({ x: -60, z: 40 }, dimensions), { u: 0, v: 0 })
  assert.deepEqual(getTerrainSurfaceUv({ x: 60, z: -40 }, dimensions), { u: 1, v: 1 })
  assert.deepEqual(getTerrainSurfaceUv({ x: 0, z: 0 }, dimensions), { u: 0.5, v: 0.5 })
})

test('recommendHighPrecisionTerrainOptions targets printable surface spacing for DEM-backed models', () => {
  const { points } = parseGpxTrack(gpx)
  const recommendation = recommendHighPrecisionTerrainOptions(points, {
    modelWidthMm: 120,
    modelDepthMm: 90,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    shapeType: 'hexagon',
  }, {
    sourceName: 'OpenTopography COP30',
    resolutionMeters: 30,
    targetModelGridMm: 0.4,
  })

  assert.equal(recommendation.terrainQuality, 'ultra')
  assert.equal(recommendation.elevationSmoothingPasses, 0)
  assert.ok(recommendation.gridCols > 220)
  assert.ok(recommendation.gridRows > 170)
  assert.ok(recommendation.gridCols <= 320)
  assert.ok(recommendation.gridRows <= 320)
  assert.ok(recommendation.precision.gridSpacingMm.min <= 0.45)
  assert.equal(recommendation.precision.source.name, 'OpenTopography COP30')
  assert.equal(recommendation.precision.source.resolutionMeters, 30)
})

test('buildTerrainModel allows near-real relief by lowering max relief below print-readable defaults', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 8,
    gridCols: 8,
    shapeType: 'rectangle',
    modelWidthMm: 120,
    modelDepthMm: 90,
    baseHeightMm: 2,
    verticalScale: 0.18,
    maxReliefMm: 6,
    reliefMode: 'realistic',
    trackHeightMm: 1,
    sampleElevations: async (samples) => samples.map((_, index) => (
      1000 + Math.floor(index / 8) * 100
    )),
  })

  assert.equal(model.stats.maxReliefMm, 6)
  assert.ok(model.stats.reliefMm > 0)
  assert.ok(model.stats.reliefMm <= 6)
  assert.equal(model.stats.reliefMm, Number((model.stats.elevationGainMeters * model.stats.effectiveVerticalScale).toFixed(2)))
  assert.ok(model.stats.maxHeightMm <= 9.1)
  assert.ok(model.stats.realScaleReliefMm > 0)
  assert.ok(model.stats.verticalExaggeration > 0)
  assert.equal(model.stats.reliefMode, 'realistic')
  assert.ok(Math.abs(model.stats.verticalExaggeration - (model.stats.reliefMm / model.stats.realScaleReliefMm)) < 0.02)
})

test('recommendTerrainReliefOptions exposes a dramatic terrain-forward tier above print-readable', () => {
  const { points } = parseGpxTrack(gpx)
  const rec = recommendTerrainReliefOptions(points, {
    modelWidthMm: 120,
    modelDepthMm: 90,
    reliefMode: 'terrain-forward',
  })

  assert.ok(rec.printReadable.maxReliefMm > 0)
  assert.ok(rec.realistic.maxReliefMm > 0)
  // New dramatic ("地貌优先") tier
  assert.ok(rec.terrainForward, 'terrainForward recommendation exists')
  assert.equal(rec.terrainForward.mode, 'terrain-forward')
  assert.equal(rec.activeMode, 'terrain-forward')
  assert.equal(rec.active.mode, 'terrain-forward')
  // Taller + more exaggerated than the conservative print-readable tier
  assert.ok(
    rec.terrainForward.maxReliefMm > rec.printReadable.maxReliefMm,
    'dramatic relief should be taller than print-readable',
  )
  assert.ok(
    rec.terrainForward.verticalExaggeration > rec.printReadable.verticalExaggeration,
    'dramatic exaggeration should exceed print-readable',
  )
  // Stays within the cartographic norm (<=10x) and the footprint stability cap
  assert.ok(rec.terrainForward.verticalExaggeration <= 10)
  assert.ok(rec.terrainForward.maxReliefMm <= Math.min(120, 90) * 0.42)
  assert.ok(rec.terrainForward.verticalScale > 0)
})

test('removeLocalElevationSpikes preserves sharp ridges in ridge mode but still removes isolated spikes', () => {
  const rows = 5
  const cols = 5
  // Base plateau at 1000m with a sharp ridge line down column 2 at 1400m (+400m vs neighbours),
  // plus one isolated single-cell DEM spike at the corner (0,0) = 5000m.
  const values = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      values.push(col === 2 ? 1400 : 1000)
    }
  }
  values[0] = 5000

  const ridgeIndex = 2 * cols + 2

  // Default (aggressive) despike flattens the genuine ridge.
  const aggressive = removeLocalElevationSpikes(values, rows, cols)
  assert.ok(aggressive.values[ridgeIndex] < 1200, 'aggressive despike flattens the ridge (baseline behaviour)')

  // Ridge-preserving mode keeps the ridge but still removes the isolated spike.
  const preserved = removeLocalElevationSpikes(values, rows, cols, { preserveRidges: true })
  assert.ok(preserved.values[ridgeIndex] >= 1380, 'ridge is preserved')
  assert.ok(preserved.values[0] < 2000, 'isolated single-cell spike is still removed')
})

test('prepareElevationGrid forwards preserveRidges to the spike filter', () => {
  const rows = 5
  const cols = 5
  // Ridge only +200m above the plateau so it survives the sanitize IQR fence; an
  // explicit low despike threshold makes the default median rule flatten it.
  const values = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      values.push(col === 2 ? 1200 : 1000)
    }
  }
  const gridOptions = { smoothingPasses: 0, localThresholdMeters: 100 }
  const flattened = prepareElevationGrid(values.slice(), rows, cols, [], gridOptions)
  const preserved = prepareElevationGrid(values.slice(), rows, cols, [], { ...gridOptions, preserveRidges: true })
  const ridgeIndex = 2 * cols + 2
  assert.ok(preserved.values[ridgeIndex] > flattened.values[ridgeIndex] + 50, 'preserveRidges keeps the ridge taller')
})

test('print-readable relief keeps at least ~50 printable layers at 0.15mm', () => {
  const { points } = parseGpxTrack(gpx)
  const rec = recommendTerrainReliefOptions(points, { modelWidthMm: 120, modelDepthMm: 90 })
  // >=50 layers at a 0.15mm layer height means >=7.5mm of relief
  assert.ok(rec.printReadable.maxReliefMm >= 7.5)
})

test('reducePeakPreserving keeps the most prominent feature, not the average', () => {
  assert.equal(typeof terrainModelModule.reducePeakPreserving, 'function')
  const reduce = terrainModelModule.reducePeakPreserving
  // sharp peak among a flat block -> peak survives (mean would be 175)
  assert.equal(reduce([100, 100, 100, 400]), 400)
  // sharp pit among a flat block -> pit survives (no upward bias)
  assert.equal(reduce([500, 500, 500, 100]), 100)
  // flat block returns the value
  assert.equal(reduce([200, 200, 200, 200]), 200)
  // ignores non-finite samples
  assert.equal(reduce([null, 300, NaN]), 300)
})

test('buildTerrainModel peak-preserving supersample samples a denser DEM grid and keeps the range', async () => {
  const { points } = parseGpxTrack(gpx)
  let sampledCount = 0
  const commonOpts = {
    gridRows: 8,
    gridCols: 8,
    modelWidthMm: 120,
    modelDepthMm: 90,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => {
      sampledCount = samples.length
      return samples.map((sample) => 2000 + Math.sin(sample.longitude * 52000) * 500)
    },
  }
  const baseModel = await buildTerrainModel(points, { ...commonOpts })
  const baseCount = sampledCount
  const baseGain = baseModel.stats.elevationGainMeters

  const superModel = await buildTerrainModel(points, { ...commonOpts, terrainSupersample: 2 })
  // a 2x2 supersample queries 4x as many DEM points...
  assert.equal(sampledCount, baseCount * 4, 'supersample=2 samples a 2x2 denser grid')
  // ...the peak-preserving reduction keeps at least as much relief as point sampling
  assert.ok(superModel.stats.elevationGainMeters >= baseGain - 1e-6)
  // output mesh resolution is unchanged (still 8x8 vertices)
  assert.equal(superModel.terrain.rows, 8)
  assert.equal(superModel.terrain.cols, 8)
})

test('buildTerrainModel reports calculated relief instead of copying the max relief cap', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 8,
    gridCols: 8,
    shapeType: 'rectangle',
    modelWidthMm: 120,
    modelDepthMm: 90,
    baseHeightMm: 2,
    verticalScale: 0.02,
    maxReliefMm: 42,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((_, index) => (
      500 + Math.floor(index / 8) * 50
    )),
  })

  assert.equal(model.stats.maxReliefMm, 42)
  assert.equal(model.stats.effectiveVerticalScale, 0.02)
  assert.equal(model.stats.reliefMm, Number((model.stats.elevationGainMeters * model.stats.effectiveVerticalScale).toFixed(2)))
  assert.ok(model.stats.reliefMm > 0)
  assert.ok(model.stats.reliefMm < model.stats.maxReliefMm)
  assert.notEqual(model.stats.reliefMm, model.stats.maxReliefMm)
  assert.ok(Math.abs(model.stats.verticalExaggeration - (model.stats.reliefMm / model.stats.realScaleReliefMm)) < 0.02)
})

test('recommendModelDimensionsForTrack locks print size to the buffered GPX aspect ratio', () => {
  const points = [
    { latitude: 30.9, longitude: 103.57, elevation: 700 },
    { latitude: 30.9, longitude: 103.59, elevation: 710 },
    { latitude: 30.908, longitude: 103.59, elevation: 720 },
  ]

  const dimensions = recommendModelDimensionsForTrack(points, {
    shapeType: 'rectangle',
    modelLongSideMm: 120,
    paddingMeters: 0,
  })

  assert.equal(dimensions.modelWidthMm, 120)
  assert.ok(dimensions.modelDepthMm < 120)
  assert.ok(dimensions.aspectRatio > 1.8)
  assert.ok(Math.abs((dimensions.modelWidthMm / dimensions.modelDepthMm) - dimensions.aspectRatio) < 0.03)
})

test('recommendModelDimensionsForTrack sizes print footprint from a manual WGS84 terrain range', () => {
  const points = [
    { latitude: 30.9, longitude: 103.57, elevation: 700 },
    { latitude: 30.9, longitude: 103.59, elevation: 710 },
    { latitude: 30.908, longitude: 103.59, elevation: 720 },
  ]
  const manualBounds = {
    south: 30.895,
    north: 30.915,
    west: 103.565,
    east: 103.595,
  }

  const dimensions = recommendModelDimensionsForTrack(points, {
    shapeType: 'rectangle',
    modelLongSideMm: 120,
    paddingMeters: 0,
    terrainBoundsWgs84: manualBounds,
  })

  assert.equal(dimensions.boundsSource, 'manual-wgs84')
  assert.deepEqual(dimensions.boundsWgs84, manualBounds)
  assert.ok(dimensions.depthMeters > 2000)
  assert.ok(dimensions.modelDepthMm > 80)
  assert.ok(dimensions.aspectRatio < 1.6)
})

test('recommendModelDimensionsForTrack ignores incomplete manual WGS84 terrain ranges', () => {
  const points = [
    { latitude: 30.9, longitude: 103.57, elevation: 700 },
    { latitude: 30.9, longitude: 103.59, elevation: 710 },
    { latitude: 30.908, longitude: 103.59, elevation: 720 },
  ]

  const dimensions = recommendModelDimensionsForTrack(points, {
    shapeType: 'rectangle',
    modelLongSideMm: 120,
    paddingMeters: 0,
    terrainBoundsWgs84: {
      south: '',
      north: 30.915,
      west: 103.565,
      east: 103.595,
    },
  })

  assert.equal(dimensions.boundsSource, 'gpx-buffer')
  assert.ok(dimensions.aspectRatio > 1.8)
})

test('recommendModelDimensionsForTrack treats long side as the total print size including frame', async () => {
  const points = [
    { latitude: 30.9, longitude: 103.57, elevation: 700 },
    { latitude: 30.908, longitude: 103.59, elevation: 720 },
  ]

  const dimensions = recommendModelDimensionsForTrack(points, {
    shapeType: 'hexagon',
    modelLongSideMm: 120,
    paddingMeters: 300,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
  })

  assert.equal(Math.max(dimensions.modelWidthMm, dimensions.modelDepthMm), 120)
  assert.ok(Math.min(dimensions.modelWidthMm, dimensions.modelDepthMm) > 40)

  const model = await buildTerrainModel(points, {
    ...dimensions,
    shapeType: 'hexagon',
    gridRows: 8,
    gridCols: 8,
    baseHeightMm: 2,
    verticalScale: 0.04,
    maxReliefMm: 18,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    sampleElevations: async (samples) => samples.map((_, index) => 700 + index),
  })

  assert.equal(Math.max(model.stats.modelWidthMm, model.stats.modelDepthMm), 120)
})

test('TerrainModelPage shows generated relief, real-scale relief, and vertical exaggeration stats', () => {
  const source = [
    '../../src/views/app/terrain-model/TerrainModelPage.jsx',
    '../../src/views/app/terrain-model/TerrainDeliveryPanel.jsx',
    '../../src/views/app/terrain-model/TerrainStatusPanels.jsx',
  ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n')

  assert.match(source, /模型起伏/)
  assert.match(source, /真实比例起伏/)
  assert.match(source, /垂直夸张/)
  assert.match(source, /reliefMode/)
  assert.match(source, /updateReliefMode/)
  assert.match(source, /recommendTerrainReliefOptions/)
  assert.match(source, /recommendTerrainReliefOptions\(parsed\.points, sizedOptions\)\.active/)
  assert.match(source, /recommendTerrainReliefOptions\(track\.points, sizedOptions\)\.active/)
  assert.match(source, /reliefRecommendation\?\.active/)
  assert.match(source, /activeReliefRecommendation/)
  assert.match(source, /当前模式/)
  assert.match(source, /起伏模式/)
  assert.match(source, /真实优先/)
  assert.match(source, /打印可读/)
  assert.match(source, /model\?\.stats\?\.reliefMm/)
  assert.match(source, /model\?\.stats\?\.realScaleReliefMm/)
  assert.match(source, /model\?\.stats\?\.verticalExaggeration/)
})

test('TerrainModelPage exposes printable snowline controls and preview mesh', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /snowlineEnabled/)
  assert.match(source, /snowlineElevationMeters/)
  assert.match(source, /snowlinePercentile/)
  assert.match(source, /snowCapThicknessMm/)
  assert.match(source, /model\.meshes\.snow/)
  assert.match(source, /雪线/)
  assert.match(source, /雪盖厚/)
})

test('TerrainModelPage exposes printable terrain color-band controls and preview mesh', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /terrainColorBandsEnabled/)
  assert.match(source, /lowlandPercentile/)
  assert.match(source, /lowlandCapThicknessMm/)
  assert.match(source, /model\.meshes\.lowland/)
  assert.match(source, /colorMode/)
  assert.match(source, /打印外观/)
  assert.match(source, /海拔分层/)
  assert.match(source, /卫星色彩映射/)
  assert.match(source, /elevationBands/)
  assert.match(source, /低地百分位/)
  assert.match(source, /表现细节/)
  assert.match(source, /模型规格/)
})

test('TerrainModelPage wires uploaded high precision DEM rasters into generation', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /parseArcAsciiGrid/)
  assert.match(source, /sampleRasterElevations/)
  assert.match(source, /recommendHighPrecisionTerrainOptions/)
  assert.match(source, /高精 DEM/)
  assert.match(source, /demRaster/)
  assert.match(source, /gridSpacingMm/)
})

test('TerrainModelPage exposes OpenTopography DEM fetch controls for free API keys', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /fetchOpenTopographyGlobalAsciiGrid/)
  assert.match(source, /buildBufferedWgs84Bounds/)
  assert.match(source, /OpenTopography/)
  assert.match(source, /COP30/)
  assert.match(source, /API Key/)
})

test('TerrainModelPage exposes DEM padding and locks model dimensions to GPX aspect', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /paddingMeters/)
  assert.match(source, /自动外扩/)
  assert.match(source, /modelLongSideMm/)
  assert.match(source, /成品长边/)
  assert.match(source, /自动宽深/)
  assert.match(source, /recommendModelDimensionsForTrack/)
  assert.match(source, /buildTerrainModelOptions/)
  assert.match(source, /buildBufferedWgs84Bounds\(track\.points, \{ paddingMeters: options\.paddingMeters \}\)/)
  assert.doesNotMatch(source, /<span>宽度 mm<\/span>\s*<input type="number" value=\{options\.modelWidthMm\}/)
  assert.doesNotMatch(source, /<span>深度 mm<\/span>\s*<input type="number" value=\{options\.modelDepthMm\}/)
})

test('TerrainModelPage shows the buffered terrain collection bounds on the route map', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /terrainBounds/)
  assert.match(source, /TerrainRouteMap\s+points=\{track\?\.points \|\| \[\]\}\s+terrainBounds=\{terrainBounds\}/s)
  assert.match(source, /L\.rectangle/)
  assert.match(source, /terrain-model-map-legend/)
  assert.match(source, /地形采集范围/)
  assert.match(source, /map\.fitBounds\(fitBounds/)
})

test('TerrainModelPage exposes a manual terrain collection range that flows into DEM and model generation', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /@geoman-io\/leaflet-geoman-free/)
  assert.match(source, /@geoman-io\/leaflet-geoman-free\/dist\/leaflet-geoman\.css/)
  assert.match(source, /terrainBoundsMode/)
  assert.match(source, /manualBoundsWgs84/)
  assert.match(source, /activeTerrainBoundsWgs84/)
  assert.match(source, /manualTerrainBoundsReady/)
  assert.match(source, /applyCurrentTerrainBounds/)
  assert.match(source, /applyManualTerrainBounds/)
  assert.match(source, /onManualFootprintChange/)
  assert.match(source, /框选范围/)
  assert.match(source, /手动范围/)
  assert.match(source, /南界/)
  assert.match(source, /北界/)
  assert.match(source, /西界/)
  assert.match(source, /东界/)
  assert.match(source, /map\.pm\.enableDraw\('Rectangle'/)
  assert.match(source, /manualFootprintWgs84/)
  assert.match(source, /terrainFootprintWgs84: activeManualFootprintWgs84/)
  assert.match(source, /terrainFootprintRotationDegrees: terrainBoundsMode === 'manual' \? manualFootprintRotationDegrees : 0/)
  assert.match(source, /createPresetFootprintPolygon/)
  assert.match(source, /map\.pm\.enableDraw\('Polygon'/)
  assert.match(source, /handleManualFootprintContextUndo/)
  assert.match(source, /map\.on\('contextmenu', handleManualFootprintContextUndo\)/)
  assert.match(source, /container\.addEventListener\('contextmenu', handleManualFootprintContextUndo, true\)/)
  assert.match(source, /map\.pm\?\.Draw\?\.Polygon\?\._removeLastVertex\?\.\(\)/)
  assert.match(source, /六边形/)
  assert.match(source, /三角形/)
  assert.match(source, /自定义/)
  assert.match(source, /manualFootprintRotationDegrees/)
  assert.match(source, /框选旋转/)
  assert.match(source, /onManualFootprintRotationChange/)
  assert.match(source, /createPresetFootprintPolygon\(baseBounds, manualFootprintShape, manualFootprintRotationDegrees\)/)
  assert.match(source, /createPresetFootprintPolygon\(nextBounds, 'rectangle', manualFootprintRotationDegrees\)/)
  assert.match(source, /map\.on\('pm:create'/)
  assert.match(source, /pm:edit/)
  assert.match(source, /pm:dragend/)
  assert.match(source, /pm\.enableLayerDrag/)
  assert.match(source, /terrainBoundsWgs84: activeTerrainBoundsWgs84/)
  assert.match(source, /buildBufferedWgs84Bounds\(track\.points, \{[\s\S]*terrainBoundsWgs84: activeTerrainBoundsWgs84/)
})

test('TerrainModelPage allows manual terrain bounds that do not cover the whole GPX track', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')
  const readiness = source.match(/const manualTerrainBoundsReady = useMemo\(\(\) => \(([\s\S]*?)\n {2}\), \[/)?.[1] || ''
  const applyManual = source.match(/const applyManualTerrainFootprint = useCallback\(\(footprint[\s\S]*?\n {2}\}, \[/)?.[0] || ''
  const rotateManual = source.match(/const updateManualFootprintRotation = useCallback\(\(value\) => \{([\s\S]*?)\n {2}\}, \[/)?.[0] || ''

  assert.match(readiness, /terrainBoundsMode !== 'manual'[\s\S]*activeTerrainBoundsWgs84/)
  assert.doesNotMatch(readiness, /boundsContainTrackPoints/)
  assert.doesNotMatch(readiness, /footprintContainTrackPoints/)
  assert.doesNotMatch(applyManual, /框选范围需要覆盖完整 GPX 轨迹/)
  assert.doesNotMatch(applyManual, /footprintContainTrackPoints\(nextFootprint, track\.points\)/)
  assert.doesNotMatch(rotateManual, /旋转后的框选范围需要覆盖完整 GPX 轨迹/)
  assert.doesNotMatch(rotateManual, /footprintContainTrackPoints\(nextFootprint, track\.points\)/)
})

test('TerrainModelPage enables map-side resizing for preset footprints and vertex editing for custom footprints', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')
  const routeMap = source.match(/function TerrainRouteMap\([\s\S]*?\n}\n\nfunction TerrainPreview/)?.[0] || ''

  assert.match(routeMap, /const isCustomFootprint = manualFootprintShape === 'custom'/)
  assert.match(routeMap, /allowEditing: isCustomFootprint/)
  assert.match(routeMap, /allowScale: true/)
  assert.match(routeMap, /uniformScaling: true/)
  assert.match(routeMap, /centerScaling: true/)
  assert.match(routeMap, /terrainLayer\.pm\.enableScale\?\.\(\)/)
  assert.match(routeMap, /terrainLayer\.on\('pm:scaleend', handleLayerChanged\)/)
  assert.match(routeMap, /terrainLayer\.off\('pm:scaleend', handleLayerChanged\)/)
  assert.match(routeMap, /自定义多边形保留顶点编辑/)
})

test('TerrainModelPage presents terrain collection range as a map-side control panel', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../../src/views/app/terrain-model/terrain-model.css', import.meta.url), 'utf8')

  assert.match(source, /function TerrainBoundsControlPanel/)
  assert.match(source, /terrain-model-bounds-panel/)
  assert.match(source, /采集范围状态/)
  assert.match(source, /坐标范围/)
  assert.match(source, /DEM \/ 模型/)
  assert.match(source, /onManualFootprintChange=\{applyManualTerrainFootprint\}/)
  assert.match(source, /terrain-model-bounds-panel__shape/)
  assert.match(css, /\.terrain-model-bounds-panel/)
  assert.match(css, /\.terrain-model-bounds-panel__mode/)
  assert.match(css, /\.terrain-model-map-status/)
})

test('TerrainModelPage starts manual bounds drawing on the first manual-adjust click', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')
  const handler = source.match(/const startManualTerrainBoundsDraw = useCallback\(\(\) => \{([\s\S]*?)\n {2}\}, \[/)?.[1] || ''
  const firstSwitchBranch = handler.match(/if \(terrainBoundsMode !== 'manual' \|\| !activeTerrainBoundsWgs84\) \{([\s\S]*?)\n {4}\}/)?.[1] || ''

  assert.match(firstSwitchBranch, /setTerrainBoundsMode\('manual'\)/)
  assert.match(firstSwitchBranch, /const initialFootprint = createPresetFootprintPolygon\(baseBounds, 'rectangle', manualFootprintRotationDegrees\)/)
  assert.match(firstSwitchBranch, /const initialBounds = manualFootprintToBoundsWgs84\(initialFootprint\) \|\| baseBounds/)
  assert.match(firstSwitchBranch, /setManualBoundsWgs84\(boundsToInputValues\(initialBounds\)\)/)
  assert.match(firstSwitchBranch, /setManualFootprintWgs84\(initialFootprint\)/)
  assert.match(firstSwitchBranch, /setManualDrawRequest\(\(current\) => current \+ 1\)/)
})

test('TerrainModelPage clears generated outputs when model-affecting controls change', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /const updateUseSampledTerrain = useCallback/)
  assert.match(source, /onChange=\{\(event\) => updateUseSampledTerrain\(event\.target\.checked\)\}/)

  for (const handlerName of [
    'updateUseSampledTerrain',
    'updateOption',
    'updateTerrainQuality',
    'updateStringOption',
    'updateBooleanOption',
    'updateOptionalNumberOption',
    'applyHighPrecisionRecommendation',
  ]) {
    const handler = source.match(new RegExp('const ' + handlerName + ' = useCallback\\([\\s\\S]*?\\n  \\}, \\['))?.[0] || ''
    assert.match(handler, /resetGeneratedOutputs\(\)/, handlerName + ' should clear stale model, preview, and delivery outputs')
  }
})

test('TerrainModelPage persists OpenTopography API keys only after local opt in', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /OPENTOPOGRAPHY_API_KEY_STORAGE_KEY/)
  assert.match(source, /rememberOpenTopoApiKey/)
  assert.match(source, /本机保存/)
  assert.match(source, /localStorage\.setItem\(OPENTOPOGRAPHY_API_KEY_STORAGE_KEY/)
  assert.match(source, /localStorage\.removeItem\(OPENTOPOGRAPHY_API_KEY_STORAGE_KEY/)
})

test('TerrainModelPage persists model configuration and supports JSON import/export without credentials', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /TERRAIN_MODEL_CONFIG_STORAGE_KEY/)
  assert.match(source, /door-terrain-model:config:v1/)
  assert.match(source, /readStoredTerrainModelConfig/)
  assert.match(source, /storeTerrainModelConfig/)
  assert.match(source, /buildTerrainModelConfigSnapshot/)
  assert.match(source, /storedTerrainModelConfig/)
  assert.match(source, /useState\(\(\) => storedTerrainModelConfig\.options\)/)
  assert.match(source, /useEffect\(\(\) => \{[\s\S]*storeTerrainModelConfig\(buildTerrainModelConfigSnapshot/s)
  assert.match(source, /handleExportConfig/)
  assert.match(source, /handleImportConfigFile/)
  assert.match(source, /application\/json,\.json/)
  assert.match(source, /导出配置/)
  assert.match(source, /导入配置/)
  const snapshotBuilder = source.match(/function buildTerrainModelConfigSnapshot\([\s\S]*?\n\}/)?.[0] || ''
  assert.doesNotMatch(snapshotBuilder, /surfaceTextureGoogleApiKey/)
  assert.doesNotMatch(snapshotBuilder, /openTopoApiKey/)
  assert.doesNotMatch(snapshotBuilder, /surfaceTextureCesiumAccessToken/)
})

test('TerrainModelPage exposes print-aware satellite colour controls and persists them with model configuration', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /satelliteColorStrategy/)
  assert.match(source, /balanced/)
  assert.match(source, /satelliteTerrainColorLimit/)
  assert.match(source, /satelliteMinPatchAreaMm2/)
  assert.match(source, /satelliteColorSmoothing/)
  assert.match(source, /平衡模式/)
  assert.match(source, /材料槽/)
  assert.match(source, /小色块/)
})

test('TerrainModelPage isolates satellite colour mode from default lowland and snow overlays', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /colorMode: 'satellite'[\s\S]*terrainColorBandsEnabled: false[\s\S]*snowlineEnabled: false/)
  assert.match(source, /terrainColorBandsEnabled: mode === 'satellite' \? false : true/)
  assert.match(source, /snowlineEnabled: mode === 'satellite' \? false : current\.snowlineEnabled/)
  assert.match(source, /disabled=\{options\.colorMode === 'satellite' \|\| !options\.terrainColorBandsEnabled\}/)
})

test('TerrainModelPage shows a DEM request status after OpenTopography fetches', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /openTopoStatus/)
  assert.match(source, /DEM 状态/)
  assert.match(source, /已获取/)
  assert.match(source, /请求失败/)
})

test('TerrainModelPage exposes satellite surface texture generation for GLB preview', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /buildSurfaceTextureDataUrl/)
  assert.match(source, /buildSurfaceTextureTilePlan/)
  assert.match(source, /surfaceTexture/)
  assert.match(source, /卫星贴图/)
  assert.match(source, /表面贴图/)
  assert.match(source, /createModelGroup\(model, \{ surfaceTextureMap/)
  assert.match(source, /satellite-texture\.glb/)
})

test('TerrainModelPage reports satellite texture progress instead of freezing behind a generic loading label', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /getSurfaceTextureProgressLabel/)
  assert.match(source, /onProgress/)
  assert.match(source, /读取瓦片/)
  assert.match(source, /压缩贴图/)
  assert.doesNotMatch(source, /buildingSurfaceTexture \? '生成中' : surfaceTextureStatus\.label/)
})

test('TerrainModelPage surfaces partial satellite texture warnings', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../../src/views/app/terrain-model/terrain-model.css', import.meta.url), 'utf8')

  assert.match(source, /qualityWarnings/)
  assert.match(source, /missingTileCount/)
  assert.match(source, /showWarning/)
  assert.match(source, /getSurfaceTextureStatusTone/)
  assert.match(css, /terrain-model-status--warning/)
})

test('TerrainModelPage applies satellite imagery only to the terrain top surface', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /splitTerrainMeshForSurfaceTexture/)
  assert.match(source, /terrainTopGeometry/)
  assert.match(source, /terrainSideGeometry/)
  assert.match(source, /map: surfaceTextureMap/)
  assert.match(source, /terrainSideMaterial/)
  assert.doesNotMatch(source, /meshToGeometry\(model\.meshes\.terrain, \{\s*vertexColors: !surfaceTextureMap,\s*surfaceTextureDimensions: surfaceTextureMap \? model\.stats : null,/s)
})

test('TerrainModelPage avoids rebuilding printable satellite shells when textured preview is available', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /renderPrintableColorBands/)
  assert.match(source, /PREVIEW_COLOR_BAND_FACE_BUDGET/)
  assert.match(source, /previewColorBandFaceCount <= PREVIEW_COLOR_BAND_FACE_BUDGET/)
  assert.match(source, /!\(surfaceTextureMap && model\.colorBands\?\.mode === 'satellite'\)/)
  assert.match(source, /renderPrintableColorBands[\s\S]*model\.meshes\.satelliteBands/)
})

test('TerrainModelPage renders preview and GLB meshes with right-handed Three coordinates', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /toThreeYUpCoordinateVertex/)
  assert.match(source, /const displayVertex = toThreeYUpCoordinateVertex\(vertex\)/)
  assert.match(source, /\[face\[0\],\s*face\[2\],\s*face\[1\]\]/)
  assert.match(source, /positions\.push\(displayVertex\.x, displayVertex\.y, displayVertex\.z\)/)
  assert.match(source, /getTerrainSurfaceUv\(vertex, options\.surfaceTextureDimensions\)/)
  assert.match(source, /camera\.up\.set\(0,\s*1,\s*0\)/)
  assert.doesNotMatch(source, /camera\.up\.set\(0,\s*0,\s*-1\)/)
})

test('TerrainModelPage exposes preview orientation and GLB coordinate metadata', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../../src/views/app/terrain-model/terrain-model.css', import.meta.url), 'utf8')

  assert.match(source, /group\.userData\.coordinateSystem/)
  assert.match(source, /trackMesh\.name = 'track-red'/)
  assert.match(source, /xAxis: 'east'/)
  assert.match(source, /yAxis: 'up'/)
  assert.match(source, /zAxis: 'south'/)
  assert.match(source, /terrain-model-preview__orientation/)
  assert.match(source, /北/)
  assert.match(source, /东/)
  assert.match(css, /terrain-model-preview__orientation/)
})

test('TerrainModelPage keeps preview orbit controls predictable and exposes camera presets', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../../src/views/app/terrain-model/terrain-model.css', import.meta.url), 'utf8')

  assert.match(source, /controls\.mouseButtons\s*=\s*\{/)
  assert.match(source, /LEFT:\s*THREE\.MOUSE\.ROTATE/)
  assert.match(source, /MIDDLE:\s*THREE\.MOUSE\.DOLLY/)
  assert.match(source, /RIGHT:\s*THREE\.MOUSE\.PAN/)
  assert.match(source, /controls\.touches\s*=\s*\{/)
  assert.match(source, /ONE:\s*THREE\.TOUCH\.ROTATE/)
  assert.match(source, /TWO:\s*THREE\.TOUCH\.DOLLY_PAN/)
  assert.match(source, /controls\.screenSpacePanning = true/)
  assert.match(source, /controls\.minPolarAngle/)
  assert.match(source, /controls\.maxPolarAngle/)
  assert.match(source, /setCameraView\('reset'\)/)
  assert.match(source, /setCameraView\('overhead'\)/)
  assert.match(source, /setCameraView\('front'\)/)
  assert.match(source, /setCameraView\('east'\)/)
  assert.match(source, /terrain-model-preview__camera/)
  assert.match(css, /touch-action:\s*none/)
  assert.match(css, /cursor:\s*grab/)
  assert.match(css, /terrain-model-preview__camera/)
})

test('TerrainModelPage exposes configurable satellite texture quality budgets', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /SURFACE_TEXTURE_QUALITY_PRESETS/)
  assert.match(source, /surfaceTextureQuality/)
  assert.match(source, /贴图精度/)
  assert.match(source, /maxTextureSize: textureQuality\.maxTextureSize/)
  assert.match(source, /maxTexturePixels: textureQuality\.maxTexturePixels/)
  assert.match(source, /maxTiles: textureQuality\.maxTiles/)
})

test('TerrainModelPage blocks GLB exports while enabled satellite texture is not ready', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /exportBlockedBySurfaceTexture/)
  assert.match(source, /surfaceTextureEnabled && \(!surfaceTexture \|\| buildingSurfaceTexture\)/)
  // GLB export button needs surface texture (uses exportBlockedBySurfaceTexture check)
  assert.match(source, /disabled=\{!model \|\| exportBlockedBySurfaceTexture \|\| exportingGlb\}/)
  // STL/3MF exports are NOT blocked by missing texture (use exportBlocked=exportingFiles instead)
  assert.match(source, /exportBlocked=\{exportingFiles\}/)
  // Both ZIP and GLB download handlers still check internally
  assert.match(source, /if \(exportBlockedBySurfaceTexture\)/)
  assert.match(source, /卫星贴图生成中，请稍后再导出/)
  assert.match(source, /请先生成卫星贴图，或关闭卫星贴图后导出/)
})

test('TerrainModelPage exposes Cesium ion and Google Maps texture credentials', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /createGoogleMapTilesSession/)
  assert.match(source, /fetchCesiumIonRasterSourceOptions/)
  assert.match(source, /VITE_GOOGLE_MAPS_TILE_API_KEY/)
  assert.match(source, /VITE_CESIUM_ION_TOKEN/)
  assert.match(source, /DEFAULT_CESIUM_ION_ASSET_ID/)
  assert.match(source, /Google Maps Tiles API Key/)
  assert.match(source, /Cesium ion Asset ID/)
  assert.match(source, /Cesium ion URL 模板/)
})

test('TerrainModelPage maps satellite textures onto terrain UVs instead of vertex colors', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /getTerrainSurfaceUv/)
  assert.match(source, /geometry\.setAttribute\('uv'/)
  assert.match(source, /map: surfaceTextureMap/)
  assert.match(source, /surfaceTextureDimensions: model\.stats/)
  assert.match(source, /vertexColors: true/)
  assert.doesNotMatch(source, /vertexColors: !surfaceTextureMap/)
})

test('TerrainModelPage surfaces production readiness checks before export', () => {
  const source = [
    '../../src/views/app/terrain-model/TerrainModelPage.jsx',
    '../../src/views/app/terrain-model/TerrainStatusPanels.jsx',
  ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n')

  assert.match(source, /evaluateTerrainModelReadiness/)
  assert.match(source, /printReadiness/)
  assert.match(source, /生产检查/)
  assert.match(source, /terrain-model-readiness/)
})

test('TerrainModelPage groups dense terrain controls into workflow sections and a delivery panel', () => {
  const source = [
    '../../src/views/app/terrain-model/TerrainModelPage.jsx',
    '../../src/views/app/terrain-model/TerrainDeliveryPanel.jsx',
    '../../src/views/app/terrain-model/TerrainStatusPanels.jsx',
  ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n')

  assert.match(source, /TerrainWorkflowStrip/)
  assert.match(source, /ControlSection/)
  assert.match(source, /DeliveryPanel/)
  assert.match(source, /terrain-model-workflow/)
  assert.match(source, /数据来源/)
  assert.match(source, /模型规格/)
  assert.match(source, /打印外观/)
  assert.match(source, /贴图预览/)
  assert.match(source, /表现细节/)
  assert.match(source, /交付清单/)
})

test('TerrainModelPage surfaces Bambu print handoff slots in the delivery panel', () => {
  const source = [
    '../../src/views/app/terrain-model/TerrainModelPage.jsx',
    '../../src/views/app/terrain-model/TerrainDeliveryPanel.jsx',
  ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n')
  const styles = readFileSync(new URL('../../src/views/app/terrain-model/terrain-model.css', import.meta.url), 'utf8')

  assert.match(source, /getBambuHandoffFromManifest/)
  assert.match(source, /BambuHandoffCard/)
  assert.match(source, /print\.bambu/)
  assert.match(source, /materialSlots\.map/)
  assert.match(source, /terrain-model-bambu-card/)
  assert.match(source, /terrain-model-bambu-card__actions/)
  assert.match(source, /terrain-model-bambu-preflight/)
  assert.match(source, /打印前检查/)
  assert.match(source, /preflight\.checks\.map/)
  assert.match(source, /check\.shortDetail \|\| check\.detail/)
  assert.match(source, /下载拓竹 3MF/)
  assert.match(source, /查看打印说明/)
  assert.match(source, /Bambu Studio 打开后按耗材槽核对颜色/)
  assert.match(source, /getDeliveryFileBadge/)
  assert.match(source, /推荐下载/)
  assert.match(source, /备用 3MF/)
  assert.match(source, /记录与说明/)
  assert.match(source, /预览文件/)
  assert.match(source, /terrain-model-downloads__badge/)
  assert.match(source, /terrain-model-bambu-slot__parts/)
  assert.match(source, /拓竹打印包/)
  assert.match(source, /耗材槽/)
  assert.match(styles, /terrain-model-bambu-card/)
  assert.match(styles, /terrain-model-bambu-card__actions/)
  assert.match(styles, /terrain-model-bambu-preflight/)
  assert.match(styles, /terrain-model-bambu-preflight__checks/)
  assert.match(styles, /terrain-model-bambu-slot__swatch/)
  assert.match(styles, /terrain-model-bambu-slot__parts/)
  assert.match(styles, /terrain-model-downloads__badge/)
})

test('TerrainModelPage starts with a slicer-safe low raised track height', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /trackHeightMm:\s*0\.6/)
})

test('TerrainModelPage falls back when WebGL preview cannot be created', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /previewError/)
  assert.match(source, /WebGL 预览不可用/)
  assert.match(source, /new THREE\.WebGLRenderer/)
  assert.match(source, /catch \(error\)/)
})

test('buildTerrainModel filters isolated sampled DEM spikes and voids before scaling', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 8,
    gridCols: 8,
    modelWidthMm: 120,
    modelDepthMm: 90,
    baseHeightMm: 2,
    verticalScale: 0.18,
    trackHeightMm: 1,
    sampleElevations: async (samples) => samples.map((_, index) => {
      if (index === 18) return 2500
      if (index === 37) return null
      return 700 + (index % 5)
    }),
  })

  assert.ok(model.stats.elevationGainMeters <= 10)
  assert.ok(model.stats.maxHeightMm < 6)
  assert.ok(model.terrain.minElevationMeters >= 699)
  assert.ok(model.terrain.maxElevationMeters <= 706)
})

test('recommendPrintReadableOptions caps uploaded GPX relief for print readability', () => {
  const { points } = parseGpxTrack(gpx)

  const recommendation = recommendPrintReadableOptions(points, {
    modelWidthMm: 120,
    modelDepthMm: 90,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    maxReliefMm: 42,
  })

  assert.equal(recommendation.mode, 'print-readable')
  assert.ok(recommendation.maxReliefMm >= 6)
  assert.ok(recommendation.maxReliefMm <= 22)
  assert.notEqual(recommendation.maxReliefMm, 42)
  assert.equal(recommendation.contourIntervalMeters, 10)
  assert.ok(recommendation.elevationRangeMeters >= 50)
  assert.ok(recommendation.realScaleReliefMm > 0)
  assert.ok(recommendation.scaleMmPerMeter > 0)
})

test('recommendTerrainReliefOptions separates true-scale and print-readable relief targets', () => {
  const { points } = parseGpxTrack(gpx)

  const recommendation = recommendTerrainReliefOptions(points, {
    reliefMode: 'realistic',
    modelWidthMm: 120,
    modelDepthMm: 90,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    maxReliefMm: 42,
  })

  assert.equal(recommendation.active.mode, 'realistic')
  assert.equal(recommendation.realistic.mode, 'realistic')
  assert.equal(recommendation.printReadable.mode, 'print-readable')
  assert.ok(recommendation.realistic.maxReliefMm <= recommendation.printReadable.maxReliefMm)
  assert.ok(recommendation.realistic.verticalExaggeration <= recommendation.printReadable.verticalExaggeration)
  assert.ok(recommendation.realistic.maxReliefMm >= 3)
  assert.ok(recommendation.printReadable.maxReliefMm >= 6)
  assert.ok(recommendation.printReadable.verticalScale > 0.18)
  assert.equal(
    recommendation.printReadable.verticalScale,
    Number((recommendation.printReadable.maxReliefMm / recommendation.printReadable.elevationRangeMeters).toFixed(6)),
  )

  const printMode = recommendTerrainReliefOptions(points, {
    reliefMode: 'print-readable',
    modelWidthMm: 120,
    modelDepthMm: 90,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
  })
  assert.equal(printMode.active.mode, 'print-readable')
  assert.equal(printMode.active.maxReliefMm, printMode.printReadable.maxReliefMm)

  const loweredCap = recommendTerrainReliefOptions(points, {
    reliefMode: 'realistic',
    modelWidthMm: 120,
    modelDepthMm: 90,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    maxReliefMm: 4,
  })
  assert.ok(loweredCap.realistic.realScaleReliefMm > 4)
  assert.ok(loweredCap.active.maxReliefMm > 4)
})

test('TerrainModelPage applies relief targets to vertical scale instead of only changing the cap', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /resolveVerticalScaleForReliefTarget/)
  assert.match(source, /verticalScale: recommendation\.verticalScale/)
  assert.match(source, /key === 'maxReliefMm'/)
  assert.match(source, /verticalScale: resolveVerticalScaleForReliefTarget\(/)
  assert.match(source, /key === 'verticalScale'/)
  assert.match(source, /maxReliefMm: Math\.max\(/)
})

test('recommendTerrainReliefOptions gives long mountain routes enough printable relief', () => {
  const points = [
    { latitude: 34.0, longitude: 99.0, elevation: 3880 },
    { latitude: 34.0, longitude: 99.2, elevation: 4060 },
    { latitude: 34.0, longitude: 99.4, elevation: 4320 },
    { latitude: 34.0, longitude: 99.6, elevation: 4600 },
  ]

  const recommendation = recommendTerrainReliefOptions(points, {
    reliefMode: 'print-readable',
    modelWidthMm: 120,
    modelDepthMm: 104,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
  })

  assert.equal(recommendation.active.mode, 'print-readable')
  assert.ok(recommendation.realistic.trueReliefMm < 4)
  assert.ok(recommendation.active.maxReliefMm >= 14)
  assert.ok(recommendation.active.verticalExaggeration >= 4)
  assert.ok(recommendation.active.maxReliefMm <= 24)
})

test('recommendTerrainPrintStyleOptions enables clear snow and lowland bands for alpine routes', () => {
  const points = [
    { latitude: 34.0, longitude: 99.0, elevation: 3880 },
    { latitude: 34.02, longitude: 99.15, elevation: 4040 },
    { latitude: 34.04, longitude: 99.3, elevation: 4210 },
    { latitude: 34.06, longitude: 99.45, elevation: 4410 },
    { latitude: 34.08, longitude: 99.6, elevation: 4600 },
  ]

  const style = recommendTerrainPrintStyleOptions(points, {
    terrainColorBandsEnabled: false,
    snowlineEnabled: false,
    lowlandPercentile: 35,
    snowlinePercentile: 82,
  })

  assert.equal(style.terrainColorBandsEnabled, true)
  assert.equal(style.snowlineEnabled, true)
  assert.ok(style.lowlandPercentile >= 0.36)
  assert.ok(style.lowlandPercentile <= 0.42)
  assert.ok(style.snowlinePercentile >= 0.76)
  assert.ok(style.snowlinePercentile <= 0.8)
  assert.equal(style.snowlineElevationMeters, null)
  assert.ok(style.elevationRangeMeters >= 700)
})

test('recommendTerrainPrintStyleOptions keeps snowline off for non-alpine local routes', () => {
  const { points } = parseGpxTrack(gpx)

  const style = recommendTerrainPrintStyleOptions(points, {
    terrainColorBandsEnabled: false,
    snowlineEnabled: false,
  })

  assert.equal(style.terrainColorBandsEnabled, true)
  assert.equal(style.snowlineEnabled, false)
  assert.ok(style.lowlandPercentile <= 0.35)
})

test('buildTerrainModel creates real contour geometry when contour export is enabled', async () => {
  const { points } = parseGpxTrack(gpx)
  const baseOptions = {
    gridRows: 8,
    gridCols: 8,
    shapeType: 'rectangle',
    modelWidthMm: 120,
    modelDepthMm: 90,
    baseHeightMm: 2,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((_, index) => 600 + Math.floor(index / 8) * 7),
  }

  const withoutContours = await buildTerrainModel(points, {
    ...baseOptions,
    contourEnabled: false,
  })
  const withContours = await buildTerrainModel(points, {
    ...baseOptions,
    contourEnabled: true,
    contourIntervalMeters: 10,
    contourWidthMm: 0.6,
    contourHeightMm: 0.4,
  })

  assert.equal(withoutContours.contours.enabled, false)
  assert.equal(withoutContours.meshes.contours.faces.length, 0)
  assert.equal(withContours.contours.enabled, true)
  assert.ok(withContours.contours.levelsMeters.length > 0)
  assert.ok(withContours.contours.segmentCount > 0)
  assert.ok(withContours.meshes.contours.vertices.length > 0)
  assert.ok(withContours.meshes.contours.faces.length > 0)
  assert.equal(withContours.stats.contourTriangles, withContours.meshes.contours.faces.length)
  assert.equal(
    withContours.meshes.combined.faces.length,
    withContours.meshes.terrain.faces.length
      + withContours.meshes.contours.faces.length
      + withContours.meshes.track.faces.length,
  )
})

test('buildTerrainModel creates a printable snow-cap mesh above the configured snowline', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 10,
    gridCols: 10,
    shapeType: 'hexagon',
    modelWidthMm: 120,
    modelDepthMm: 104,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    labelText: '12K',
    snowlineEnabled: true,
    snowlineElevationMeters: 660,
    snowCapThicknessMm: 0.5,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((_, index) => 620 + Math.floor(index / 10) * 10),
  })

  assert.equal(model.snowline.enabled, true)
  assert.equal(model.snowline.elevationMeters, 660)
  assert.equal(model.snowline.thicknessMm, 0.5)
  assert.ok(model.snowline.coveredTriangleCount > 0)
  assert.ok(model.snowline.coverageRatio > 0)
  assert.ok(model.meshes.snow.vertices.length > 0)
  assert.ok(model.meshes.snow.faces.length > 0)
  assert.equal(model.stats.snowTriangles, model.meshes.snow.faces.length)
  assert.ok(model.meshes.combined.faces.length > model.meshes.terrain.faces.length + model.meshes.track.faces.length)

  const snowYs = model.meshes.snow.vertices.map((vertex) => vertex.y)
  const minSnowY = Math.min(...snowYs)
  const maxSnowY = Math.max(...snowYs)
  const snowlineY = model.stats.baseHeightMm + (660 - model.terrain.minElevationMeters) * model.stats.effectiveVerticalScale - 0.1
  assert.ok(maxSnowY >= snowlineY)
  assert.ok(minSnowY <= -0.2)
})

test('buildTerrainModel creates a printable green lowland paint shell below the configured percentile', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 10,
    gridCols: 10,
    shapeType: 'hexagon',
    modelWidthMm: 120,
    modelDepthMm: 104,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    labelText: '12K',
    terrainColorBandsEnabled: true,
    lowlandPercentile: 35,
    lowlandCapThicknessMm: 0.45,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((_, index) => 620 + Math.floor(index / 10) * 10),
  })

  assert.equal(model.colorBands.enabled, true)
  assert.equal(model.colorBands.lowland.enabled, true)
  assert.equal(model.colorBands.lowland.thresholdSource, 'percentile')
  assert.equal(model.colorBands.lowland.percentile, 0.35)
  assert.equal(model.colorBands.lowland.thicknessMm, 0.45)
  assert.ok(model.colorBands.lowland.elevationMeters > model.terrain.minElevationMeters)
  assert.ok(model.colorBands.lowland.coveredTriangleCount > 0)
  assert.ok(model.colorBands.lowland.coverageRatio > 0)
  assert.ok(model.meshes.lowland.vertices.length > 0)
  assert.ok(model.meshes.lowland.faces.length > 0)
  assert.equal(model.stats.lowlandTriangles, model.meshes.lowland.faces.length)
  assert.ok(model.meshes.combined.faces.length > model.meshes.terrain.faces.length + model.meshes.track.faces.length)
})

test('buildTerrainModel treats an empty snowline elevation as automatic percentile mode', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 10,
    gridCols: 10,
    shapeType: 'hexagon',
    snowlineEnabled: true,
    snowlineElevationMeters: '',
    snowlinePercentile: 82,
    snowCapThicknessMm: 0.5,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((_, index) => 620 + Math.floor(index / 10) * 10),
  })

  assert.equal(model.snowline.thresholdSource, 'percentile')
  assert.ok(model.snowline.elevationMeters > model.terrain.minElevationMeters)
  assert.ok(model.snowline.elevationMeters < model.terrain.maxElevationMeters)
})

test('buildTerrainModel draws snowline segments across descending elevation edges', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 10,
    gridCols: 10,
    shapeType: 'hexagon',
    snowlineEnabled: true,
    snowlineElevationMeters: 650,
    snowCapThicknessMm: 0.5,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((_, index) => 690 - Math.floor(index / 10) * 10),
  })

  assert.equal(model.snowline.thresholdSource, 'manual')
  assert.ok(model.snowline.segmentCount > 0)
  assert.ok(model.meshes.snowline.faces.length > 0)
})

test('buildTerrainModel embeds raised multi-material overlays into supporting solids', async () => {
  const points = Array.from({ length: 8 }, (_, index) => ({
    latitude: 30.9 + index * 0.001,
    longitude: 103.57,
    elevation: 620 + index * 4,
  }))
  const gridCols = 12
  const model = await buildTerrainModel(points, {
    gridRows: 12,
    gridCols,
    shapeType: 'rectangle',
    modelWidthMm: 120,
    modelDepthMm: 90,
    baseHeightMm: 2,
    basePlateHeightMm: 3,
    frameWidthMm: 8,
    labelText: '12K',
    contourEnabled: true,
    contourIntervalMeters: 20,
    contourWidthMm: 0.8,
    contourHeightMm: 0.35,
    snowlineEnabled: true,
    snowlineElevationMeters: 700,
    snowlineWidthMm: 1,
    snowlineHeightMm: 0.45,
    trackWidthMm: 6,
    trackHeightMm: 1,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((_, index) => {
      const row = Math.floor(index / gridCols)
      const col = index % gridCols
      return 600 + col * 18 + row * 6
    }),
  })
  const supportHeightAt = createModelTerrainHeightAt(model)
  const trackBottomVertices = model.meshes.track.vertices.filter((_, index) => index % 4 >= 2)
  const contourBottomVertices = model.meshes.contours.vertices.filter((_, index) => index % 8 < 4)
  const snowlineBottomVertices = model.meshes.snowline.vertices.filter((_, index) => index % 8 < 4)
  const terrainBottomVertices = model.meshes.terrain.vertices.slice(model.terrain.rows * model.terrain.cols)

  assert.ok(trackBottomVertices.length > 0)
  assert.ok(contourBottomVertices.length > 0)
  assert.ok(snowlineBottomVertices.length > 0)
  assert.ok(terrainBottomVertices.length > 0)
  assert.ok(model.meshes.text.vertices.length > 0)
  assert.ok(
    Math.min(...terrainBottomVertices.map((vertex) => vertex.y)) <= -0.2,
    'terrain body should overlap the base plate by at least one slicer layer',
  )
  assert.ok(
    maxFloatingClearance(trackBottomVertices, supportHeightAt) <= -0.2,
    'track bottom should embed into the terrain by at least one slicer layer',
  )
  assert.ok(
    maxFloatingClearance(contourBottomVertices, supportHeightAt) <= -0.2,
    'contour bottoms should embed into the terrain by at least one slicer layer',
  )
  assert.ok(
    maxFloatingClearance(snowlineBottomVertices, supportHeightAt) <= -0.2,
    'snowline bottom should embed into the terrain by at least one slicer layer',
  )
  assert.ok(
    Math.min(...model.meshes.text.vertices.map((vertex) => vertex.y)) <= -0.2,
    'raised label should overlap the base plate by at least one slicer layer',
  )
})

test('meshToAsciiStl and export files produce named printable artifacts', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 6,
    gridCols: 6,
    sampleElevations: async (samples) => samples.map((_, index) => 600 + index),
  })

  const stl = meshToAsciiStl(model.meshes.combined, 'terrain_route')
  assert.match(stl, /^solid terrain_route/)
  assert.match(stl, /facet normal/)
  assert.match(stl, /endsolid terrain_route\n$/)

  const files = buildTerrainModelExportFiles(model, { baseName: 'qingcheng-12k' })
  assert.deepEqual(files.map((file) => file.name), [
    'qingcheng-12k-terrain-track.stl',
    'qingcheng-12k-terrain.stl',
    'qingcheng-12k-track.stl',
    'qingcheng-12k-manifest.json',
  ])
  assert.match(files[3].content, /"kind": "door-terrain-track-model"/)
})

test('buildTerrainModelExportFiles includes optional satellite texture image and manifest metadata', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 6,
    gridCols: 6,
    sampleElevations: async (samples) => samples.map((_, index) => 600 + index),
  })

  const files = buildTerrainModelExportFiles(model, {
    baseName: 'qingcheng-12k',
    surfaceTexture: {
      kind: 'terrain-surface-texture',
      source: {
        key: 'esriWorldImagery',
        name: 'Esri World Imagery',
        attribution: 'Source: Esri World Imagery',
      },
      zoom: 13,
      tileCount: 4,
      textureWidth: 512,
      textureHeight: 512,
      bounds: model.terrain.boundsWgs84,
      coverageBounds: model.terrain.boundsWgs84,
      mimeType: 'image/png',
      imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
      generatedAt: '2026-05-19T00:00:00.000Z',
    },
  })
  const fileNames = files.map((file) => file.name)

  assert.deepEqual(fileNames, [
    'qingcheng-12k-terrain-track.stl',
    'qingcheng-12k-terrain.stl',
    'qingcheng-12k-track.stl',
    'qingcheng-12k-surface-texture.png',
    'qingcheng-12k-manifest.json',
  ])

  const textureFile = files.find((file) => file.name === 'qingcheng-12k-surface-texture.png')
  assert.equal(textureFile.mimeType, 'image/png')
  assert.ok(textureFile.content instanceof Uint8Array)
  assert.ok(textureFile.content.length > 0)

  const manifest = JSON.parse(files.at(-1).content)
  assert.equal(manifest.surfaceTexture.enabled, true)
  assert.equal(manifest.surfaceTexture.file, 'qingcheng-12k-surface-texture.png')
  assert.equal(manifest.surfaceTexture.source.key, 'esriWorldImagery')
  assert.equal(manifest.surfaceTexture.zoom, 13)
  assert.equal(manifest.surfaceTexture.dimensions.width, 512)
  assert.deepEqual(manifest.export.files, fileNames)
})

test('buildTerrainModelExportFiles embeds satellite texture coordinates into print-kit 3MF', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 6,
    gridCols: 6,
    shapeType: 'hexagon',
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    labelText: '12K',
    sampleElevations: async (samples) => samples.map((_, index) => 600 + index),
  })

  const files = buildTerrainModelExportFiles(model, {
    baseName: 'qingcheng-textured-print',
    surfaceTexture: {
      kind: 'terrain-surface-texture',
      source: {
        key: 'cesiumIonRaster',
        name: 'Cesium ion 影像',
        attribution: 'Source: Cesium ion imagery',
      },
      zoom: 14,
      tileCount: 4,
      textureWidth: 512,
      textureHeight: 256,
      bounds: model.terrain.boundsWgs84,
      coverageBounds: model.terrain.boundsWgs84,
      mimeType: 'image/png',
      imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
      generatedAt: '2026-05-19T00:00:00.000Z',
    },
  })

  const threeMf = files.find((file) => file.name === 'qingcheng-textured-print-print-kit.3mf')
  assert.ok(threeMf, 'print-kit 3MF exists')
  const archive = new PizZip(threeMf.content)
  const modelXml = archive.file('3D/3dmodel.model').asText()

  assert.ok(archive.file('3D/Textures/qingcheng-textured-print-surface-texture.png'))
  assert.match(modelXml, /<m:texture2d id="\d+" path="\/3D\/Textures\/qingcheng-textured-print-surface-texture\.png" contenttype="image\/png"/)
  assert.match(modelXml, /<m:texture2dgroup id="\d+" texid="\d+">/)
  assert.match(modelXml, /<m:tex2coord u="0\.00000" v="1\.00000"\/>/)
  assert.match(modelXml, /<triangle[^>]*pid="\d+"[^>]*p1="\d+"[^>]*p2="\d+"[^>]*p3="\d+"/)
  const resourceIds = Array.from(modelXml.matchAll(/(?:<m:(?:basematerials|texture2d|texture2dgroup)\b[^>]*\bid|<object\b[^>]*\bid)="(\d+)"/g))
    .map((match) => match[1])
  assert.equal(new Set(resourceIds).size, resourceIds.length)

  const manifest = JSON.parse(files.at(-1).content)
  assert.equal(manifest.surfaceTexture.enabled, true)
  assert.equal(manifest.surfaceTexture.threeMfEmbedded, true)
  assert.equal(manifest.surfaceTexture.threeMfTexturePath, '/3D/Textures/qingcheng-textured-print-surface-texture.png')
  assert.equal(manifest.surfaceTexture.printWorkflow, '3mf-texture-exchange; fdm-printing-requires slicer texture support or color quantization')
})

test('buildTerrainModelExportFiles includes a Bambu-compatible multi-color 3MF package', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 6,
    gridCols: 6,
    shapeType: 'hexagon',
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    labelText: '12K',
    sampleElevations: async (samples) => samples.map((_, index) => 600 + index),
  })

  const files = buildTerrainModelExportFiles(model, {
    baseName: 'qingcheng-bambu-print',
  })

  const bambu3mf = files.find((file) => file.name === 'qingcheng-bambu-print-bambu-print.3mf')
  assert.ok(bambu3mf, 'Bambu 3MF exists')
  assert.equal(bambu3mf.mimeType, 'model/3mf')

  const archive = new PizZip(bambu3mf.content)
  assert.ok(archive.file('Metadata/model_settings.config'), 'Bambu model settings exist')
  assert.ok(archive.file('Metadata/project_settings.config'), 'Bambu project settings exist')
  assert.ok(archive.file('3D/Objects/object_1.model'), 'split object model exists')

  const rootModelXml = archive.file('3D/3dmodel.model').asText()
  assert.match(rootModelXml, /xmlns:BambuStudio="http:\/\/schemas\.bambulab\.com\/package\/2021"/)
  assert.match(rootModelXml, /<component p:path="\/3D\/Objects\/object_1\.model" objectid="1"/)
  assert.match(rootModelXml, /<component p:path="\/3D\/Objects\/object_2\.model" objectid="2"/)
  assert.equal((rootModelXml.match(/<item objectid="/g) || []).length, 1)
  assert.match(rootModelXml, /<item objectid="5"[^>]*printable="1"/)

  const modelSettings = archive.file('Metadata/model_settings.config').asText()
  assert.equal((modelSettings.match(/<object id="/g) || []).length, 1)
  assert.match(modelSettings, /<object id="5">[\s\S]*?<metadata key="name" value="qingcheng-bambu-print"\/>/)
  assert.match(modelSettings, /<part id="1" subtype="normal_part">[\s\S]*?<metadata key="name" value="terrain"\/>[\s\S]*?<metadata key="extruder" value="1"\/>/)
  assert.match(modelSettings, /<part id="2" subtype="normal_part">[\s\S]*?<metadata key="name" value="track-red"\/>[\s\S]*?<metadata key="extruder" value="2"\/>/)
  assert.match(modelSettings, /<part id="3" subtype="normal_part">[\s\S]*?<metadata key="name" value="base-black"\/>[\s\S]*?<metadata key="extruder" value="3"\/>/)
  assert.match(modelSettings, /<part id="4" subtype="normal_part">[\s\S]*?<metadata key="name" value="label-white"\/>[\s\S]*?<metadata key="extruder" value="4"\/>/)
  assert.equal((modelSettings.match(/<model_instance>/g) || []).length, 1)
  assert.match(modelSettings, /<model_instance>[\s\S]*?<metadata key="object_id" value="5"\/>[\s\S]*?<metadata key="identify_id" value="1"\/>[\s\S]*?<\/model_instance>/)
  assert.match(modelSettings, /<assemble>[\s\S]*?<assemble_item object_id="5" instance_id="0"/)

  const projectSettings = JSON.parse(archive.file('Metadata/project_settings.config').asText())
  assert.deepEqual(projectSettings.filament_colour.slice(0, 4), [
    '#C79435',
    '#D63B2E',
    '#171717',
    '#F5F5F4',
  ])
  assert.deepEqual(projectSettings.filament_settings_id.slice(0, 4), [
    'Bambu PLA Basic @BBL H2C',
    'Bambu PLA Basic @BBL H2C',
    'Bambu PLA Basic @BBL H2C',
    'Bambu PLA Basic @BBL H2C',
  ])
  assert.deepEqual(projectSettings.filament_ids.slice(0, 4), ['GFA00', 'GFA00', 'GFA00', 'GFA00'])
  assert.deepEqual(projectSettings.filament_vendor.slice(0, 4), ['Bambu Lab', 'Bambu Lab', 'Bambu Lab', 'Bambu Lab'])
  assert.deepEqual(projectSettings.nozzle_volume_type, ['Standard', 'Standard'])
  assert.deepEqual(projectSettings.default_nozzle_volume_type, ['Standard', 'Standard'])
  assert.deepEqual(projectSettings.eng_plate_temp, ['55', '55', '55', '55'])
  assert.deepEqual(projectSettings.eng_plate_temp_initial_layer, ['55', '55', '55', '55'])
  assert.deepEqual(projectSettings.nozzle_temperature, ['220', '220', '220', '220', '220', '220', '220', '220'])
  assert.deepEqual(projectSettings.nozzle_temperature_initial_layer, ['220', '220', '220', '220', '220', '220', '220', '220'])
  assert.deepEqual(projectSettings.filament_self_index, ['1', '1', '2', '2', '3', '3', '4', '4'])
  assertBambuFlushSettingsMatchH2cVariants(projectSettings)
  assert.deepEqual(projectSettings.extruder_nozzle_stats, ['Standard#1', 'Standard#4'])
  assert.deepEqual(projectSettings.extruder_printable_area, [
    '0x0,325x0,325x320,0x320',
    '25x0,330x0,330x320,25x320',
  ])
  assert.deepEqual(projectSettings.extruder_printable_height, ['320', '325'])
  assert.deepEqual(projectSettings.print_extruder_id, ['1', '1', '2', '2'])
  assert.deepEqual(projectSettings.print_extruder_variant, [
    'Direct Drive Standard',
    'Direct Drive High Flow',
    'Direct Drive Standard',
    'Direct Drive High Flow',
  ])

  const sliceInfo = archive.file('Metadata/slice_info.config').asText()
  assert.match(sliceInfo, /<plate>/)
  assert.match(sliceInfo, /<metadata key="printer_model_id" value="O1C2"\/>/)
  assert.match(sliceInfo, /<object identify_id="1" name="qingcheng-bambu-print" skipped="false" \/>/)
  assert.match(sliceInfo, /<filament id="1" tray_info_idx="GFA00" type="PLA" color="#C79435"/)
  assert.match(sliceInfo, /<filament id="4" tray_info_idx="GFA00" type="PLA" color="#F5F5F4"/)

  const printGuide = files.find((file) => file.name === 'qingcheng-bambu-print-bambu-print-guide.txt')
  assert.ok(printGuide, 'Bambu print guide exists')
  assert.match(printGuide.content, /Open: qingcheng-bambu-print-bambu-print\.3mf/)
  assert.match(printGuide.content, /Print preflight/)
  assert.match(printGuide.content, /Bambu package: .*qingcheng-bambu-print-bambu-print\.3mf/)
  assert.match(printGuide.content, /Material slots: .*Slot 1 #C79435/)
  assert.match(printGuide.content, /Build size: .*mm/)
  assert.match(printGuide.content, /Slot 1: #C79435 .* terrain/)
  assert.match(printGuide.content, /Slot 4: #F5F5F4 .* label-white/)

  const manifest = JSON.parse(files.at(-1).content)
  assert.equal(manifest.print.bambuPackage3mf, 'qingcheng-bambu-print-bambu-print.3mf')
  assert.equal(manifest.print.bambuWorkflow, 'bambu-orca-3mf-object-extruder-colors')
  assert.equal(manifest.print.bambu.materialSlotCount, 4)
  assert.equal(manifest.print.bambu.geometryStrategy.colorBodies, 'anchored-to-base')
  assert.equal(manifest.print.bambu.geometryStrategy.layerLockOverlapMm, 0.22)
  assert.equal(manifest.print.bambu.geometryStrategy.route.strategy, 'print-scale-simplified-ribbon')
  assert.equal(manifest.route.printGeometry.strategy, 'print-scale-simplified-ribbon')
  assert.ok(manifest.route.printGeometry.printablePointCount <= manifest.route.printGeometry.sourcePointCount)
  assert.ok(Number.isFinite(manifest.route.printGeometry.simplifyToleranceMm))
  assert.equal(manifest.print.bambu.printerProfile.printerSettingsId, 'Bambu Lab H2C 0.4 nozzle')
  assert.equal(manifest.print.bambu.printerProfile.filamentSettingsId, 'Bambu PLA Basic @BBL H2C')
  assert.deepEqual(manifest.print.bambu.materialSlots.map((slot) => slot.color), [
    '#C79435',
    '#D63B2E',
    '#171717',
    '#F5F5F4',
  ])
  assert.deepEqual(manifest.print.bambu.materialSlots.at(-1).parts, ['label-white'])
  assert.equal(manifest.print.preflight.status, manifest.readiness.status)
  assert.equal(manifest.print.bambu.preflight.status, manifest.readiness.status)
  assert.deepEqual(
    manifest.print.preflight.checks.map((check) => check.key),
    ['production-readiness', 'bambu-package', 'material-slots', 'build-size', 'relief-scale', 'color-separation', 'print-geometry', 'surface-texture'],
  )
  assert.match(manifest.print.preflight.checks.find((check) => check.key === 'print-geometry').detail, /0\.22 mm/)
  assert.equal(manifest.print.preflight.checks.find((check) => check.key === 'bambu-package').status, 'ok')
  assert.match(manifest.print.preflight.checks.find((check) => check.key === 'material-slots').detail, /Slot 1 #C79435/)
  assert.match(manifest.print.preflight.checks.find((check) => check.key === 'build-size').detail, /mm/)
  assert.match(manifest.print.preflight.checks.find((check) => check.key === 'surface-texture').detail, /FDM/)
})

test('buildTerrainModelExportFiles writes Bambu overlays as one assembled object', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 10,
    gridCols: 10,
    shapeType: 'hexagon',
    modelWidthMm: 120,
    modelDepthMm: 104,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    labelText: '12K',
    contourEnabled: true,
    contourIntervalMeters: 10,
    snowlineEnabled: true,
    snowlineElevationMeters: 660,
    snowCapThicknessMm: 0.5,
    terrainColorBandsEnabled: true,
    lowlandPercentile: 35,
    lowlandCapThicknessMm: 0.45,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((_, index) => 620 + Math.floor(index / 10) * 10),
  })

  const files = buildTerrainModelExportFiles(model, { baseName: 'qingcheng-bambu-assembly' })
  const bambu3mf = files.find((file) => file.name === 'qingcheng-bambu-assembly-bambu-print.3mf')
  const archive = new PizZip(bambu3mf.content)
  const rootModelXml = archive.file('3D/3dmodel.model').asText()
  const modelSettings = archive.file('Metadata/model_settings.config').asText()
  const manifest = JSON.parse(files.at(-1).content)
  const partAssignments = manifest.print.bambu.partAssignments

  assert.equal(Array.from(rootModelXml.matchAll(/<item\b/g)).length, 1)
  assert.ok(Array.from(rootModelXml.matchAll(/<component\b/g)).length >= partAssignments.length)
  assert.equal(Array.from(modelSettings.matchAll(/<model_instance>/g)).length, 1)
  assert.equal(Array.from(modelSettings.matchAll(/<assemble_item\b/g)).length, 1)
  assert.equal(Array.from(modelSettings.matchAll(/<object id="/g)).length, 1)
  for (const [index, assignment] of partAssignments.entries()) {
    assert.match(
      modelSettings,
      new RegExp('<part id="' + (index + 1) + '" subtype="normal_part">[\\s\\S]*?<metadata key="name" value="' + assignment.name + '"\\/>[\\s\\S]*?<metadata key="extruder" value="' + assignment.slot + '"\\/>'),
    )
  }
})

test('buildTerrainPrintPreflight marks build size for review when dimensions are unavailable', () => {
  const preflight = buildTerrainPrintPreflight({
    stats: {
      maxHeightMm: 16,
      basePlateHeightMm: 3,
      reliefMm: 14,
      verticalExaggeration: 4,
    },
    colorBands: {
      lowland: {
        enabled: true,
        coverageRatio: 0.36,
      },
    },
    snowline: {
      enabled: false,
      coverageRatio: 0,
    },
    contours: {
      enabled: false,
      segmentCount: 0,
    },
  }, {
    package3mf: 'qingcheng-bambu-print.3mf',
    guideFile: 'qingcheng-bambu-print-guide.txt',
    materialSlots: [
      {
        slot: 1,
        color: '#C79435',
        parts: ['terrain'],
      },
    ],
  }, {
    status: 'ready',
    label: '可打印',
    warnings: [],
    checks: [
      {
        key: 'relief-scale',
        status: 'ok',
        label: '起伏倍率',
        detail: '模型起伏 14 mm，垂直倍率 4x。',
      },
      {
        key: 'print-colors',
        status: 'ok',
        label: '地形分色',
        detail: '低地实体覆盖 36%。',
      },
      {
        key: 'snowline',
        status: 'ok',
        label: '雪线/高区',
        detail: '当前路线不强制需要雪线实体。',
      },
    ],
  })

  const buildSize = preflight.checks.find((check) => check.key === 'build-size')

  assert.equal(buildSize.status, 'review')
  assert.equal(preflight.status, 'review')
  assert.match(buildSize.detail, /尺寸/)
})

test('buildTerrainPrintPreflight flags relief that is too tall for the footprint', () => {
  const routeGeometry = {
    strategy: 'print-scale-simplified-ribbon',
    sourcePointCount: 6086,
    printablePointCount: 51,
    simplifyToleranceMm: 0.5,
  }
  const preflight = buildTerrainPrintPreflight({
    route: { printGeometry: routeGeometry },
    stats: {
      modelWidthMm: 120,
      modelDepthMm: 70,
      maxHeightMm: 47.5,
      basePlateHeightMm: 3,
      reliefMm: 42,
      verticalExaggeration: 8.5,
    },
    colorBands: { lowland: { enabled: true, coverageRatio: 0.35 } },
    snowline: { enabled: true, coverageRatio: 0.18 },
    meshes: {
      terrain: { faces: [[0, 1, 2]] },
      track: { faces: [[0, 1, 2]] },
      base: { faces: [[0, 1, 2]] },
      text: { faces: [[0, 1, 2]] },
      lowland: { faces: [[0, 1, 2]] },
      snow: { faces: [[0, 1, 2]] },
    },
    print: { enabled: true },
    terrain: {
      precision: { source: { type: 'sampled-dem', name: 'test DEM' } },
      quality: { totalCount: 4, validSampleCount: 4 },
      maxElevationMeters: 2000,
    },
  }, {
    package3mf: 'too-tall-bambu.3mf',
    guideFile: 'too-tall-guide.txt',
    materialSlots: [{ slot: 1, color: '#C79435', parts: ['terrain'] }],
    geometryStrategy: { route: routeGeometry },
  })

  const geometryCheck = preflight.checks.find((check) => check.key === 'print-geometry')
  assert.equal(geometryCheck.status, 'review')
  assert.match(geometryCheck.detail, /起伏\/短边/)
  assert.match(geometryCheck.detail, /0\.22/)
})

test('buildTerrainModelExportFiles writes Bambu filament setting arrays per material slot, not per part', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 10,
    gridCols: 10,
    shapeType: 'hexagon',
    modelWidthMm: 120,
    modelDepthMm: 104,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    labelText: '12K',
    contourEnabled: true,
    contourIntervalMeters: 10,
    snowlineEnabled: true,
    snowlineElevationMeters: 660,
    snowCapThicknessMm: 0.5,
    terrainColorBandsEnabled: true,
    lowlandPercentile: 35,
    lowlandCapThicknessMm: 0.45,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((_, index) => 620 + Math.floor(index / 10) * 10),
  })

  const files = buildTerrainModelExportFiles(model, { baseName: 'qingcheng-filament-slots' })
  const bambu3mf = files.find((file) => file.name === 'qingcheng-filament-slots-bambu-print.3mf')
  const bambuArchive = new PizZip(bambu3mf.content)
  const projectSettings = JSON.parse(bambuArchive.file('Metadata/project_settings.config').asText())
  const slotCount = projectSettings.filament_colour.length

  assert.deepEqual(projectSettings.filament_colour, [
    '#C79435',
    '#1F9F72',
    '#D63B2E',
    '#171717',
    '#F5F5F4',
  ])
  for (const key of [
    'filament_settings_id',
    'filament_type',
    'filament_vendor',
    'filament_printable',
    'filament_diameter',
    'filament_density',
    'nozzle_temperature_range_low',
    'nozzle_temperature_range_high',
    'cool_plate_temp',
    'eng_plate_temp',
    'eng_plate_temp_initial_layer',
    'long_retractions_when_cut',
  ]) {
    assert.equal(projectSettings[key].length, slotCount, key + ' should match the material slot count')
  }
  assertBambuProjectArraysMatchFilamentVariantCount(projectSettings, [
    'filament_self_index',
    'filament_extruder_variant',
    'filament_flow_ratio',
    'filament_max_volumetric_speed',
    'filament_retract_length_nc',
    'filament_ramming_travel_time',
    'filament_ramming_travel_time_nc',
    'filament_ramming_volumetric_speed',
    'filament_ramming_volumetric_speed_nc',
    'filament_flush_temp',
    'filament_flush_volumetric_speed',
    'filament_pre_cooling_temperature',
    'filament_pre_cooling_temperature_nc',
    'filament_cooling_before_tower',
    'filament_adaptive_volumetric_speed',
    'filament_enable_overhang_speed',
    'nozzle_temperature',
    'nozzle_temperature_initial_layer',
  ])
  assert.deepEqual(projectSettings.filament_self_index, bambuH2cFilamentVariantSelfIndexes(projectSettings))
  assertBambuFlushSettingsMatchH2cVariants(projectSettings)
  for (const key of [
    'nozzle_temperature',
    'nozzle_temperature_initial_layer',
    'eng_plate_temp',
    'eng_plate_temp_initial_layer',
  ]) {
    assert.ok(projectSettings[key].every((value) => typeof value === 'string'), key + ' values should be strings for Bambu JSON parsing')
  }
})

test('normalizeBambuStudioProjectSettings stringifies temperature arrays for Bambu project parsing', () => {
  const settings = normalizeBambuStudioProjectSettings({
    filament_colour: ['#C79435', '#D63B2E'],
    nozzle_temperature: [220, 220],
    nozzle_temperature_initial_layer: [220, 220],
    cool_plate_temp: [35, 35],
    cool_plate_temp_initial_layer: [35, 35],
    eng_plate_temp: [55, 55],
    eng_plate_temp_initial_layer: [55, 55],
    post_process: [],
  })

  for (const key of [
    'nozzle_temperature',
    'nozzle_temperature_initial_layer',
    'cool_plate_temp',
    'cool_plate_temp_initial_layer',
    'eng_plate_temp',
    'eng_plate_temp_initial_layer',
  ]) {
    assert.deepEqual(settings[key], settings[key].map(String), key + ' should be a string array')
  }
  assert.deepEqual(settings.post_process, [])
})

test('buildTerrainModelExportFiles writes slicer-compatible Bambu H2C nozzle metadata', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 6,
    gridCols: 6,
    shapeType: 'hexagon',
    modelWidthMm: 120,
    modelDepthMm: 104,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    labelText: '12K',
    terrainColorBandsEnabled: true,
    lowlandPercentile: 35,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((_, index) => 620 + Math.floor(index / 6) * 10),
  })

  const files = buildTerrainModelExportFiles(model, { baseName: 'qingcheng-h2c-profile' })
  const bambu3mf = files.find((file) => file.name === 'qingcheng-h2c-profile-bambu-print.3mf')
  const bambuArchive = new PizZip(bambu3mf.content)
  const projectSettings = JSON.parse(bambuArchive.file('Metadata/project_settings.config').asText())
  const modelSettings = bambuArchive.file('Metadata/model_settings.config').asText()
  const slotCount = projectSettings.filament_colour.length

  assert.equal(projectSettings.printer_settings_id, 'Bambu Lab H2C 0.4 nozzle')
  assert.equal(projectSettings.print_settings_id, '0.20mm High Quality @BBL H2C')
  assert.deepEqual(projectSettings.nozzle_diameter, ['0.4', '0.4'])
  assert.deepEqual(projectSettings.nozzle_type, [
    'hardened_steel',
    'hardened_steel',
    'hardened_steel',
    'hardened_steel',
  ])
  assert.deepEqual(projectSettings.nozzle_volume, ['130', '133', '145', '148'])
  assert.deepEqual(projectSettings.nozzle_volume_type, ['Standard', 'Standard'])
  assert.deepEqual(projectSettings.default_nozzle_volume_type, ['Standard', 'Standard'])
  assert.deepEqual(projectSettings.extruder_type, ['Direct Drive', 'Direct Drive'])
  assert.deepEqual(projectSettings.extruder_offset, ['0x0', '0x0'])
  assert.deepEqual(projectSettings.extruder_max_nozzle_count, ['1', '6'])
  assert.deepEqual(projectSettings.extruder_variant_list, [
    'Direct Drive Standard,Direct Drive High Flow',
    'Direct Drive Standard,Direct Drive High Flow',
  ])
  assert.deepEqual(projectSettings.extruder_printable_area, [
    '0x0,325x0,325x320,0x320',
    '25x0,330x0,330x320,25x320',
  ])
  assert.deepEqual(projectSettings.extruder_printable_height, ['320', '325'])
  assert.deepEqual(projectSettings.printer_extruder_id, ['1', '1', '2', '2'])
  assert.deepEqual(projectSettings.printer_extruder_variant, [
    'Direct Drive Standard',
    'Direct Drive High Flow',
    'Direct Drive Standard',
    'Direct Drive High Flow',
  ])
  assert.deepEqual(projectSettings.print_extruder_id, projectSettings.printer_extruder_id)
  assert.deepEqual(projectSettings.print_extruder_variant, projectSettings.printer_extruder_variant)
  assert.deepEqual(projectSettings.print_compatible_printers, ['Bambu Lab H2C 0.4 nozzle'])
  assert.deepEqual(projectSettings.upward_compatible_machine, [
    'Bambu Lab H2S 0.4 nozzle',
    'Bambu Lab H2D 0.4 nozzle',
    'Bambu Lab H2D Pro 0.4 nozzle',
  ])
  assert.deepEqual(projectSettings.physical_extruder_map, ['1', '0'])
  assert.deepEqual(projectSettings.filament_map, Array.from({ length: slotCount }, () => '1'))
  assert.deepEqual(projectSettings.filament_map_2, Array.from({ length: slotCount }, () => '1'))
  assert.deepEqual(projectSettings.filament_nozzle_map, Array.from({ length: slotCount }, () => '0'))
  assert.deepEqual(
    projectSettings.filament_extruder_variant,
    Array.from({ length: slotCount }).flatMap(() => ['Direct Drive Standard', 'Direct Drive High Flow']),
  )
  assert.deepEqual(projectSettings.filament_self_index, bambuH2cFilamentVariantSelfIndexes(projectSettings))
  assertBambuProjectArraysMatchFilamentVariantCount(projectSettings, [
    'nozzle_temperature',
    'nozzle_temperature_initial_layer',
  ])
  assert.equal(projectSettings.printer_structure, 'corexy')
  assert.equal(projectSettings.single_extruder_multi_material, '1')
  assert.equal(projectSettings.printable_height, '325')
  assert.match(modelSettings, /<metadata key="filament_maps" value="\d( \d)*"\/>/)
})

test('buildTerrainModelExportFiles keeps Bambu filament arrays slot-aligned when multiple same-color overlays exist', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 36,
    gridCols: 36,
    shapeType: 'hexagon',
    modelLongSideMm: 120,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    labelText: '54.38KM',
    terrainColorBandsEnabled: true,
    lowlandPercentile: 38,
    lowlandCapThicknessMm: 0.45,
    snowlineEnabled: true,
    snowlinePercentile: 78,
    snowCapThicknessMm: 0.5,
    contourEnabled: true,
    contourIntervalMeters: 50,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((_, index) => {
      const row = Math.floor(index / 36)
      const col = index % 36
      return 3800 + row * 18 + Math.sin(col / 3) * 80 + (col > 22 ? 250 : 0)
    }),
  })

  const files = buildTerrainModelExportFiles(model, { baseName: 'bambu-overlays' })
  const bambu3mf = files.find((file) => file.name === 'bambu-overlays-bambu-print.3mf')
  const bambuArchive = new PizZip(bambu3mf.content)
  const projectSettings = JSON.parse(bambuArchive.file('Metadata/project_settings.config').asText())
  const slotCount = projectSettings.filament_colour.length

  assert.equal(files.filter((file) => file.name.endsWith('.stl')).length > slotCount, true)
  ;[
    'filament_ids',
    'filament_type',
    'filament_vendor',
    'filament_is_support',
    'filament_is_mixed',
    'filament_soluble',
    'filament_printable',
    'filament_diameter',
    'filament_density',
    'filament_start_gcode',
    'filament_end_gcode',
    'cool_plate_temp',
    'cool_plate_temp_initial_layer',
  ].forEach((key) => {
    assert.equal(projectSettings[key].length, slotCount, `${key} should describe filament slots, not printable parts`)
  })
  assertBambuProjectArraysMatchFilamentVariantCount(projectSettings, [
    'filament_flow_ratio',
    'filament_max_volumetric_speed',
    'nozzle_temperature',
    'nozzle_temperature_initial_layer',
  ])
  assertBambuFlushSettingsMatchH2cVariants(projectSettings)
})

test('buildTerrainModelExportPlan omits dense dynamic color bands from the Bambu slicer package', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 6,
    gridCols: 6,
    shapeType: 'hexagon',
    modelLongSideMm: 120,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    labelText: '12K',
    terrainColorBandsEnabled: true,
    sampleElevations: async (samples) => samples.map((_, index) => 600 + index),
  })
  const denseBandMesh = {
    vertices: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ],
    faces: Array(1_250_000).fill([0, 1, 2]),
  }
  model.colorBands = {
    ...model.colorBands,
    satelliteBands: {
      enabled: true,
      bandCount: 1,
      bands: [{ name: 'dense satellite shell', displayColor: '#445566' }],
    },
  }
  model.meshes.satelliteBands = [denseBandMesh]

  const plan = terrainModelModule.buildTerrainModelExportPlan(model, { baseName: 'dense-bambu' })
  const bambuParts = plan.manifest.print.bambu.partAssignments.map((part) => part.name)

  assert.ok(plan.files.some((file) => file.name === 'dense-bambu-satellite-band-1.stl'))
  assert.ok(!bambuParts.includes('dense satellite shell'))
  assert.deepEqual(plan.manifest.print.bambu.omittedDynamicColorParts.map((part) => part.name), ['dense satellite shell'])
  assert.ok(plan.manifest.print.bambu.geometryBudget.packageFaceCount < plan.manifest.print.bambu.geometryBudget.fullFaceCount)
})

test('buildTerrainModelExportArchive packs large exports without using the browser Blob zip path', () => {
  assert.equal(typeof terrainModelModule.buildTerrainModelExportArchive, 'function')

  const archive = terrainModelModule.buildTerrainModelExportArchive([
    { name: 'large-terrain.stl', content: 'solid terrain\n' + 'facet normal 0 0 1\n'.repeat(160_000), mimeType: 'model/stl' },
    { name: 'manifest.json', content: JSON.stringify({ ok: true }), mimeType: 'application/json' },
  ])

  assert.ok(archive instanceof Uint8Array)
  assert.ok(archive.length > 1_000_000)
  const zip = new PizZip(archive)
  assert.equal(zip.file('large-terrain.stl').asText().startsWith('solid terrain'), true)
  assert.deepEqual(JSON.parse(zip.file('manifest.json').asText()), { ok: true })
})

test('TerrainModelPage builds terrain export zip from Uint8Array bytes instead of PizZip blob output', () => {
  const source = readFileSync(new URL('../../src/views/app/terrain-model/TerrainModelPage.jsx', import.meta.url), 'utf8')

  assert.match(source, /buildTerrainModelExportArchive/)
  assert.match(source, /new Blob\(\[zipBytes\], \{ type: 'application\/zip' \}\)/)
  assert.doesNotMatch(source, /zip\.generate\(\{ type: 'blob' \}\)/)
  assert.doesNotMatch(source, /import PizZip from 'pizzip'/)
})

test('balanced satellite colour mapping respects the H2C material slot budget', async () => {
  const { points } = parseGpxTrack(gpx)
  const rawImageData = createSatelliteImageData(32, 32, (row, col) => {
    if (row < 10 && col < 12) return [38, 96, 48]
    if (row < 18 && col >= 12) return [117, 111, 79]
    if (row >= 18 && col < 20) return [151, 128, 96]
    if (row >= 22 && col >= 20) return [215, 211, 195]
    return [74, 80, 52]
  })

  const model = await buildTerrainModel(points, {
    gridRows: 12,
    gridCols: 12,
    shapeType: 'hexagon',
    modelWidthMm: 120,
    modelDepthMm: 104,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    colorMode: 'satellite',
    terrainColorBandsEnabled: true,
    satelliteColorStrategy: 'balanced',
    satelliteColorCount: 7,
    rawImageData,
    textureWidth: 32,
    textureHeight: 32,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((_, index) => {
      const row = Math.floor(index / 12)
      const col = index % 12
      return 620 + row * 12 + Math.sin(col / 2) * 16
    }),
  })

  assert.equal(model.colorBands.satelliteBands.strategy, 'balanced')
  assert.ok(model.colorBands.satelliteBands.materialBudget.terrainColorLimit >= 3)
  assert.ok(model.colorBands.satelliteBands.materialBudget.terrainColorLimit <= 4)
  assert.ok(model.colorBands.satelliteBands.bandCount <= model.colorBands.satelliteBands.materialBudget.terrainColorLimit)

  const files = buildTerrainModelExportFiles(model, { baseName: 'balanced-satellite-slots' })
  const bambu3mf = files.find((file) => file.name === 'balanced-satellite-slots-bambu-print.3mf')
  const bambuArchive = new PizZip(bambu3mf.content)
  const projectSettings = JSON.parse(bambuArchive.file('Metadata/project_settings.config').asText())

  assert.ok(projectSettings.filament_colour.length <= 6)
  assertBambuFlushSettingsMatchH2cVariants(projectSettings)
})

test('satellite colour mode does not fall back to legacy lowland paint when imagery is unavailable', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 10,
    gridCols: 10,
    shapeType: 'hexagon',
    modelWidthMm: 120,
    modelDepthMm: 104,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    colorMode: 'satellite',
    terrainColorBandsEnabled: true,
    lowlandPercentile: 45,
    lowlandCapThicknessMm: 0.8,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((_, index) => 680 + Math.floor(index / 10) * 18 + (index % 10) * 4),
  })

  assert.equal(model.colorBands.mode, 'satellite')
  assert.equal(model.colorBands.lowland.enabled, false)
  assert.equal(model.meshes.lowland.faces.length, 0)
  assert.equal(model.colorBands.satelliteBands, null)
})

test('satellite colour generation yields between heavy browser work phases', () => {
  const source = readFileSync(new URL('../../src/utils/terrainModel/model.js', import.meta.url), 'utf8')

  assert.match(source, /function yieldTerrainModelWork/)
  assert.match(source, /async function buildSatelliteColorBandMeshes/)
  assert.match(source, /await yieldTerrainModelWork\(\)/)
  assert.match(source, /satelliteBandResult = await buildSatelliteColorBandMeshes/)
})

test('balanced satellite colour mapping merges patches below the printable area threshold', async () => {
  const { points } = parseGpxTrack(gpx)
  const rawImageData = createSatelliteImageData(32, 32, (row, col) => {
    if (row >= 14 && row < 18 && col >= 14 && col < 18) return [226, 221, 194]
    if (row < 16) return [38, 105, 58]
    return [132, 108, 72]
  })

  const model = await buildTerrainModel(points, {
    gridRows: 14,
    gridCols: 14,
    shapeType: 'hexagon',
    modelWidthMm: 120,
    modelDepthMm: 104,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    colorMode: 'satellite',
    terrainColorBandsEnabled: true,
    satelliteColorStrategy: 'balanced',
    satelliteTerrainColorLimit: 3,
    satelliteMinPatchAreaMm2: 140,
    rawImageData,
    textureWidth: 32,
    textureHeight: 32,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((_, index) => 680 + Math.floor(index / 14) * 9 + (index % 14) * 2),
  })

  const cleanup = model.colorBands.satelliteBands.cleanup
  assert.ok(cleanup.mergedPatchCount > 0)
  assert.ok(cleanup.mergedTriangleCount > 0)
  assert.equal(model.colorBands.satelliteBands.bands.some((band) => band.coveredTriangleCount < 4), false)
})

test('balanced satellite colour meshes are thin terrain-surface shells instead of anchored solid slabs', async () => {
  const { points } = parseGpxTrack(gpx)
  const rawImageData = createSatelliteImageData(32, 32, (row, col) => {
    if (col < 11) return [42, 102, 61]
    if (col < 22) return [128, 103, 70]
    return [204, 199, 183]
  })

  const model = await buildTerrainModel(points, {
    gridRows: 12,
    gridCols: 12,
    shapeType: 'hexagon',
    modelWidthMm: 120,
    modelDepthMm: 104,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    colorMode: 'satellite',
    terrainColorBandsEnabled: true,
    satelliteColorStrategy: 'balanced',
    satelliteTerrainColorLimit: 3,
    satelliteMinPatchAreaMm2: 0,
    lowlandCapThicknessMm: 0.42,
    rawImageData,
    textureWidth: 32,
    textureHeight: 32,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((_, index) => {
      const row = Math.floor(index / 12)
      const col = index % 12
      return 610 + row * 14 + col * 4
    }),
  })
  const supportHeightAt = createModelTerrainHeightAt(model)
  const satelliteVertices = model.meshes.satelliteBands.flatMap((mesh) => mesh.vertices)

  assert.ok(satelliteVertices.length > 0)
  assert.ok(maxFloatingClearance(satelliteVertices, supportHeightAt) <= 0.5)
  assert.ok(maxSurfacePenetration(satelliteVertices, supportHeightAt) <= 0.35)
})

test('buildTerrainModelExportFiles exports snow cap as a white printable part and reuses the white Bambu filament', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 10,
    gridCols: 10,
    shapeType: 'hexagon',
    modelWidthMm: 120,
    modelDepthMm: 104,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    labelText: '12K',
    contourEnabled: true,
    contourIntervalMeters: 10,
    snowlineEnabled: true,
    snowlineElevationMeters: 660,
    snowCapThicknessMm: 0.5,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((_, index) => 620 + Math.floor(index / 10) * 10),
  })

  const files = buildTerrainModelExportFiles(model, { baseName: 'qingcheng-snowline' })
  const fileNames = files.map((file) => file.name)

  assert.ok(fileNames.includes('qingcheng-snowline-snow-white.stl'))
  assert.ok(fileNames.includes('qingcheng-snowline-contours-white.stl'))

  const manifest = JSON.parse(files.at(-1).content)
  assert.equal(manifest.snowline.enabled, true)
  assert.equal(manifest.snowline.elevationMeters, 660)
  assert.ok(manifest.print.parts.some((part) => part.key === 'snow' && part.file === 'qingcheng-snowline-snow-white.stl'))

  const printKit = files.find((file) => file.name === 'qingcheng-snowline-print-kit.3mf')
  const printKitArchive = new PizZip(printKit.content)
  const modelXml = printKitArchive.file('3D/3dmodel.model').asText()
  assert.match(modelXml, /<m:base name="snow-white" displaycolor="#F5F5F4FF"\/>/)
  assert.match(modelXml, /<object id="\d+" type="model" name="snow-white"/)

  const bambu3mf = files.find((file) => file.name === 'qingcheng-snowline-bambu-print.3mf')
  const bambuArchive = new PizZip(bambu3mf.content)
  const modelSettings = bambuArchive.file('Metadata/model_settings.config').asText()
  assert.match(modelSettings, /name" value="label-white"[\s\S]*?key="extruder" value="4"/)
  assert.match(modelSettings, /name" value="snow-white"[\s\S]*?key="extruder" value="4"/)

  const projectSettings = JSON.parse(bambuArchive.file('Metadata/project_settings.config').asText())
  assert.deepEqual(projectSettings.filament_colour, [
    '#C79435',
    '#D63B2E',
    '#171717',
    '#F5F5F4',
  ])
  assert.equal(projectSettings.filament_type.length, projectSettings.filament_colour.length)
  assert.equal(projectSettings.filament_printable.length, projectSettings.filament_colour.length)
  assert.equal(projectSettings.nozzle_temperature.length, bambuH2cFilamentVariantCount(projectSettings))
  assert.equal(projectSettings.nozzle_temperature_initial_layer.length, bambuH2cFilamentVariantCount(projectSettings))
  assertBambuFlushSettingsMatchH2cVariants(projectSettings)
})

test('buildTerrainModelExportFiles exports green lowland as a separate printable Bambu part', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 10,
    gridCols: 10,
    shapeType: 'hexagon',
    modelWidthMm: 120,
    modelDepthMm: 104,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    labelText: '12K',
    contourEnabled: true,
    contourIntervalMeters: 10,
    snowlineEnabled: true,
    snowlineElevationMeters: 660,
    snowCapThicknessMm: 0.5,
    terrainColorBandsEnabled: true,
    lowlandPercentile: 35,
    lowlandCapThicknessMm: 0.45,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((_, index) => 620 + Math.floor(index / 10) * 10),
  })

  const files = buildTerrainModelExportFiles(model, { baseName: 'qingcheng-color-bands' })
  const fileNames = files.map((file) => file.name)

  assert.ok(fileNames.includes('qingcheng-color-bands-lowland-green.stl'))

  const manifest = JSON.parse(files.at(-1).content)
  assert.equal(manifest.colorBands.enabled, true)
  assert.equal(manifest.colorBands.lowland.percentile, 0.35)
  assert.ok(manifest.colorBands.lowland.coveredTriangleCount > 0)
  assert.ok(manifest.print.parts.some((part) => part.key === 'lowland' && part.file === 'qingcheng-color-bands-lowland-green.stl'))

  const printKit = files.find((file) => file.name === 'qingcheng-color-bands-print-kit.3mf')
  const printKitArchive = new PizZip(printKit.content)
  const modelXml = printKitArchive.file('3D/3dmodel.model').asText()
  assert.match(modelXml, /<m:base name="lowland-green" displaycolor="#1F9F72FF"\/>/)
  assert.match(modelXml, /<object id="\d+" type="model" name="lowland-green"/)

  const bambu3mf = files.find((file) => file.name === 'qingcheng-color-bands-bambu-print.3mf')
  const bambuArchive = new PizZip(bambu3mf.content)
  const modelSettings = bambuArchive.file('Metadata/model_settings.config').asText()
  assert.match(modelSettings, /name" value="terrain"[\s\S]*?key="extruder" value="1"/)
  assert.match(modelSettings, /name" value="lowland-green"[\s\S]*?key="extruder" value="2"/)
  assert.match(modelSettings, /name" value="track-red"[\s\S]*?key="extruder" value="3"/)
  assert.match(modelSettings, /name" value="snow-white"[\s\S]*?key="extruder" value="5"/)
  assert.match(modelSettings, /<part id="2" subtype="normal_part">[\s\S]*?<metadata key="name" value="lowland-green"\/>[\s\S]*?<metadata key="extruder" value="2"\/>/)
  assert.match(modelSettings, /<metadata key="filament_maps" value="[0-9 ]*"\/>/)

  const projectSettings = JSON.parse(bambuArchive.file('Metadata/project_settings.config').asText())
  assert.deepEqual(projectSettings.filament_colour, [
    '#C79435',
    '#1F9F72',
    '#D63B2E',
    '#171717',
    '#F5F5F4',
  ])
  const filamentSlotCount = projectSettings.filament_colour.length
  ;[
    'default_filament_colour',
    'filament_settings_id',
    'filament_ids',
    'filament_type',
    'filament_vendor',
    'filament_printable',
    'filament_diameter',
    'filament_density',
    'cool_plate_temp',
    'cool_plate_temp_initial_layer',
  ].forEach((key) => {
    assert.equal(projectSettings[key].length, filamentSlotCount, `${key} should describe filament slots, not printable parts`)
  })
  assertBambuProjectArraysMatchFilamentVariantCount(projectSettings, [
    'filament_flow_ratio',
    'filament_max_volumetric_speed',
    'nozzle_temperature',
    'nozzle_temperature_initial_layer',
  ])
  assertBambuFlushSettingsMatchH2cVariants(projectSettings)

  const sliceInfo = bambuArchive.file('Metadata/slice_info.config').asText()
  assert.match(sliceInfo, /<object identify_id="1" name="qingcheng-color-bands" skipped="false" \/>/)
  assert.equal((sliceInfo.match(/<object identify_id="/g) || []).length, 1)
  assert.match(sliceInfo, /<filament id="2" tray_info_idx="GFA00" type="PLA" color="#1F9F72"/)
  assert.match(sliceInfo, /<filament id="5" tray_info_idx="GFA00" type="PLA" color="#F5F5F4"/)

  const manifestBambu = manifest.print.bambu
  assert.equal(manifestBambu.materialSlotCount, 5)
  assert.deepEqual(manifestBambu.materialSlots.map((slot) => slot.slot), [1, 2, 3, 4, 5])
  assert.deepEqual(manifestBambu.materialSlots.at(4).parts, [
    'contours-white',
    'snowline-white',
    'snow-white',
    'label-white',
  ])
  assert.deepEqual(
    manifestBambu.partAssignments.map((assignment) => [assignment.name, assignment.slot]),
    [
      ['terrain', 1],
      ['lowland-green', 2],
      ['track-red', 3],
      ['contours-white', 5],
      ['snowline-white', 5],
      ['snow-white', 5],
      ['base-black', 4],
      ['label-white', 5],
    ],
  )
})

test('buildTerrainModelExportFiles uses ASCII-safe filenames and keeps the original label in manifest', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 6,
    gridCols: 6,
    sampleElevations: async (samples) => samples.map((_, index) => 600 + index),
  })

  const files = buildTerrainModelExportFiles(model, { baseName: '50km组-1-1' })
  const fileNames = files.map((file) => file.name)

  assert.ok(fileNames.every((name) => /^[\x20-\x7E]+$/.test(name)))
  assert.ok(fileNames.every((name) => !/[\u4e00-\u9fa5]/.test(name)))
  assert.ok(fileNames[0].startsWith('50km-1-1-'))

  const manifest = JSON.parse(files.at(-1).content)
  assert.equal(manifest.export.originalBaseName, '50km组-1-1')
  assert.equal(manifest.export.filenamePolicy, 'ascii-safe')
  assert.deepEqual(manifest.export.files, fileNames)
})

test('buildTerrainModel creates a print-ready kit with shaped base, magnet holes, and labels', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 10,
    gridCols: 10,
    shapeType: 'hexagon',
    modelWidthMm: 120,
    modelDepthMm: 104,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    magnetHoleEnabled: true,
    magnetHoleDiameterMm: 6,
    magnetHoleCount: 6,
    labelText: '23.40KM',
    secondaryLabelText: '12H',
    sampleElevations: async (samples) => samples.map((_, index) => 620 + index),
  })

  assert.equal(model.print.shapeType, 'hexagon')
  assert.equal(model.print.magnetHoles.length, 6)
  assert.ok(model.stats.modelWidthMm <= 120)
  assert.ok(model.stats.modelDepthMm <= 104)
  assert.ok(model.stats.frameWidthMm >= 8)
  assert.ok(model.meshes.base.vertices.length > 0)
  assert.ok(model.meshes.base.faces.length > 0)
  assert.ok(model.meshes.text.vertices.length > 0)
  assert.ok(model.meshes.text.faces.length > 0)
  assert.ok(model.meshes.combined.faces.length > model.meshes.terrain.faces.length + model.meshes.track.faces.length)

  const baseMinY = Math.min(...model.meshes.base.vertices.map((vertex) => vertex.y))
  const baseMaxY = Math.max(...model.meshes.base.vertices.map((vertex) => vertex.y))
  assert.ok(baseMinY < 0)
  assert.equal(baseMaxY, 0)

  const files = buildTerrainModelExportFiles(model, { baseName: 'qingcheng-print-kit' })
  assert.deepEqual(files.map((file) => file.name), [
    'qingcheng-print-kit-print-kit.3mf',
    'qingcheng-print-kit-bambu-print.3mf',
    'qingcheng-print-kit-bambu-print-guide.txt',
    'qingcheng-print-kit-print-kit.stl',
    'qingcheng-print-kit-terrain.stl',
    'qingcheng-print-kit-track-red.stl',
    'qingcheng-print-kit-base-black.stl',
    'qingcheng-print-kit-label-white.stl',
    'qingcheng-print-kit-manifest.json',
  ])

  const manifest = JSON.parse(files.at(-1).content)
  assert.equal(manifest.print.shapeType, 'hexagon')
  assert.equal(manifest.print.magnetHoles.length, 6)
  assert.equal(manifest.print.package3mf, 'qingcheng-print-kit-print-kit.3mf')
  assert.equal(manifest.print.bambuPackage3mf, 'qingcheng-print-kit-bambu-print.3mf')
  assert.deepEqual(manifest.print.parts.map((part) => part.file), [
    'qingcheng-print-kit-terrain.stl',
    'qingcheng-print-kit-track-red.stl',
    'qingcheng-print-kit-base-black.stl',
    'qingcheng-print-kit-label-white.stl',
  ])

  const threeMf = files.find((file) => file.name.endsWith('.3mf'))
  assert.equal(threeMf.mimeType, 'model/3mf')
  const archive = new PizZip(threeMf.content)
  assert.ok(archive.file('[Content_Types].xml'))
  assert.ok(archive.file('_rels/.rels'))
  const modelXml = archive.file('3D/3dmodel.model').asText()
  assert.match(modelXml, /<model unit="millimeter"/)
  assert.match(modelXml, /<m:base name="track-red" displaycolor="#D63B2EFF"\/>/)
  assert.match(modelXml, /<object id="2" type="model" name="track-red"/)
  assert.match(modelXml, /<build>/)
})

test('print exports use slicer Z-up axes without mirroring an asymmetric route', async () => {
  const lShapeTrack = [
    { latitude: 30.0000, longitude: 103.0000, elevation: 100 },
    { latitude: 30.0000, longitude: 103.0010, elevation: 110 },
    { latitude: 30.0010, longitude: 103.0010, elevation: 120 },
  ]
  const model = await buildTerrainModel(lShapeTrack, {
    gridRows: 8,
    gridCols: 8,
    shapeType: 'hexagon',
    modelWidthMm: 100,
    modelDepthMm: 100,
    baseHeightMm: 2,
    basePlateHeightMm: 3,
    frameWidthMm: 8,
    trackWidthMm: 2,
    trackHeightMm: 1,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((sample) => (
      100
        + (sample.longitude - 103) * 10000
        + (sample.latitude - 30) * 5000
    )),
  })

  assert.ok(model.route.localPoints[1].x > model.route.localPoints[0].x)
  assert.equal(model.route.localPoints[1].z, model.route.localPoints[0].z)
  assert.ok(model.route.localPoints[2].z > model.route.localPoints[1].z)

  const files = buildTerrainModelExportFiles(model, { baseName: 'axis-check' })
  const trackStl = files.find((file) => file.name === 'axis-check-track-red.stl')
  const stlVertices = parseAsciiStlVertices(trackStl.content)
  const stlBounds = boundsForVertices(stlVertices)

  assert.ok(stlBounds.x[1] - stlBounds.x[0] > 40, 'slicer X should span east-west route movement')
  assert.ok(stlBounds.y[1] - stlBounds.y[0] > 40, 'slicer Y should span north-south route movement')
  assert.ok(stlBounds.z[0] >= 0, 'slicer Z should be printable height, not northing')
  assert.ok(stlBounds.z[1] <= model.stats.maxHeightMm + model.stats.basePlateHeightMm + 0.5)

  const northMidpoint = (stlBounds.y[0] + stlBounds.y[1]) / 2
  const eastMidpoint = (stlBounds.x[0] + stlBounds.x[1]) / 2
  const northernVertices = stlVertices.filter((vertex) => vertex.y > northMidpoint)
  const northernMeanX = northernVertices.reduce((total, vertex) => total + vertex.x, 0) / northernVertices.length
  assert.ok(northernMeanX > eastMidpoint, 'northbound leg should stay on the east side after export')

  const threeMf = files.find((file) => file.name === 'axis-check-print-kit.3mf')
  const archive = new PizZip(threeMf.content)
  const modelXml = archive.file('3D/3dmodel.model').asText()
  const threeMfTrackVertices = parseThreeMfObjectVertices(modelXml, 'track-red')
  assert.ok(threeMfTrackVertices.length > 0)
  assert.deepEqual(boundsForVertices(threeMfTrackVertices), stlBounds)

  const manifest = JSON.parse(files.at(-1).content)
  assert.deepEqual(manifest.export.coordinateSystem, {
    type: 'slicer-z-up',
    xAxis: 'east',
    yAxis: 'north',
    zAxis: 'up',
  })
})

test('buildTerrainModelExportFiles includes contour STL and 3MF parts when contours are enabled', async () => {
  const { points } = parseGpxTrack(gpx)
  const model = await buildTerrainModel(points, {
    gridRows: 10,
    gridCols: 10,
    shapeType: 'hexagon',
    modelWidthMm: 120,
    modelDepthMm: 104,
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    contourEnabled: true,
    contourIntervalMeters: 10,
    contourWidthMm: 0.5,
    contourHeightMm: 0.35,
    labelText: '23.40KM',
    sampleElevations: async (samples) => samples.map((_, index) => 620 + Math.floor(index / 10) * 6),
  })

  const files = buildTerrainModelExportFiles(model, { baseName: 'qingcheng-contours' })
  const fileNames = files.map((file) => file.name)

  assert.ok(fileNames.includes('qingcheng-contours-contours-white.stl'))
  assert.ok(model.meshes.contours.faces.length > 0)

  const contourStl = files.find((file) => file.name === 'qingcheng-contours-contours-white.stl')
  assert.match(contourStl.content, /^solid qingcheng-contours_contours/)
  assert.match(contourStl.content, /facet normal/)

  const manifest = JSON.parse(files.at(-1).content)
  assert.equal(manifest.contours.enabled, true)
  assert.ok(manifest.contours.segmentCount > 0)
  assert.ok(manifest.print.parts.some((part) => part.key === 'contours' && part.file === 'qingcheng-contours-contours-white.stl'))

  const threeMf = files.find((file) => file.name.endsWith('.3mf'))
  const archive = new PizZip(threeMf.content)
  const modelXml = archive.file('3D/3dmodel.model').asText()
  assert.match(modelXml, /<m:base name="contours-white" displaycolor="#F5F5F4FF"\/>/)
  assert.match(modelXml, /<object id="3" type="model" name="contours-white"/)
})

test('buildTerrainModel filters DEM holes and caps printable relief height', async () => {
  const mountainTrack = Array.from({ length: 18 }, (_, index) => ({
    latitude: 34.62 + index * 0.001,
    longitude: 99.64 + Math.sin(index / 3) * 0.002,
    elevation: index === 7 || index === 8 ? 0 : 3980 + index * 9,
  }))

  const model = await buildTerrainModel(mountainTrack, {
    gridRows: 8,
    gridCols: 8,
    modelWidthMm: 120,
    modelDepthMm: 104,
    baseHeightMm: 2,
    verticalScale: 0.18,
    maxReliefMm: 42,
    sampleElevations: async (samples) => samples.map((_, index) => {
      if (index === 9 || index === 10) return 0
      if (index === 36) return 9000
      return 3920 + (index % 8) * 24 + Math.floor(index / 8) * 14
    }),
  })

  assert.equal(model.terrain.quality.invalidCount, 3)
  assert.ok(model.terrain.minElevationMeters > 3900)
  assert.ok(model.terrain.maxElevationMeters < 4200)
  assert.ok(model.stats.maxHeightMm <= 45)
  assert.ok(model.stats.effectiveVerticalScale < 0.18)
})

test('buildTerrainModel treats null DEM samples as missing on low elevation routes', async () => {
  const lowlandTrack = Array.from({ length: 12 }, (_, index) => ({
    latitude: 30.62 + index * 0.0008,
    longitude: 103.64 + Math.sin(index / 3) * 0.0012,
    elevation: 116 + index * 0.8,
  }))

  const model = await buildTerrainModel(lowlandTrack, {
    gridRows: 8,
    gridCols: 8,
    modelWidthMm: 120,
    modelDepthMm: 104,
    verticalScale: 0.18,
    maxReliefMm: 42,
    elevationSmoothingPasses: 0,
    sampleElevations: async (samples) => samples.map((_, index) => {
      if (index === 27) return null
      return 118 + (index % 8) * 0.9 + Math.floor(index / 8) * 0.7
    }),
  })

  assert.equal(model.terrain.quality.missingCount, 1)
  assert.equal(model.terrain.quality.fallbackCount, 1)
  assert.ok(model.terrain.minElevationMeters > 110)
  assert.ok(model.stats.elevationGainMeters < 14)
})

test('buildTerrainModel falls back to GPX elevations when sampled DEM is all voids', async () => {
  const mountainTrack = Array.from({ length: 12 }, (_, index) => ({
    latitude: 34.62 + index * 0.001,
    longitude: 99.64 + Math.cos(index / 3) * 0.002,
    elevation: 4000 + index * 16,
  }))

  const model = await buildTerrainModel(mountainTrack, {
    gridRows: 8,
    gridCols: 8,
    modelWidthMm: 120,
    modelDepthMm: 104,
    maxReliefMm: 42,
    sampleElevations: async (samples) => samples.map(() => 0),
  })

  assert.equal(model.terrain.quality.invalidCount, 64)
  assert.ok(model.terrain.minElevationMeters > 3900)
  assert.ok(model.terrain.maxElevationMeters > model.terrain.minElevationMeters)
  assert.ok(model.stats.maxHeightMm > 10)
  assert.ok(model.stats.maxHeightMm <= 45)
})

test('evaluateTerrainModelReadiness blocks sampled terrain when DEM coverage is unusable', async () => {
  const mountainTrack = Array.from({ length: 12 }, (_, index) => ({
    latitude: 34.62 + index * 0.001,
    longitude: 99.64 + Math.cos(index / 3) * 0.002,
    elevation: 4000 + index * 18,
  }))

  const model = await buildTerrainModel(mountainTrack, {
    gridRows: 8,
    gridCols: 8,
    modelWidthMm: 120,
    modelDepthMm: 104,
    maxReliefMm: 16,
    reliefMode: 'print-readable',
    sampleElevations: async (samples) => samples.map(() => null),
  })

  const readiness = evaluateTerrainModelReadiness(model)
  const demCoverage = readiness.checks.find((check) => check.key === 'dem-coverage')

  assert.equal(readiness.status, 'blocked')
  assert.equal(readiness.label, '不建议打印')
  assert.equal(demCoverage.status, 'blocked')
  assert.match(demCoverage.detail, /DEM/)
})

test('evaluateTerrainModelReadiness approves high precision multi-part print kits and manifest records it', async () => {
  const points = Array.from({ length: 18 }, (_, index) => ({
    latitude: 34.62 + index * 0.0007,
    longitude: 99.64 + Math.sin(index / 4) * 0.0018,
    elevation: 3900 + index * 72,
  }))

  const model = await buildTerrainModel(points, {
    gridRows: 240,
    gridCols: 240,
    terrainQuality: 'ultra',
    modelWidthMm: 120,
    modelDepthMm: 104,
    shapeType: 'hexagon',
    frameWidthMm: 8,
    basePlateHeightMm: 3,
    targetModelGridMm: 0.42,
    elevationSourceName: 'OpenTopography COP30',
    elevationSourceType: 'opentopography-globaldem',
    elevationSourceResolutionMeters: 30,
    elevationSourceBoundsWgs84: {
      south: 34.61,
      north: 34.64,
      west: 99.62,
      east: 99.66,
    },
    reliefMode: 'print-readable',
    maxReliefMm: 16,
    elevationSmoothingPasses: 0,
    terrainColorBandsEnabled: true,
    lowlandPercentile: 38,
    snowlineEnabled: true,
    snowlinePercentile: 78,
    snowCapThicknessMm: 0.5,
    labelText: '54.38KM',
    sampleElevations: async (samples) => samples.map((sample, index) => (
      3860
        + (sample.latitude - 34.62) * 90000
        + Math.sin(index / 9) * 24
        + Math.floor(index / 240) * 3
    )),
  })

  const readiness = evaluateTerrainModelReadiness(model)

  assert.equal(readiness.status, 'ready')
  assert.equal(readiness.label, '可打印')
  assert.ok(readiness.checks.every((check) => check.status === 'ok'))
  assert.equal(readiness.checks.find((check) => check.key === 'print-parts').status, 'ok')

  const files = buildTerrainModelExportFiles(model, { baseName: 'readiness-high-precision' })
  const manifest = JSON.parse(files.at(-1).content)

  assert.equal(manifest.readiness.status, 'ready')
  assert.ok(manifest.readiness.checks.some((check) => check.key === 'dem-coverage'))
  assert.equal(manifest.terrain.precision.source.type, 'opentopography-globaldem')
  assert.equal(manifest.terrain.precision.source.name, 'OpenTopography COP30')
  assert.equal(manifest.terrain.precision.source.resolutionMeters, 30)
  assert.deepEqual(manifest.terrain.precision.source.boundsWgs84, {
    south: 34.61,
    north: 34.64,
    west: 99.62,
    east: 99.66,
  })
})

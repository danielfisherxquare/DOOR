import assert from 'node:assert/strict'
import test from 'node:test'

import {
  cloneDefaultTerrainModelOptions,
  normalizeTerrainModelOptions,
  normalizeTerrainReliefMode,
} from '../../src/utils/terrainModel/modelOptions.js'

test('terrain model options normalize legacy aliases and bounded percentages', () => {
  const options = normalizeTerrainModelOptions({
    shape: 'hex',
    qualityPreset: 'ultra',
    gridRows: 999,
    gridCols: 2,
    terrainSupersample: 9,
    snowlinePercentile: 82,
    lowlandPercentile: 35,
    satelliteColorSmoothing: 55,
    maxTerrainReliefMm: 120,
    contourIntervalM: 2,
    magnetHolesEnabled: true,
    magnetCount: 20,
  })

  assert.equal(options.shapeType, 'hexagon')
  assert.equal(options.terrainQuality, 'ultra')
  assert.equal(options.gridRows, 320)
  assert.equal(options.gridCols, 4)
  assert.equal(options.terrainSupersample, 3)
  assert.equal(options.snowlinePercentile, 0.82)
  assert.equal(options.lowlandPercentile, 0.35)
  assert.equal(options.satelliteColorSmoothing, 0.55)
  assert.equal(options.maxReliefMm, 90)
  assert.equal(options.contourIntervalMeters, 5)
  assert.equal(options.magnetHoleEnabled, true)
  assert.equal(options.magnetHoleCount, 12)
})

test('terrain model options treat a valid manual footprint as the shape authority', () => {
  const footprint = [
    { longitude: 104, latitude: 30 },
    { longitude: 104.01, latitude: 30 },
    { longitude: 104.01, latitude: 30.01 },
    { longitude: 104, latitude: 30.01 },
  ]
  const options = normalizeTerrainModelOptions({
    shapeType: 'circle',
    manualFootprintWgs84: footprint,
    manualFootprintRotationDegrees: 25,
  })

  assert.equal(options.shapeType, 'custom')
  assert.equal(options.terrainFootprintWgs84.length, 4)
  assert.equal(options.terrainFootprintRotationDegrees, 25)
  assert.ok(options.terrainBoundsWgs84)
})

test('terrain model default option clones do not share elevation bands', () => {
  const first = cloneDefaultTerrainModelOptions()
  const second = cloneDefaultTerrainModelOptions()
  first.elevationBands.push({ percentile: 1, color: '#fff' })

  assert.deepEqual(second.elevationBands, [])
  assert.equal(normalizeTerrainReliefMode('dramatic'), 'terrain-forward')
  assert.equal(normalizeTerrainReliefMode('real'), 'realistic')
})

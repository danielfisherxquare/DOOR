import assert from 'node:assert/strict'
import test from 'node:test'

import {
  boundsToInputValues,
  cloneDefaultTerrainModelOptions,
  createPresetFootprintPolygon,
  manualFootprintToBoundsWgs84,
  normalizeTerrainModelSavedConfig,
  parseManualBoundsWgs84,
} from '../../src/views/app/terrain-model/terrainModelPageConfig.js'

test('manual WGS84 bounds normalize precision and reject incomplete ranges', () => {
  assert.deepEqual(parseManualBoundsWgs84({
    south: '29.123456789',
    north: '30.234567891',
    west: '102.123456789',
    east: '103.234567891',
  }), {
    south: 29.1234568,
    north: 30.2345679,
    west: 102.1234568,
    east: 103.2345679,
  })
  assert.equal(parseManualBoundsWgs84({ south: 30, north: 29, west: 102, east: 103 }), null)
  assert.deepEqual(boundsToInputValues(null), { south: '', north: '', west: '', east: '' })
})

test('preset footprints preserve their requested bounds before rotation', () => {
  const bounds = { south: 29, north: 30, west: 102, east: 104 }
  const footprint = createPresetFootprintPolygon(bounds, 'hexagon')

  assert.equal(footprint.length, 6)
  assert.deepEqual(manualFootprintToBoundsWgs84(footprint), bounds)
})

test('saved terrain config keeps supported values and restores safe defaults', () => {
  const config = normalizeTerrainModelSavedConfig({
    options: {
      terrainQuality: 'invalid',
      colorMode: 'satellite',
      elevationBands: [{ name: '高山', percentile: 4, color: '#ffffff', thicknessMm: -1 }],
      unknown: 'discarded',
    },
    manualFootprint: {
      mode: 'manual',
      shape: 'triangle',
      boundsWgs84: { south: 29, north: 30, west: 102, east: 104 },
    },
  })

  assert.equal(config.options.terrainQuality, 'high')
  assert.equal(config.options.colorMode, 'satellite')
  assert.equal(config.options.unknown, undefined)
  assert.equal(config.options.elevationBands[0].percentile, 1)
  assert.equal(config.options.elevationBands[0].thicknessMm, 0)
  assert.equal(config.manualFootprint.mode, 'manual')
  assert.equal(config.manualFootprint.shape, 'triangle')
})

test('default terrain options do not share mutable elevation bands', () => {
  const first = cloneDefaultTerrainModelOptions()
  const second = cloneDefaultTerrainModelOptions()

  first.elevationBands[0].name = 'changed'
  assert.notEqual(second.elevationBands[0].name, 'changed')
})

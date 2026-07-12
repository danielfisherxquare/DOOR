/**
 * geometryToBbox 单元测试 — 从 GeoJSON 几何（WGS84）计算 bbox，供「框选→生成场地」使用。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { geometryToBbox } from '../../src/utils/map/geometryBbox.js'

describe('geometryToBbox', () => {
  it('从矩形 Polygon 计算 bbox', () => {
    const geom = {
      type: 'Polygon',
      coordinates: [
        [
          [104.06, 30.645],
          [104.074, 30.645],
          [104.074, 30.656],
          [104.06, 30.656],
          [104.06, 30.645],
        ],
      ],
    }
    const bbox = geometryToBbox(geom)
    assert.deepEqual(bbox, { west: 104.06, south: 30.645, east: 104.074, north: 30.656 })
  })

  it('支持未闭合的环', () => {
    const geom = {
      type: 'Polygon',
      coordinates: [
        [
          [1, 2],
          [3, 2],
          [3, 5],
          [1, 5],
        ],
      ],
    }
    assert.deepEqual(geometryToBbox(geom), { west: 1, south: 2, east: 3, north: 5 })
  })

  it('非多边形返回 null', () => {
    assert.equal(geometryToBbox({ type: 'Point', coordinates: [1, 2] }), null)
    assert.equal(geometryToBbox(null), null)
    assert.equal(geometryToBbox({ type: 'Polygon', coordinates: [[[1, 2]]] }), null)
  })

  it('退化为零面积（线状/单点环）返回 null', () => {
    const geom = {
      type: 'Polygon',
      coordinates: [
        [
          [1, 2],
          [1, 2],
          [1, 2],
          [1, 2],
        ],
      ],
    }
    assert.equal(geometryToBbox(geom), null)
  })
})

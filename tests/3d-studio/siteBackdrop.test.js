/**
 * 场地底图数据单元测试 — 把 site-bake 的 focusZone（正射瓦片 + OSM 白模 + origin）
 * 转换为 3D 渲染用的本地米制底图数据。纯数学，无渲染依赖。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { buildSiteBackdropData } from '../../src/3d-studio/model/siteBackdrop.js'

const focusZone = {
  originWgs84: { longitude: 104.067, latitude: 30.6505 },
  orthophoto: {
    tiles: [{ url: 'https://tile/0', west: 104.064, east: 104.07, south: 30.648, north: 30.653 }],
    coverBounds: { west: 104.064, east: 104.07, south: 30.648, north: 30.653 },
  },
  snapshotJson: {
    osmBuildings: {
      buildings: [
        {
          footprintWgs84: {
            coordinates: [
              [
                [104.066, 30.65],
                [104.068, 30.65],
                [104.068, 30.651],
                [104.066, 30.651],
                [104.066, 30.65],
              ],
            ],
          },
          heightMeters: 30,
        },
      ],
    },
  },
}

describe('buildSiteBackdropData', () => {
  it('保留 origin', () => {
    const data = buildSiteBackdropData(focusZone)
    assert.equal(data.origin, focusZone.originWgs84)
  })

  it('每个瓦片给出本地米制矩形（west→minX, north→maxZ）', () => {
    const data = buildSiteBackdropData(focusZone)
    assert.equal(data.tiles.length, 1)
    const rect = data.tiles[0].rect
    assert.ok(rect.maxX > rect.minX, 'maxX 应大于 minX')
    assert.ok(rect.maxZ > rect.minZ, 'maxZ 应大于 minZ')
    assert.equal(data.tiles[0].url, 'https://tile/0')
    // 西边经度更小 → 本地 x 更小；origin 在中心，西边应为负
    assert.ok(rect.minX < 0 && rect.maxX > 0, `rect.x 应跨过原点: ${rect.minX}..${rect.maxX}`)
  })

  it('建筑转为本地米制 footprint + 高度', () => {
    const data = buildSiteBackdropData(focusZone)
    assert.equal(data.buildings.length, 1)
    const b = data.buildings[0]
    assert.equal(b.height, 30)
    assert.ok(Array.isArray(b.footprint) && b.footprint.length >= 3, 'footprint 至少 3 点')
    assert.ok(
      b.footprint.every((p) => Array.isArray(p) && p.length === 2),
      '每点为 [x,z]'
    )
  })

  it('建筑无显式高度时回退到正高度默认值', () => {
    const fz = {
      ...focusZone,
      snapshotJson: {
        osmBuildings: {
          buildings: [
            { footprintWgs84: focusZone.snapshotJson.osmBuildings.buildings[0].footprintWgs84 },
          ],
        },
      },
    }
    const data = buildSiteBackdropData(fz)
    assert.ok(data.buildings[0].height > 0, '默认高度应为正')
  })

  it('缺省 orthophoto/buildings 时返回空数组而非报错', () => {
    const data = buildSiteBackdropData({ originWgs84: focusZone.originWgs84 })
    assert.deepEqual(data.tiles, [])
    assert.deepEqual(data.buildings, [])
    assert.equal(data.terrain, null)
  })
})

describe('buildSiteBackdropData 地形 drape', () => {
  const focusZoneWithTerrain = {
    ...focusZone,
    snapshotJson: {
      ...focusZone.snapshotJson,
      terrainPatch: {
        rows: 3,
        cols: 3,
        heightsRelative: [0, 1, 0, 1, 5, 1, 0, 1, 0],
        boundsMeters: { minX: -150, maxX: 150, minZ: -120, maxZ: 120 },
      },
    },
  }

  it('terrainPatch 转为带卫星 UV 的网格', () => {
    const data = buildSiteBackdropData(focusZoneWithTerrain)
    assert.ok(data.terrain, '应有 terrain')
    assert.equal(data.terrain.positions.length, 3 * 3 * 3, '9 顶点 × 3 分量')
    assert.equal(data.terrain.uvs.length, 3 * 3 * 2, '9 顶点 × 2 UV')
    assert.ok(data.terrain.indices.length === (3 - 1) * (3 - 1) * 6, '2×2 格 × 6 索引')
  })

  it('中心顶点抬高（heightsRelative 映射到 y）', () => {
    const data = buildSiteBackdropData(focusZoneWithTerrain)
    // 中心顶点 index=4 → positions[4*3+1] 是 y
    assert.equal(data.terrain.positions[4 * 3 + 1], 5)
  })

  it('UV 落在 [0,1] 内（卫星覆盖 >= 地形范围）', () => {
    const data = buildSiteBackdropData(focusZoneWithTerrain)
    for (let i = 0; i < data.terrain.uvs.length; i += 1) {
      assert.ok(
        data.terrain.uvs[i] >= -0.01 && data.terrain.uvs[i] <= 1.01,
        `uv[${i}]=${data.terrain.uvs[i]}`
      )
    }
  })
})

/**
 * 场地底图数据单元测试 — 把 site-bake 的 focusZone（正射瓦片 + OSM 白模 + origin）
 * 转换为 3D 渲染用的本地米制底图数据。纯数学，无渲染依赖。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildSiteBackdropData,
  buildSiteImageryReloadKey,
  mergeSiteImageryRuntime,
  sampleTerrainHeightAtLocalPoint,
  summarizeSiteImageryRuntime,
} from '../../src/3d-studio/model/siteBackdrop.js'

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
    assert.equal(b.baseY, 0, '无地形时建筑落在 y=0')
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

  it('建筑按 footprint 中心贴合 terrain，并叠加 minHeightMeters', () => {
    const building = focusZoneWithTerrain.snapshotJson.osmBuildings.buildings[0]
    const data = buildSiteBackdropData({
      ...focusZoneWithTerrain,
      snapshotJson: {
        ...focusZoneWithTerrain.snapshotJson,
        osmBuildings: {
          buildings: [{ ...building, minHeightMeters: 2 }],
        },
      },
    })

    assert.ok(
      Math.abs(data.buildings[0].baseY - 7) < 0.001,
      `建筑底高应为 5m terrain + 2m minHeight，实际 ${data.buildings[0].baseY}`
    )
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

describe('sampleTerrainHeightAtLocalPoint', () => {
  const terrainPatch = {
    rows: 2,
    cols: 2,
    heightsRelative: [0, 10, 20, 30],
    boundsMeters: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
  }

  it('在规则网格内部进行双线性插值', () => {
    assert.equal(sampleTerrainHeightAtLocalPoint(terrainPatch, 5, 5), 15)
    assert.equal(sampleTerrainHeightAtLocalPoint(terrainPatch, 2.5, 7.5), 17.5)
  })

  it('超出范围时贴到边界，缺少 terrain 时回退到 0', () => {
    assert.equal(sampleTerrainHeightAtLocalPoint(terrainPatch, -10, 20), 20)
    assert.equal(sampleTerrainHeightAtLocalPoint(null, 5, 5), 0)
  })
})

describe('site backdrop imagery runtime', () => {
  const descriptorStatus = {
    imagery: { provider: 'xyz', status: 'ready', itemCount: 3, retryable: false },
    terrain: { provider: 'terrain', status: 'ready', itemCount: 1, retryable: false },
    buildings: { provider: 'osm', status: 'ready', itemCount: 2, retryable: false },
  }

  it('任一瓦片失败立即降级，descriptor ready 不会覆盖 runtime', () => {
    const runtime = summarizeSiteImageryRuntime({ loaded: 1, failed: 1, total: 3 })
    const merged = mergeSiteImageryRuntime(descriptorStatus, runtime)

    assert.equal(runtime.status, 'degraded')
    assert.equal(merged.imagery.status, 'degraded')
    assert.equal(merged.imagery.itemCount, 3)
    assert.match(merged.imagery.message, /成功 1，失败 1/)
  })

  it('全部瓦片或最终合成纹理失败时标记 failed', () => {
    const allTilesFailed = summarizeSiteImageryRuntime({ loaded: 0, failed: 3, total: 3 })
    const compositeFailed = summarizeSiteImageryRuntime({
      loaded: 3,
      failed: 0,
      total: 3,
      terminalFailure: true,
    })

    assert.equal(allTilesFailed.status, 'failed')
    assert.equal(compositeFailed.status, 'failed')
    assert.equal(mergeSiteImageryRuntime(descriptorStatus, compositeFailed).imagery.status, 'failed')
  })

  it('纹理重试 token 生成新 key，但相同 descriptor 和 token 保持稳定', () => {
    const tiles = focusZone.orthophoto.tiles
    const first = buildSiteImageryReloadKey(tiles, 0)

    assert.equal(buildSiteImageryReloadKey(tiles, 0), first)
    assert.notEqual(buildSiteImageryReloadKey(tiles, 1), first)
    assert.equal(first.includes(tiles[0].url), false, 'key 不暴露瓦片 URL 或查询凭据')
  })

  it('纹理重载是独立 UI 路径，不调用保存、重烘焙或 revision', async () => {
    const source = await readFile('src/views/app/SiteModePage.jsx', 'utf8')
    const start = source.indexOf('const handleReloadImagery')
    const end = source.indexOf('const effectiveProviderStatus', start)
    assert.ok(start > 0 && end > start)

    const handler = source.slice(start, end)
    assert.match(handler, /setImageryReloadToken/)
    assert.doesNotMatch(handler, /siteModeApi|revision|handleSave|handleRebake/)
  })

  it('场景自动保存不重建底图或重新请求卫星瓦片', async () => {
    const source = await readFile('src/views/app/SiteModePage.jsx', 'utf8')
    const start = source.indexOf('const handleSave = useCallback')
    const end = source.indexOf('const handleReloadConflict', start)
    assert.ok(start > 0 && end > start)

    const handler = source.slice(start, end)
    assert.match(handler, /siteModeApi\.saveSiteMode/)
    assert.doesNotMatch(handler, /setBackdrop|buildSiteBackdropData|setImageryReloadToken/)
  })
})

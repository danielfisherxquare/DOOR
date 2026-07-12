/**
 * 场地烘焙缓存纯逻辑单测 — 缓存键与新鲜度（不含 IndexedDB IO）。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  siteCacheKey,
  isCacheFresh,
  SITE_CACHE_VERSION,
} from '../../src/utils/map/siteBakeCache.js'

const BBOX = { west: 104.0631111, south: 30.6472222, east: 104.0713333, north: 30.6544444 }

describe('siteCacheKey', () => {
  it('包含版本、provider 与四至（坐标四舍五入到稳定精度）', () => {
    const key = siteCacheKey(BBOX, 'esri')
    assert.match(key, new RegExp(`^site:${SITE_CACHE_VERSION}:esri:`))
    assert.match(key, /104\.06311/)
    assert.match(key, /30\.65444/)
  })

  it('微小浮点抖动（< 1e-6）落到同一键', () => {
    const a = siteCacheKey(BBOX, 'esri')
    const b = siteCacheKey({ ...BBOX, west: BBOX.west + 1e-7 }, 'esri')
    assert.equal(a, b)
  })

  it('不同 provider → 不同键', () => {
    assert.notEqual(siteCacheKey(BBOX, 'esri'), siteCacheKey(BBOX, 'tianditu'))
  })

  it('provider 缺省为 esri', () => {
    assert.equal(siteCacheKey(BBOX), siteCacheKey(BBOX, 'esri'))
  })
})

describe('isCacheFresh', () => {
  const now = 1_000_000_000_000
  const maxAge = 7 * 24 * 60 * 60 * 1000

  it('版本一致且未过期 → 新鲜', () => {
    assert.equal(
      isCacheFresh({ version: SITE_CACHE_VERSION, savedAt: now - 1000 }, maxAge, now),
      true
    )
  })

  it('超过 maxAge → 不新鲜', () => {
    assert.equal(
      isCacheFresh({ version: SITE_CACHE_VERSION, savedAt: now - maxAge - 1 }, maxAge, now),
      false
    )
  })

  it('版本不符 → 不新鲜（即使时间没过期）', () => {
    assert.equal(
      isCacheFresh({ version: SITE_CACHE_VERSION + 1, savedAt: now }, maxAge, now),
      false
    )
  })

  it('缺失/损坏条目 → 不新鲜', () => {
    assert.equal(isCacheFresh(null, maxAge, now), false)
    assert.equal(isCacheFresh({}, maxAge, now), false)
  })
})

/**
 * 场地烘焙结果（focusZone）本地缓存
 *
 * 把一次 site-bake 的结果按 bbox + 图源缓存到 IndexedDB（idb-keyval）。重开同一区域时
 * 直接命中缓存，跳过后端 Overpass/DEM 往返——既加速，又让弱网/离线现场仍能打开已烘焙场地。
 *
 * 纯逻辑（缓存键、新鲜度）无 IO，可单测；get/set 走 idb-keyval。
 */
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'

export const SITE_CACHE_VERSION = 1
export const SITE_CACHE_DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 天

function roundCoord(value) {
  return Number(Number(value).toFixed(5)) // ~1m 精度，吸收浮点抖动
}

/** 由 bbox + 图源生成稳定缓存键 */
export function siteCacheKey(bbox, provider = 'esri') {
  const west = roundCoord(bbox?.west)
  const south = roundCoord(bbox?.south)
  const east = roundCoord(bbox?.east)
  const north = roundCoord(bbox?.north)
  return `site:${SITE_CACHE_VERSION}:${provider || 'esri'}:${west},${south},${east},${north}`
}

/** 缓存条目是否新鲜（版本一致且未过期） */
export function isCacheFresh(entry, maxAgeMs = SITE_CACHE_DEFAULT_MAX_AGE_MS, now = Date.now()) {
  if (!entry || entry.version !== SITE_CACHE_VERSION) return false
  if (!Number.isFinite(entry.savedAt)) return false
  return now - entry.savedAt <= maxAgeMs
}

/** 读取缓存的 focusZone；命中且新鲜返回 {focusZone, savedAt}，否则 null */
export async function getCachedSite(key, maxAgeMs = SITE_CACHE_DEFAULT_MAX_AGE_MS) {
  try {
    const entry = await idbGet(key)
    if (!isCacheFresh(entry, maxAgeMs)) return null
    return { focusZone: entry.focusZone, savedAt: entry.savedAt }
  } catch {
    return null
  }
}

/** 写入缓存 */
export async function setCachedSite(key, focusZone, savedAt = Date.now()) {
  try {
    await idbSet(key, { version: SITE_CACHE_VERSION, savedAt, focusZone })
    return true
  } catch {
    return false
  }
}

/** 删除某个缓存键（用于强制重新烘焙） */
export async function clearCachedSite(key) {
  try {
    await idbDel(key)
    return true
  } catch {
    return false
  }
}

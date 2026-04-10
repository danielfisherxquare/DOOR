/**
 * 地图缓存兼容服务
 * 自动缓存已停用，仅保留遗留缓存清理、状态读取与手动离线写入能力。
 */

import {
  clearSWCache,
  cleanupLegacyTileServiceWorker,
  getSWCacheStats,
  type CacheStats,
  type LegacyTileCleanupResult,
} from './serviceWorkerManager';
import { insertAutoCacheTile } from '../cache/lruManager';

export interface CacheStrategy {
  name: string;
  enabled: boolean;
  priority: 'high' | 'normal' | 'low';
}

export const DEFAULT_STRATEGIES: CacheStrategy[] = [
  { name: 'viewport', enabled: false, priority: 'high' },
  { name: 'adjacent', enabled: false, priority: 'normal' },
  { name: 'prefetch', enabled: false, priority: 'low' },
];

interface AutoCacheConfig {
  enabled: boolean;
  maxConcurrent: number;
  strategies: CacheStrategy[];
  prefetchRange: number;
}

interface CacheState {
  isInitialized: boolean;
  stats: CacheStats | null;
  lastUpdate: number;
}

let autoCacheConfig: AutoCacheConfig = {
  enabled: false,
  maxConcurrent: 0,
  strategies: DEFAULT_STRATEGIES,
  prefetchRange: 0,
};

let cacheState: CacheState = {
  isInitialized: false,
  stats: null,
  lastUpdate: 0,
};

let migrationPromise: Promise<LegacyTileCleanupResult> | null = null;

async function updateCacheStats(): Promise<void> {
  cacheState.stats = await getSWCacheStats();
  cacheState.lastUpdate = Date.now();
}

/**
 * 兼容旧接口：保留调用点，但不再注册自动缓存 Service Worker。
 */
export async function initTileCacheService(): Promise<boolean> {
  await updateCacheStats();
  cacheState.isInitialized = true;
  return true;
}

/**
 * 地图入口页调用的一次性迁移清理。
 */
export async function runLegacyTileCacheMigration(): Promise<LegacyTileCleanupResult> {
  if (!migrationPromise) {
    migrationPromise = cleanupLegacyTileServiceWorker()
      .finally(() => {
        migrationPromise = null;
      });
  }

  const result = await migrationPromise;
  await updateCacheStats();
  cacheState.isInitialized = true;
  return result;
}

export function setAutoCacheConfig(config: Partial<AutoCacheConfig>): void {
  const requestedEnabled = config.enabled;
  autoCacheConfig = {
    ...autoCacheConfig,
    ...config,
    enabled: false,
    maxConcurrent: 0,
    prefetchRange: 0,
  };

  if (requestedEnabled && import.meta.env.DEV) {
    console.info('[TileCacheService] Automatic tile caching is disabled. Ignoring enabled=true.');
  }
}

export function getAutoCacheConfig(): AutoCacheConfig {
  return { ...autoCacheConfig };
}

export function getCacheState(): CacheState {
  return { ...cacheState };
}

export async function getStats(): Promise<CacheStats | null> {
  if (Date.now() - cacheState.lastUpdate > 30000) {
    await updateCacheStats();
  }

  return cacheState.stats;
}

export async function clearCache(): Promise<LegacyTileCleanupResult> {
  const result = await clearSWCache();
  await updateCacheStats();
  return result;
}

/**
 * 自动预取已停用，保留兼容导出。
 */
export async function prefetchAdjacentTiles(): Promise<void> {
  if (import.meta.env.DEV) {
    console.info('[TileCacheService] Adjacent tile prefetch is disabled.');
  }
}

/**
 * 保留手动写入接口，供显式离线下载或诊断使用。
 */
export async function cacheTileManually(
  blob: Blob,
  sourceId: string,
  projection: 'wgs84' | 'gcj02',
  z: number,
  x: number,
  y: number,
): Promise<void> {
  try {
    await insertAutoCacheTile(sourceId, projection, z, x, y, blob);
    if (import.meta.env.DEV) {
      console.info(`[TileCacheService] Manually cached tile ${sourceId} ${z}/${x}/${y}`);
    }
  } catch (error) {
    console.error('[TileCacheService] Manual cache failed:', error);
  }
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' ? !navigator.onLine : false;
}

export function destroyTileCacheService(): void {
  cacheState = {
    isInitialized: false,
    stats: null,
    lastUpdate: 0,
  };
}

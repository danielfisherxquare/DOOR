/**
 * 遗留地图 Service Worker 管理
 * 仅用于检测 / 清理旧版瓦片缓存，不再负责运行期自动缓存。
 */

const LEGACY_TILE_SW_PATHNAME = '/sw-tiles.js';
const LEGACY_TILE_CACHE_PREFIX = 'map-tiles-';
const LEGACY_TILE_CACHE_MAX_SIZE = 100 * 1024 * 1024;
const PRESERVED_TILE_CACHES = new Set(['map-tiles-cache']);

export const LEGACY_TILE_CACHE_MIGRATION_KEY = 'door:map:legacy-tile-cache-cleanup:v1';
export const LEGACY_TILE_CACHE_RELOAD_SESSION_KEY = 'door:map:legacy-tile-cache-reload:v1';

export interface CacheStats {
  totalTiles: number;
  totalSize: number;
  totalSizeMB: number;
  maxCacheSize: number;
  maxCacheSizeMB: number;
  cacheNames: string[];
}

export interface CacheMessage {
  type:
    | 'CACHE_HIT'
    | 'CACHE_STORE'
    | 'CACHE_MISS'
    | 'CACHE_CLEANUP'
    | 'CACHE_STATS'
    | 'CACHE_CLEARED';
  url?: string;
  size?: number;
  deletedCount?: number;
  freedBytes?: number;
  timestamp?: number;
  error?: string;
  payload?: CacheStats;
}

export interface LegacyTileCleanupResult {
  cleaned: boolean;
  needsReload: boolean;
  deletedCaches: string[];
  preservedCaches: string[];
  unregisteredCount: number;
}

const cacheMessageHandlers = new Set<(message: CacheMessage) => void>();

function isLegacyTileServiceWorkerScript(scriptUrl?: string | null): boolean {
  if (!scriptUrl) return false;

  try {
    return new URL(scriptUrl, window.location.origin).pathname === LEGACY_TILE_SW_PATHNAME;
  } catch {
    return scriptUrl.endsWith(LEGACY_TILE_SW_PATHNAME);
  }
}

function isLegacyTileCacheName(cacheName: string): boolean {
  return cacheName.startsWith(LEGACY_TILE_CACHE_PREFIX) && !PRESERVED_TILE_CACHES.has(cacheName);
}

function createEmptyStats(cacheNames: string[] = []): CacheStats {
  return {
    totalTiles: 0,
    totalSize: 0,
    totalSizeMB: 0,
    maxCacheSize: LEGACY_TILE_CACHE_MAX_SIZE,
    maxCacheSizeMB: LEGACY_TILE_CACHE_MAX_SIZE / (1024 * 1024),
    cacheNames,
  };
}

async function measureCacheResponseBytes(cache: Cache, request: Request): Promise<number> {
  const response = await cache.match(request);
  if (!response) return 0;

  const headerValue = Number(response.headers.get('content-length') || '0');
  if (Number.isFinite(headerValue) && headerValue > 0) {
    return headerValue;
  }

  try {
    const blob = await response.clone().blob();
    return blob.size;
  } catch {
    return 0;
  }
}

function notifyCacheMessageHandlers(message: CacheMessage): void {
  cacheMessageHandlers.forEach((handler) => {
    try {
      handler(message);
    } catch (error) {
      console.warn('[ServiceWorkerManager] Cache message handler failed:', error);
    }
  });
}

export function addCacheMessageHandler(handler: (message: CacheMessage) => void): void {
  cacheMessageHandlers.add(handler);
}

export function removeCacheMessageHandler(handler: (message: CacheMessage) => void): void {
  cacheMessageHandlers.delete(handler);
}

/**
 * 兼容旧接口：自动缓存已停用，不再注册地图 Service Worker。
 */
export async function registerTileCacheSW(): Promise<ServiceWorkerRegistration | null> {
  if (import.meta.env.DEV) {
    console.info('[ServiceWorkerManager] Legacy tile cache SW registration is disabled.');
  }
  return null;
}

export async function getSWCacheStats(): Promise<CacheStats | null> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return createEmptyStats();
  }

  const cacheNames = (await caches.keys()).filter(isLegacyTileCacheName);
  if (cacheNames.length === 0) {
    return createEmptyStats();
  }

  let totalTiles = 0;
  let totalSize = 0;

  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    totalTiles += keys.length;

    for (const request of keys) {
      totalSize += await measureCacheResponseBytes(cache, request);
    }
  }

  return {
    totalTiles,
    totalSize,
    totalSizeMB: totalSize / (1024 * 1024),
    maxCacheSize: LEGACY_TILE_CACHE_MAX_SIZE,
    maxCacheSizeMB: LEGACY_TILE_CACHE_MAX_SIZE / (1024 * 1024),
    cacheNames,
  };
}

export async function cleanupLegacyTileServiceWorker(
  options: { force?: boolean } = {},
): Promise<LegacyTileCleanupResult> {
  const { force = false } = options;

  if (typeof window === 'undefined') {
    return {
      cleaned: false,
      needsReload: false,
      deletedCaches: [],
      preservedCaches: [],
      unregisteredCount: 0,
    };
  }

  const alreadyMigrated = localStorage.getItem(LEGACY_TILE_CACHE_MIGRATION_KEY) === 'done';
  const needsReload = isLegacyTileServiceWorkerScript(navigator.serviceWorker?.controller?.scriptURL);

  if (!force && alreadyMigrated) {
    return {
      cleaned: false,
      needsReload,
      deletedCaches: [],
      preservedCaches: [],
      unregisteredCount: 0,
    };
  }

  let unregisteredCount = 0;
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const legacyRegistrations = registrations.filter((registration) =>
      [registration.active, registration.waiting, registration.installing].some((worker) =>
        isLegacyTileServiceWorkerScript(worker?.scriptURL),
      ),
    );

    const unregisterResults = await Promise.all(
      legacyRegistrations.map((registration) => registration.unregister()),
    );
    unregisteredCount = unregisterResults.filter(Boolean).length;
  }

  const deletedCaches: string[] = [];
  const preservedCaches: string[] = [];

  if ('caches' in window) {
    const cacheNames = await caches.keys();
    for (const cacheName of cacheNames) {
      if (isLegacyTileCacheName(cacheName)) {
        const deleted = await caches.delete(cacheName);
        if (deleted) {
          deletedCaches.push(cacheName);
        }
        continue;
      }

      if (cacheName.startsWith(LEGACY_TILE_CACHE_PREFIX)) {
        preservedCaches.push(cacheName);
      }
    }
  }

  localStorage.setItem(LEGACY_TILE_CACHE_MIGRATION_KEY, 'done');

  const cleaned = unregisteredCount > 0 || deletedCaches.length > 0;
  if (cleaned) {
    notifyCacheMessageHandlers({
      type: 'CACHE_CLEARED',
      timestamp: Date.now(),
    });
  }

  if (import.meta.env.DEV && (cleaned || preservedCaches.length > 0)) {
    console.info('[ServiceWorkerManager] Legacy tile cache cleanup result:', {
      cleaned,
      needsReload,
      deletedCaches,
      preservedCaches,
      unregisteredCount,
    });
  }

  return {
    cleaned,
    needsReload,
    deletedCaches,
    preservedCaches,
    unregisteredCount,
  };
}

export async function clearSWCache(): Promise<LegacyTileCleanupResult> {
  return cleanupLegacyTileServiceWorker({ force: true });
}

/**
 * 兼容旧接口：自动预取已停用。
 */
export async function prefetchTiles(urls: string[]): Promise<void> {
  if (import.meta.env.DEV && urls.length > 0) {
    console.info('[ServiceWorkerManager] Tile prefetch is disabled. Ignoring request.', {
      count: urls.length,
    });
  }
}

/**
 * Cache API 封装
 * 用于存储瓦片 Blob 数据
 */

const CACHE_NAME = 'map-tiles-cache';

let cacheInstance: Cache | null = null;

/**
 * 获取 Cache 实例
 */
export async function getTileCache(): Promise<Cache> {
  if (cacheInstance) return cacheInstance;
  cacheInstance = await caches.open(CACHE_NAME);
  return cacheInstance;
}

/**
 * 生成瓦片缓存 Key
 */
export function makeTileBlobKey(
  sourceId: string,
  projection: string,
  z: number,
  x: number,
  y: number,
): string {
  return `${sourceId}/${projection}/${z}/${x}/${y}`;
}

/**
 * 解析瓦片缓存 Key
 */
export function parseTileBlobKey(key: string): {
  sourceId: string;
  projection: string;
  z: number;
  x: number;
  y: number;
} | null {
  const parts = key.split('/');
  if (parts.length !== 5) return null;
  return {
    sourceId: parts[0],
    projection: parts[1],
    z: parseInt(parts[2], 10),
    x: parseInt(parts[3], 10),
    y: parseInt(parts[4], 10),
  };
}

/**
 * 存储瓦片 Blob
 */
export async function cacheTileBlob(
  key: string,
  blob: Blob,
): Promise<void> {
  const cache = await getTileCache();
  const response = new Response(blob, {
    headers: {
      'Content-Type': blob.type || 'image/png',
      'X-Cached-At': Date.now().toString(),
    },
  });
  await cache.put(key, response);
}

/**
 * 获取瓦片 Blob
 */
export async function getTileBlob(key: string): Promise<Blob | null> {
  const cache = await getTileCache();
  const response = await cache.match(key);
  if (!response) return null;
  return response.blob();
}

/**
 * 获取瓦片 Blob URL (用于显示)
 */
export async function getTileBlobUrl(key: string): Promise<string | null> {
  const blob = await getTileBlob(key);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

/**
 * 获取瓦片 Base64 Data URI
 */
export async function getTileDataUri(key: string): Promise<string | null> {
  const blob = await getTileBlob(key);
  if (!blob) return null;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * 删除瓦片 Blob
 */
export async function deleteTileBlob(key: string): Promise<boolean> {
  const cache = await getTileCache();
  return cache.delete(key);
}

/**
 * 获取缓存统计
 */
export async function getCacheStats(): Promise<{
  totalEntries: number;
  totalSize: number;
}> {
  const cache = await getTileCache();
  const keys = await cache.keys();
  let totalSize = 0;

  for (const key of keys) {
    const response = await cache.match(key);
    if (response) {
      const blob = await response.blob();
      totalSize += blob.size;
    }
  }

  return {
    totalEntries: keys.length,
    totalSize,
  };
}

/**
 * 获取缓存估算大小 (快速估算，不读取全部内容)
 */
export async function getCacheEstimatedSize(): Promise<number> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return estimate.usage || 0;
  }
  return 0;
}

/**
 * 清空缓存
 */
export async function clearTileCache(): Promise<void> {
  const cache = await getTileCache();
  const keys = await cache.keys();
  for (const key of keys) {
    await cache.delete(key);
  }
}

/**
 * 批量删除缓存
 */
export async function deleteTileBlobs(keys: string[]): Promise<void> {
  const cache = await getTileCache();
  for (const key of keys) {
    await cache.delete(key);
  }
}

/**
 * 获取所有缓存键
 */
export async function getAllCacheKeys(): Promise<string[]> {
  const cache = await getTileCache();
  const requests = await cache.keys();
  return requests.map((r) => r.url);
}

/**
 * 检查存储配额
 */
export async function checkStorageQuota(): Promise<{
  usage: number;
  quota: number;
  available: number;
  usagePercent: number;
}> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    return {
      usage,
      quota,
      available: quota - usage,
      usagePercent: quota > 0 ? (usage / quota) * 100 : 0,
    };
  }

  // Fallback: 无法获取配额信息
  return {
    usage: 0,
    quota: 0,
    available: 0,
    usagePercent: 0,
  };
}
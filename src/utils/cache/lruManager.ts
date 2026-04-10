/**
 * LRU 淘汰管理器
 * 用于自动缓存瓦片的空间管理
 */

import { getDatabase, withStore, type AutoCacheTile } from '../db/database';
import { deleteTileBlob, getCacheStats, checkStorageQuota } from './tileCacheApi';
import { makeTileBlobKey } from './tileCacheApi';

const DEFAULT_MAX_SIZE_MB = 100; // 默认最大缓存 100MB

export interface LRUCacheConfig {
  maxSizeMB: number;
  cleanupThreshold: number; // 触发清理的阈值 (0-1)
}

let config: LRUCacheConfig = {
  maxSizeMB: DEFAULT_MAX_SIZE_MB,
  cleanupThreshold: 0.9,
};

/**
 * 设置 LRU 配置
 */
export function setLRUConfig(newConfig: Partial<LRUCacheConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * 获取当前配置
 */
export function getLRUConfig(): LRUCacheConfig {
  return { ...config };
}

/**
 * 获取当前缓存使用情况
 */
export async function getCacheUsage(): Promise<{
  usedMB: number;
  maxMB: number;
  usagePercent: number;
}> {
  const stats = await getCacheStats();
  const usedMB = stats.totalSize / (1024 * 1024);
  return {
    usedMB,
    maxMB: config.maxSizeMB,
    usagePercent: (usedMB / config.maxSizeMB) * 100,
  };
}

/**
 * 检查是否需要清理
 */
export async function shouldCleanup(): Promise<boolean> {
  const usage = await getCacheUsage();
  return usage.usagePercent >= config.cleanupThreshold * 100;
}

/**
 * 执行 LRU 清理
 * @param targetPercent 目标使用百分比，默认清理到 70%
 * @returns 清理的瓦片数量
 */
export async function runLRUCleanup(targetPercent: number = 70): Promise<number> {
  const db = await getDatabase();
  const targetMB = config.maxSizeMB * (targetPercent / 100);

  // 1. 获取当前统计
  const stats = await getCacheStats();
  const bytesToFree = stats.totalSize - targetMB * 1024 * 1024;

  if (bytesToFree <= 0) return 0;

  console.log(`[LRUManager] Need to free ${(bytesToFree / 1024 / 1024).toFixed(2)} MB`);

  // 2. 获取最旧的瓦片 (按 accessedAt 排序)
  const records = await new Promise<Array<AutoCacheTile & { id: number }>>(
    (resolve, reject) => {
      const transaction = db.transaction('autoCacheTiles', 'readonly');
      const store = transaction.objectStore('autoCacheTiles');
      const index = store.index('by-accessed');
      const request = index.openCursor();
      const results: Array<AutoCacheTile & { id: number }> = [];

      let idCounter = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          results.push({
            id: idCounter++,
            ...cursor.value,
          });
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    }
  );

  // 3. 删除瓦片直到释放足够空间
  let freedBytes = 0;
  const toDelete: Array<{ blobKey: string; sourceId: string; projection: string; zoom: number; x: number; y: number }> = [];

  for (const record of records) {
    if (freedBytes >= bytesToFree) break;
    toDelete.push({
      blobKey: record.blobKey,
      sourceId: record.sourceId,
      projection: record.projection,
      zoom: record.zoom,
      x: record.x,
      y: record.y,
    });
    freedBytes += record.sizeBytes;
  }

  // 4. 执行删除
  for (const item of toDelete) {
    // 删除 Blob
    await deleteTileBlob(item.blobKey);

    // 删除索引记录
    await withStore('autoCacheTiles', 'readwrite', (store) =>
      store.delete([item.sourceId, item.projection, item.zoom, item.x, item.y])
    );
  }

  console.log(`[LRUManager] Cleaned up ${toDelete.length} tiles, freed ${(freedBytes / 1024 / 1024).toFixed(2)} MB`);
  return toDelete.length;
}

/**
 * 检查并执行清理（如果需要）
 */
export async function checkAndCleanup(): Promise<boolean> {
  if (await shouldCleanup()) {
    await runLRUCleanup();
    return true;
  }
  return false;
}

/**
 * 更新瓦片访问时间
 */
export async function touchTile(
  sourceId: string,
  projection: string,
  z: number,
  x: number,
  y: number
): Promise<void> {
  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('autoCacheTiles', 'readwrite');
    const store = transaction.objectStore('autoCacheTiles');
    const key = [sourceId, projection, z, x, y];
    const getRequest = store.get(key);

    getRequest.onsuccess = () => {
      const record = getRequest.result;
      if (record) {
        record.accessedAt = Date.now();
        store.put(record);
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * 获取自动缓存统计
 */
export async function getAutoCacheStats(): Promise<{
  total: number;
  totalBytes: number;
  oldestAccess: number | null;
  newestAccess: number | null;
}> {
  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('autoCacheTiles', 'readonly');
    const store = transaction.objectStore('autoCacheTiles');
    const request = store.getAll();

    request.onsuccess = () => {
      const records = request.result as AutoCacheTile[];
      if (records.length === 0) {
        resolve({ total: 0, totalBytes: 0, oldestAccess: null, newestAccess: null });
        return;
      }

      const totalBytes = records.reduce((sum, r) => sum + r.sizeBytes, 0);
      const accessTimes = records.map((r) => r.accessedAt);

      resolve({
        total: records.length,
        totalBytes,
        oldestAccess: Math.min(...accessTimes),
        newestAccess: Math.max(...accessTimes),
      });
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 清空自动缓存
 */
export async function clearAutoCache(): Promise<void> {
  const db = await getDatabase();

  // 1. 获取所有记录
  const records = await new Promise<AutoCacheTile[]>((resolve, reject) => {
    const transaction = db.transaction('autoCacheTiles', 'readonly');
    const store = transaction.objectStore('autoCacheTiles');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  // 2. 删除所有 Blob
  for (const record of records) {
    await deleteTileBlob(record.blobKey);
  }

  // 3. 清空 IndexedDB
  await withStore('autoCacheTiles', 'readwrite', (store) => store.clear());
}

/**
 * 插入自动缓存瓦片
 */
export async function insertAutoCacheTile(
  sourceId: string,
  projection: string,
  z: number,
  x: number,
  y: number,
  blob: Blob
): Promise<void> {
  const db = await getDatabase();
  const blobKey = makeTileBlobKey(sourceId, projection, z, x, y);

  // 1. 存储 Blob
  const { cacheTileBlob } = await import('./tileCacheApi');
  await cacheTileBlob(blobKey, blob);

  // 2. 存储索引
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('autoCacheTiles', 'readwrite');
    const store = transaction.objectStore('autoCacheTiles');

    store.put({
      sourceId,
      projection,
      zoom: z,
      x,
      y,
      blobKey,
      sizeBytes: blob.size,
      accessedAt: Date.now(),
      createdAt: Date.now(),
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * 获取自动缓存瓦片
 */
export async function getAutoCacheTile(
  sourceId: string,
  projection: string,
  z: number,
  x: number,
  y: number
): Promise<Blob | null> {
  const db = await getDatabase();

  const record = await new Promise<AutoCacheTile | undefined>((resolve, reject) => {
    const transaction = db.transaction('autoCacheTiles', 'readonly');
    const store = transaction.objectStore('autoCacheTiles');
    const request = store.get([sourceId, projection, z, x, y]);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  if (!record) return null;

  // 更新访问时间
  touchTile(sourceId, projection, z, x, y).catch(() => {});

  const { getTileBlob } = await import('./tileCacheApi');
  return getTileBlob(record.blobKey);
}
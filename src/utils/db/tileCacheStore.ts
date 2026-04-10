/**
 * 瓦片缓存索引存储
 */

import {
  withStore,
  withStoreBatch,
  getDatabase,
  type TileCacheRecord,
} from './database';
import {
  cacheTileBlob,
  getTileBlob,
  getTileDataUri,
  deleteTileBlob,
  makeTileBlobKey,
  deleteTileBlobs,
} from '../cache/tileCacheApi';

/**
 * 插入单条瓦片记录
 */
export async function insertTile(
  sourceId: string,
  z: number,
  x: number,
  y: number,
  blob: Blob
): Promise<void> {
  const blobKey = makeTileBlobKey(sourceId, 'wgs84', z, x, y);

  // 1. 存储 Blob 到 Cache API
  await cacheTileBlob(blobKey, blob);

  // 2. 存储索引到 IndexedDB
  await withStore('tileCache', 'readwrite', (store) =>
    store.put({
      sourceId,
      zoom: z,
      x,
      y,
      blobKey,
      sizeBytes: blob.size,
      createdAt: Date.now(),
    })
  );
}

/**
 * 批量插入瓦片记录
 */
export async function bulkInsertTiles(
  tiles: Array<{
    sourceId: string;
    z: number;
    x: number;
    y: number;
    blob: Blob;
  }>
): Promise<void> {
  const records: TileCacheRecord[] = [];

  for (const tile of tiles) {
    const blobKey = makeTileBlobKey(tile.sourceId, 'wgs84', tile.z, tile.x, tile.y);
    await cacheTileBlob(blobKey, tile.blob);
    records.push({
      sourceId: tile.sourceId,
      zoom: tile.z,
      x: tile.x,
      y: tile.y,
      blobKey,
      sizeBytes: tile.blob.size,
      createdAt: Date.now(),
    });
  }

  await withStoreBatch('tileCache', 'readwrite', records, (store, record) => {
    store.put(record);
  });
}

/**
 * 获取瓦片 Blob
 */
export async function getTileBlobByCoords(
  sourceId: string,
  z: number,
  x: number,
  y: number
): Promise<Blob | null> {
  try {
    const record = await withStore<TileCacheRecord | undefined>(
      'tileCache',
      'readonly',
      (store) => store.get([sourceId, z, x, y])
    );

    if (!record) return null;
    return getTileBlob(record.blobKey);
  } catch {
    return null;
  }
}

/**
 * 获取瓦片 Data URI
 */
export async function getTileDataUriByCoords(
  sourceId: string,
  z: number,
  x: number,
  y: number
): Promise<string | null> {
  try {
    const record = await withStore<TileCacheRecord | undefined>(
      'tileCache',
      'readonly',
      (store) => store.get([sourceId, z, x, y])
    );

    if (!record) return null;
    return getTileDataUri(record.blobKey);
  } catch {
    return null;
  }
}

/**
 * 检查瓦片是否存在
 */
export async function hasTile(
  sourceId: string,
  z: number,
  x: number,
  y: number
): Promise<boolean> {
  try {
    const record = await withStore<TileCacheRecord | undefined>(
      'tileCache',
      'readonly',
      (store) => store.get([sourceId, z, x, y])
    );
    return !!record;
  } catch {
    return false;
  }
}

/**
 * 删除单条瓦片
 */
export async function deleteTile(
  sourceId: string,
  z: number,
  x: number,
  y: number
): Promise<void> {
  const record = await withStore<TileCacheRecord | undefined>(
    'tileCache',
    'readonly',
    (store) => store.get([sourceId, z, x, y])
  );

  if (record) {
    await deleteTileBlob(record.blobKey);
  }

  await withStore('tileCache', 'readwrite', (store) =>
    store.delete([sourceId, z, x, y])
  );
}

/**
 * 删除图源所有瓦片
 */
export async function deleteSourceTiles(sourceId: string): Promise<void> {
  const db = await getDatabase();

  // 1. 获取所有瓦片记录
  const records = await new Promise<TileCacheRecord[]>((resolve, reject) => {
    const transaction = db.transaction('tileCache', 'readonly');
    const store = transaction.objectStore('tileCache');
    const index = store.index('by-source');
    const request = index.getAll(sourceId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  // 2. 删除所有 Blob
  const blobKeys = records.map((r) => r.blobKey);
  await deleteTileBlobs(blobKeys);

  // 3. 删除索引记录
  const deleteTransaction = db.transaction('tileCache', 'readwrite');
  const deleteStore = deleteTransaction.objectStore('tileCache');

  for (const record of records) {
    deleteStore.delete([record.sourceId, record.zoom, record.x, record.y]);
  }

  return new Promise((resolve, reject) => {
    deleteTransaction.oncomplete = () => resolve();
    deleteTransaction.onerror = () => reject(deleteTransaction.error);
  });
}

/**
 * 获取图源统计
 */
export async function getSourceStats(
  sourceId: string
): Promise<{ total: number; totalBytes: number }> {
  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('tileCache', 'readonly');
    const store = transaction.objectStore('tileCache');
    const index = store.index('by-source');
    const request = index.getAll(sourceId);

    request.onsuccess = () => {
      const records = request.result as TileCacheRecord[];
      const totalBytes = records.reduce((sum, r) => sum + r.sizeBytes, 0);
      resolve({ total: records.length, totalBytes });
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取所有缓存的图源ID列表
 */
export async function getCachedSourceIds(): Promise<string[]> {
  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('tileCache', 'readonly');
    const store = transaction.objectStore('tileCache');
    const index = store.index('by-source');
    const request = index.getAll();

    request.onsuccess = () => {
      const records = request.result as TileCacheRecord[];
      const sourceIds = [...new Set(records.map((r) => r.sourceId))];
      resolve(sourceIds);
    };
    request.onerror = () => reject(request.error);
  });
}
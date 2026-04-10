/**
 * IndexedDB 数据库管理
 * 用于存储离线瓦片索引、区域元数据、自定义图源等
 */

const DB_NAME = 'map-tiles-db';
const DB_VERSION = 1;

export interface TileCacheRecord {
  sourceId: string;
  zoom: number;
  x: number;
  y: number;
  blobKey: string;
  sizeBytes: number;
  createdAt: number;
}

export interface TileArea {
  id: string;
  name: string;
  sourceId: string;
  sourceUrl: string;
  subdomains?: string;
  projection: 'wgs84' | 'gcj02';
  bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  };
  minZoom: number;
  maxZoom: number;
  totalTiles: number;
  diskSizeMB: number;
  createdAt: number;
  completedAt?: number;
  status: 'pending' | 'downloading' | 'completed' | 'cancelled';
}

export interface CustomSource {
  id: string;
  name: string;
  type: 'xyz' | 'wmts' | 'wms' | 'tms';
  urlTemplate: string;
  subdomains?: string;
  projection: 'wgs84' | 'gcj02';
  maxZoom: number;
  minZoom: number;
  attribution?: string;
  enabled: boolean;
  icon?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AutoCacheTile {
  sourceId: string;
  projection: string;
  zoom: number;
  x: number;
  y: number;
  blobKey: string;
  sizeBytes: number;
  accessedAt: number;
  createdAt: number;
}

export interface CacheSetting {
  key: string;
  value: string;
  updatedAt: number;
}

export interface PresetApiKey {
  sourceId: string;
  apiKey: string;
  updatedAt: number;
}

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

/**
 * 初始化 IndexedDB
 */
export async function initDatabase(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[MapDatabase] Failed to open database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('[MapDatabase] Database opened successfully');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // tileCache store - 离线瓦片索引
      if (!db.objectStoreNames.contains('tileCache')) {
        const tileCacheStore = db.createObjectStore('tileCache', {
          keyPath: ['sourceId', 'zoom', 'x', 'y'],
        });
        tileCacheStore.createIndex('by-source', 'sourceId');
        tileCacheStore.createIndex('by-zoom', 'zoom');
      }

      // tileAreas store - 下载区域元数据
      if (!db.objectStoreNames.contains('tileAreas')) {
        db.createObjectStore('tileAreas', { keyPath: 'id' });
      }

      // customSources store - 自定义图源配置
      if (!db.objectStoreNames.contains('customSources')) {
        db.createObjectStore('customSources', { keyPath: 'id' });
      }

      // autoCacheTiles store - 自动缓存瓦片
      if (!db.objectStoreNames.contains('autoCacheTiles')) {
        const autoCacheStore = db.createObjectStore('autoCacheTiles', {
          keyPath: ['sourceId', 'projection', 'zoom', 'x', 'y'],
        });
        autoCacheStore.createIndex('by-accessed', 'accessedAt');
        autoCacheStore.createIndex('by-source', 'sourceId');
      }

      // cacheSettings store - 缓存设置
      if (!db.objectStoreNames.contains('cacheSettings')) {
        db.createObjectStore('cacheSettings', { keyPath: 'key' });
      }

      // presetApiKeys store - 预设图源API Key
      if (!db.objectStoreNames.contains('presetApiKeys')) {
        db.createObjectStore('presetApiKeys', { keyPath: 'sourceId' });
      }

      console.log('[MapDatabase] Database schema created');
    };
  });

  return dbInitPromise;
}

/**
 * 获取数据库实例
 */
export async function getDatabase(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  return initDatabase();
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbInitPromise = null;
  }
}

/**
 * 通用 ObjectStore 操作封装
 */
export async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = callback(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 批量操作封装
 */
export async function withStoreBatch<T>(
  storeName: string,
  mode: IDBTransactionMode,
  items: T[],
  callback: (store: IDBObjectStore, item: T) => void,
): Promise<void> {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    for (const item of items) {
      callback(store, item);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * 获取全局统计信息
 */
export async function getGlobalStats(): Promise<{
  totalAreas: number;
  totalTiles: number;
  totalSizeMB: number;
}> {
  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['tileCache', 'tileAreas'], 'readonly');
    const tileCacheStore = transaction.objectStore('tileCache');
    const tileAreasStore = transaction.objectStore('tileAreas');

    const areasRequest = tileAreasStore.count();
    const tilesRequest = tileCacheStore.getAll();

    let totalAreas = 0;
    let totalTiles = 0;
    let totalSizeMB = 0;

    areasRequest.onsuccess = () => {
      totalAreas = areasRequest.result;
    };

    tilesRequest.onsuccess = () => {
      const tiles = tilesRequest.result as TileCacheRecord[];
      totalTiles = tiles.length;
      totalSizeMB = tiles.reduce((sum, t) => sum + t.sizeBytes, 0) / (1024 * 1024);
    };

    transaction.oncomplete = () => {
      resolve({ totalAreas, totalTiles, totalSizeMB });
    };

    transaction.onerror = () => reject(transaction.error);
  });
}
/**
 * 下载区域元数据存储
 */

import { withStore, type TileArea } from './database';

/**
 * 插入/更新区域记录
 */
export async function upsertTileArea(area: TileArea): Promise<void> {
  await withStore('tileAreas', 'readwrite', (store) => store.put(area));
}

/**
 * 创建新区域
 */
export async function createTileArea(config: {
  id: string;
  name: string;
  sourceId: string;
  sourceUrl: string;
  subdomains?: string;
  projection: 'wgs84' | 'gcj02';
  bounds: { south: number; west: number; north: number; east: number };
  minZoom: number;
  maxZoom: number;
}): Promise<TileArea> {
  const area: TileArea = {
    ...config,
    totalTiles: 0,
    diskSizeMB: 0,
    createdAt: Date.now(),
    status: 'pending',
  };

  await upsertTileArea(area);
  return area;
}

/**
 * 获取所有区域
 */
export async function listTileAreas(): Promise<TileArea[]> {
  return withStore<TileArea[]>('tileAreas', 'readonly', (store) => store.getAll());
}

/**
 * 根据 ID 获取区域
 */
export async function getTileAreaById(id: string): Promise<TileArea | undefined> {
  return withStore<TileArea | undefined>('tileAreas', 'readonly', (store) => store.get(id));
}

/**
 * 更新区域状态
 */
export async function updateTileAreaStatus(
  id: string,
  status: TileArea['status'],
  completedAt?: number
): Promise<void> {
  const area = await getTileAreaById(id);
  if (!area) return;

  await withStore('tileAreas', 'readwrite', (store) =>
    store.put({
      ...area,
      status,
      completedAt: completedAt ?? area.completedAt,
    })
  );
}

/**
 * 更新区域统计
 */
export async function updateTileAreaStats(
  id: string,
  totalTiles: number,
  diskSizeMB: number
): Promise<void> {
  const area = await getTileAreaById(id);
  if (!area) return;

  await withStore('tileAreas', 'readwrite', (store) =>
    store.put({
      ...area,
      totalTiles,
      diskSizeMB,
      status: 'completed',
      completedAt: Date.now(),
    })
  );
}

/**
 * 删除区域
 */
export async function deleteTileArea(id: string): Promise<void> {
  await withStore('tileAreas', 'readwrite', (store) => store.delete(id));
}

/**
 * 获取正在下载的区域
 */
export async function getDownloadingAreas(): Promise<TileArea[]> {
  const areas = await listTileAreas();
  return areas.filter((a) => a.status === 'downloading');
}

/**
 * 获取已完成的区域
 */
export async function getCompletedAreas(): Promise<TileArea[]> {
  const areas = await listTileAreas();
  return areas.filter((a) => a.status === 'completed');
}

/**
 * 获取区域总大小
 */
export async function getTotalAreaSize(): Promise<number> {
  const areas = await listTileAreas();
  return areas.reduce((sum, a) => sum + a.diskSizeMB, 0);
}

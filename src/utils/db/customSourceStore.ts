/**
 * 自定义图源配置存储
 */

import { withStore, type CustomSource } from './database';

/**
 * 插入/更新图源
 */
export async function upsertCustomSource(source: Omit<CustomSource, 'createdAt' | 'updatedAt'>): Promise<void> {
  const existingSource = await getCustomSourceById(source.id);

  const fullSource: CustomSource = {
    ...source,
    createdAt: existingSource?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  await withStore('customSources', 'readwrite', (store) => store.put(fullSource));
}

/**
 * 创建新图源
 */
export async function createCustomSource(config: {
  id: string;
  name: string;
  type: 'xyz' | 'wmts' | 'wms' | 'tms';
  urlTemplate: string;
  subdomains?: string;
  projection?: 'wgs84' | 'gcj02';
  maxZoom?: number;
  minZoom?: number;
  attribution?: string;
  icon?: string;
}): Promise<CustomSource> {
  const source: CustomSource = {
    ...config,
    projection: config.projection || 'wgs84',
    maxZoom: config.maxZoom || 19,
    minZoom: config.minZoom || 1,
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await withStore('customSources', 'readwrite', (store) => store.put(source));
  return source;
}

/**
 * 获取所有图源
 */
export async function listCustomSources(): Promise<CustomSource[]> {
  return withStore<CustomSource[]>('customSources', 'readonly', (store) => store.getAll());
}

/**
 * 获取启用的图源
 */
export async function listEnabledSources(): Promise<CustomSource[]> {
  const all = await listCustomSources();
  return all.filter((s) => s.enabled);
}

/**
 * 根据 ID 获取图源
 */
export async function getCustomSourceById(id: string): Promise<CustomSource | undefined> {
  return withStore<CustomSource | undefined>('customSources', 'readonly', (store) =>
    store.get(id)
  );
}

/**
 * 更新图源
 */
export async function updateCustomSource(
  id: string,
  updates: Partial<Omit<CustomSource, 'id' | 'createdAt'>>
): Promise<void> {
  const source = await getCustomSourceById(id);
  if (!source) return;

  const updatedSource: CustomSource = {
    ...source,
    ...updates,
    updatedAt: Date.now(),
  };

  await withStore('customSources', 'readwrite', (store) => store.put(updatedSource));
}

/**
 * 删除图源
 */
export async function deleteCustomSource(id: string): Promise<void> {
  await withStore('customSources', 'readwrite', (store) => store.delete(id));
}

/**
 * 启用/禁用图源
 */
export async function toggleCustomSource(id: string, enabled: boolean): Promise<void> {
  await updateCustomSource(id, { enabled });
}

/**
 * 导出配置
 */
export async function exportCustomSources(): Promise<string> {
  const sources = await listCustomSources();
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      customSources: sources,
    },
    null,
    2
  );
}

/**
 * 导入配置
 */
export async function importCustomSources(jsonStr: string): Promise<number> {
  const data = JSON.parse(jsonStr);
  if (!data.customSources || !Array.isArray(data.customSources)) {
    throw new Error('无效的配置文件格式');
  }

  for (const source of data.customSources) {
    await upsertCustomSource(source);
  }

  return data.customSources.length;
}

/**
 * 检查图源是否存在
 */
export async function hasCustomSource(id: string): Promise<boolean> {
  const source = await getCustomSourceById(id);
  return !!source;
}

/**
 * 获取图源数量
 */
export async function getCustomSourceCount(): Promise<number> {
  const sources = await listCustomSources();
  return sources.length;
}
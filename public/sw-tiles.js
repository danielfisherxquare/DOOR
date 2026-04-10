/**
 * Service Worker for Map Tile Caching
 * 瓦片缓存 Service Worker
 *
 * 功能：
 * 1. 拦截瓦片请求，优先从缓存读取
 * 2. 缓存未命中时从网络获取并存储
 * 3. 支持 LRU 淘汰机制
 * 4. 离线时返回缓存瓦片
 */

const CACHE_NAME = 'map-tiles-v1';
const METADATA_CACHE = 'map-tiles-meta-v1';

// 最大缓存大小 (100MB)
const MAX_CACHE_SIZE = 100 * 1024 * 1024;

// 需要缓存的瓦片 URL 匹配模式
const TILE_URL_PATTERNS = [
  // CARTO
  /basemaps\.cartocdn\.com/,
  /cartodb\.basemaps\.cartocdn\.net/,
  // Esri
  /arcgisonline\.com/,
  /services\.arcgisonline\.com/,
  // 高德地图
  /autonavi\.com/,
  /is\.autonavi\.com/,
  /webrd\d+\.is\.autonavi\.com/,
  /webst\d+\.is\.autonavi\.com/,
  // 天地图
  /tianditu\.gov\.cn/,
  /t\d+\.tianditu\.gov\.cn/,
  // OpenStreetMap
  /tile\.openstreetmap\.org/,
  /[abc]\.tile\.openstreetmap\.org/,
  // MapBox
  /api\.mapbox\.com/,
  /api\.tiles\.mapbox\.com/,
  // GeoQ
  /map\.geoq\.cn/,
  // 自定义图源 (常见模式)
  /\/tile\//,
  /\/tiles\//,
  /\{z\}\/\{x\}\/\{y\}/,
];

// 不缓存的请求
const EXCLUDE_PATTERNS = [
  /\/api\//,
  /\/auth\//,
  /\.html$/,
  /\.js$/,
  /\.css$/,
];

/**
 * 为元数据缓存生成合法的同源 URL 键，避免使用 Cache API 不支持的自定义 scheme。
 */
function createMetadataCacheKey(url) {
  const metadataUrl = new URL('/__sw_tiles_meta__', self.location.origin);
  metadataUrl.searchParams.set('tileUrl', url);
  return metadataUrl.toString();
}

/**
 * 判断是否为瓦片请求
 */
function isTileRequest(url) {
  const urlString = url.href || url;

  // 排除不需要缓存的请求
  if (EXCLUDE_PATTERNS.some(pattern => pattern.test(urlString))) {
    return false;
  }

  // 匹配瓦片模式
  return TILE_URL_PATTERNS.some(pattern => pattern.test(urlString));
}

/**
 * 安装事件
 */
self.addEventListener('install', (event) => {
  console.log('[SW-Tiles] Installing service worker');

  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME),
      caches.open(METADATA_CACHE),
    ]).then(() => {
      console.log('[SW-Tiles] Caches opened');
      return self.skipWaiting();
    })
  );
});

/**
 * 激活事件
 */
self.addEventListener('activate', (event) => {
  console.log('[SW-Tiles] Activating service worker');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            // 删除旧版本缓存
            return name.startsWith('map-tiles-') &&
                   name !== CACHE_NAME &&
                   name !== METADATA_CACHE;
          })
          .map((name) => {
            console.log('[SW-Tiles] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW-Tiles] Service worker activated');
      return self.clients.claim();
    })
  );
});

/**
 * 请求拦截
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 只处理 GET 请求和瓦片请求
  if (event.request.method !== 'GET') return;
  if (!isTileRequest(url)) return;

  event.respondWith(handleTileRequest(event.request));
});

/**
 * 处理瓦片请求
 * 策略：Cache First，Network Fallback
 */
async function handleTileRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const metaCache = await caches.open(METADATA_CACHE);

  // 1. 尝试从缓存读取
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    // 更新访问时间 (异步)
    updateAccessTime(metaCache, request.url).catch(() => {});

    // 通知主线程缓存命中
    notifyClients({
      type: 'CACHE_HIT',
      url: request.url,
      timestamp: Date.now(),
    });

    return cachedResponse;
  }

  // 2. 从网络获取
  try {
    const networkResponse = await fetch(request);

    // 3. 检查是否需要缓存
    if (networkResponse.ok && shouldCache(networkResponse)) {
      // 克隆响应用于缓存
      const responseClone = networkResponse.clone();

      // 存储 to 缓存
      await cache.put(request, responseClone);

      // 存储元数据
      const size = parseInt(networkResponse.headers.get('content-length') || '0');
      await storeMetadata(metaCache, request.url, size);

      // 检查缓存大小
      checkCacheSize().catch(() => {});

      // 通知主线程缓存存储
      notifyClients({
        type: 'CACHE_STORE',
        url: request.url,
        size: size,
        timestamp: Date.now(),
      });
    }

    return networkResponse;
  } catch (error) {
    // 4. 网络失败，尝试返回占位图
    console.warn('[SW-Tiles] Network fetch failed:', request.url, error.message);

    // 通知主线程网络失败
    notifyClients({
      type: 'CACHE_MISS',
      url: request.url,
      error: error.message,
      timestamp: Date.now(),
    });

    // 返回透明像素占位图 (避免地图显示错误)
    return createTransparentPixel();
  }
}

/**
 * 判断响应是否应该缓存
 */
function shouldCache(response) {
  // 只缓存图片类型
  const contentType = response.headers.get('content-type') || '';
  const isImage = contentType.startsWith('image/');

  // 检查响应大小
  const contentLength = parseInt(response.headers.get('content-length') || '0');

  // 不缓存过大的文件 (> 5MB)
  const isReasonableSize = contentLength > 0 && contentLength < 5 * 1024 * 1024;

  return isImage && isReasonableSize;
}

/**
 * 存储元数据
 */
async function storeMetadata(metaCache, url, size) {
  const metadata = {
    url,
    size,
    accessedAt: Date.now(),
    createdAt: Date.now(),
  };

  await metaCache.put(createMetadataCacheKey(url), new Response(JSON.stringify(metadata)));
}

/**
 * 更新访问时间
 */
async function updateAccessTime(metaCache, url) {
  const key = createMetadataCacheKey(url);
  const response = await metaCache.match(key);

  if (response) {
    const metadata = await response.json();
    metadata.accessedAt = Date.now();
    await metaCache.put(key, new Response(JSON.stringify(metadata)));
  }
}

/**
 * 检查缓存大小并执行 LRU 淘汰
 */
async function checkCacheSize() {
  const cache = await caches.open(CACHE_NAME);
  const metaCache = await caches.open(METADATA_CACHE);

  // 获取所有缓存键
  const keys = await cache.keys();
  if (keys.length === 0) return;

  // 计算总大小
  let totalSize = 0;
  const metadataList = [];

  for (const request of keys) {
    const key = createMetadataCacheKey(request.url);
    const metaResponse = await metaCache.match(key);
    if (metaResponse) {
      const metadata = await metaResponse.json();
      totalSize += metadata.size || 0;
      metadataList.push({
        url: request.url,
        size: metadata.size || 0,
        accessedAt: metadata.accessedAt || 0,
      });
    }
  }

  // 如果超过阈值，执行淘汰
  if (totalSize > MAX_CACHE_SIZE) {
    const targetSize = MAX_CACHE_SIZE * 0.7; // 清理到 70%
    const bytesToFree = totalSize - targetSize;

    // 按访问时间排序 (最旧的优先删除)
    metadataList.sort((a, b) => a.accessedAt - b.accessedAt);

    let freed = 0;
    const toDelete = [];

    for (const item of metadataList) {
      if (freed >= bytesToFree) break;
      toDelete.push(item.url);
      freed += item.size;
    }

    // 执行删除
    for (const url of toDelete) {
      await cache.delete(url);
      await metaCache.delete(createMetadataCacheKey(url));
    }

    console.log(`[SW-Tiles] LRU cleanup: deleted ${toDelete.length} tiles, freed ${formatBytes(freed)}`);

    // 通知主线程
    notifyClients({
      type: 'CACHE_CLEANUP',
      deletedCount: toDelete.length,
      freedBytes: freed,
      timestamp: Date.now(),
    });
  }
}

/**
 * 通知所有客户端
 */
function notifyClients(message) {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage(message);
    });
  });
}

/**
 * 创建透明像素占位图
 */
function createTransparentPixel() {
  const transparentPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  return new Response(
    Uint8Array.from(atob(transparentPixel.split(',')[1]), c => c.charCodeAt(0)),
    {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache',
      },
    }
  );
}

/**
 * 格式化字节大小
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * 处理主线程消息
 */
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'GET_CACHE_STATS':
      handleGetCacheStats(event.source);
      break;

    case 'CLEAR_CACHE':
      handleClearCache(event.source);
      break;

    case 'PREFETCH_TILES':
      handlePrefetchTiles(payload?.urls || []);
      break;

    case 'SET_MAX_SIZE':
      if (payload?.maxSizeMB) {
        // 更新最大缓存大小 (需要在模块级别重新赋值，这里只能记录)
        console.log(`[SW-Tiles] Max size update requested: ${payload.maxSizeMB}MB`);
      }
      break;
  }
});

/**
 * 获取缓存统计
 */
async function handleGetCacheStats(client) {
  const cache = await caches.open(CACHE_NAME);
  const metaCache = await caches.open(METADATA_CACHE);

  const keys = await cache.keys();
  let totalSize = 0;

  for (const request of keys) {
    const key = createMetadataCacheKey(request.url);
    const metaResponse = await metaCache.match(key);
    if (metaResponse) {
      const metadata = await metaResponse.json();
      totalSize += metadata.size || 0;
    }
  }

  client.postMessage({
    type: 'CACHE_STATS',
    payload: {
      totalTiles: keys.length,
      totalSize,
      totalSizeMB: totalSize / (1024 * 1024),
      maxCacheSize: MAX_CACHE_SIZE,
      maxCacheSizeMB: MAX_CACHE_SIZE / (1024 * 1024),
    },
  });
}

/**
 * 清空缓存
 */
async function handleClearCache(client) {
  const cache = await caches.open(CACHE_NAME);
  const metaCache = await caches.open(METADATA_CACHE);

  await cache.keys().then((keys) => {
    return Promise.all(keys.map((key) => cache.delete(key)));
  });

  await metaCache.keys().then((keys) => {
    return Promise.all(keys.map((key) => metaCache.delete(key)));
  });

  console.log('[SW-Tiles] Cache cleared');

  client.postMessage({
    type: 'CACHE_CLEARED',
    timestamp: Date.now(),
  });
}

/**
 * 预取瓦片
 */
async function handlePrefetchTiles(urls) {
  const cache = await caches.open(CACHE_NAME);

  for (const url of urls) {
    try {
      // 检查是否已缓存
      const cached = await cache.match(url);
      if (cached) continue;

      // 从网络获取
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response.clone());

        // 存储元数据
        const metaCache = await caches.open(METADATA_CACHE);
        const size = parseInt(response.headers.get('content-length') || '0');
        await storeMetadata(metaCache, url, size);
      }
    } catch (error) {
      console.warn('[SW-Tiles] Prefetch failed:', url);
    }
  }

  console.log(`[SW-Tiles] Prefetched ${urls.length} tiles`);
}

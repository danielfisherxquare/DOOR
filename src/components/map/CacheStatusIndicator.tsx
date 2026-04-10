/**
 * 地图缓存状态指示器
 * 展示网络状态，并提供遗留缓存重置入口。
 */

import { useCallback, useEffect, useState } from 'react';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { clearCache, getStats } from '../../utils/map/tileCacheService';
import type { CacheStats } from '../../utils/map/serviceWorkerManager';

interface CacheStatusIndicatorProps {
  compact?: boolean;
  showClearButton?: boolean;
}

export default function CacheStatusIndicator({
  compact = false,
  showClearButton = true,
}: CacheStatusIndicatorProps) {
  const offlineStatus = useOfflineStatus();
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const cacheStats = await getStats();
      setStats(cacheStats);
    } catch (error) {
      console.error('[CacheStatusIndicator] Failed to load legacy cache stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    const interval = window.setInterval(loadStats, 30000);
    return () => window.clearInterval(interval);
  }, [loadStats]);

  const handleClearCache = async () => {
    if (
      !window.confirm('将重置旧版地图缓存并注销遗留 Service Worker，不会删除手动下载的离线区域。是否继续？')
    ) {
      return;
    }

    setClearing(true);
    try {
      const result = await clearCache();
      await loadStats();

      if (!result.cleaned && !result.needsReload) {
        window.alert('未检测到需要重置的旧版地图缓存。');
        return;
      }

      window.alert('地图遗留缓存已重置，页面将刷新以切换到新的请求链路。');
      window.location.reload();
    } catch (error) {
      console.error('[CacheStatusIndicator] Failed to clear legacy cache:', error);
      window.alert('重置地图缓存失败，请稍后重试。');
    } finally {
      setClearing(false);
    }
  };

  const legacyTileCount = stats?.totalTiles ?? 0;
  const legacyCacheLabel = loading
    ? '检测中...'
    : legacyTileCount > 0
      ? `${legacyTileCount.toLocaleString()} 个旧瓦片`
      : '未检测到旧版底图缓存';

  if (compact) {
    return (
      <div className="cache-status-compact">
        <span className={`cache-status-compact__icon material-symbols-outlined ${offlineStatus.isOnline ? 'online' : 'offline'}`}>
          {offlineStatus.isOnline ? 'signal_cellular_alt' : 'signal_cellular_off'}
        </span>
        <span className="cache-status-compact__size">
          {legacyTileCount > 0 ? `${legacyTileCount} 旧缓存` : '直连'}
        </span>
      </div>
    );
  }

  return (
    <div className="cache-status-indicator">
      <div className="cache-status-indicator__network">
        <span className={`cache-status-indicator__icon material-symbols-outlined ${offlineStatus.isOnline ? 'online' : 'offline'}`}>
          {offlineStatus.isOnline ? 'signal_cellular_alt' : 'signal_cellular_off'}
        </span>
        <span className="cache-status-indicator__label">
          {offlineStatus.isOnline ? '在线直连' : '网络离线'}
        </span>
        <span className="cache-status-indicator__hint">
          {offlineStatus.isOnline
            ? '底图直接向图源请求'
            : '仅手动下载的离线区域可继续浏览'}
        </span>
      </div>

      <div className="cache-status-indicator__details">
        <div className="cache-status-indicator__detail">
          <span>浏览器遗留缓存</span>
          <span>{legacyCacheLabel}</span>
        </div>
        <div className="cache-status-indicator__detail">
          <span>连接类型</span>
          <span>{offlineStatus.connectionType || '未知'}</span>
        </div>
        <div className="cache-status-indicator__detail">
          <span>离线下载</span>
          <span>不会被重置按钮删除</span>
        </div>

        {showClearButton && (
          <button
            className="cache-status-indicator__clear-btn"
            onClick={handleClearCache}
            disabled={clearing}
          >
            {clearing ? '重置中...' : '重置地图缓存'}
          </button>
        )}
      </div>
    </div>
  );
}

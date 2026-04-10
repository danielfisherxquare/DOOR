/**
 * 离线瓦片管理面板
 * 提供离线下载、历史浏览缓存与图源配置等功能。
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getCacheUsage,
  getAutoCacheStats,
  clearAutoCache,
  runLRUCleanup,
} from '../../utils/cache/lruManager';
import { listTileAreas, deleteTileArea, getTotalAreaSize } from '../../utils/db/tileAreaStore';
import { listCustomSources } from '../../utils/db/customSourceStore';
import { checkStorageQuota } from '../../utils/cache/tileCacheApi';
import DownloadAreaPanel from './DownloadAreaPanel';
import CustomSourcePanel from './CustomSourcePanel';
import type { TileArea } from '../../utils/db/database';

interface CacheUsage {
  usedMB: number;
  maxMB: number;
  usagePercent: number;
}

interface StorageQuota {
  usage: number;
  quota: number;
  available: number;
  usagePercent: number;
}

interface AutoCacheStats {
  total: number;
  totalBytes: number;
  oldestAccess: number | null;
  newestAccess: number | null;
}

type TabType = 'overview' | 'areas' | 'sources' | 'settings';

export default function OfflineTileManager() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [cacheUsage, setCacheUsage] = useState<CacheUsage | null>(null);
  const [storageQuota, setStorageQuota] = useState<StorageQuota | null>(null);
  const [autoCacheStats, setAutoCacheStats] = useState<AutoCacheStats | null>(null);
  const [tileAreas, setTileAreas] = useState<TileArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);

  // 刷新数据
  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const [usage, quota, autoStats, areas] = await Promise.all([
        getCacheUsage(),
        checkStorageQuota(),
        getAutoCacheStats(),
        listTileAreas(),
      ]);
      setCacheUsage(usage);
      setStorageQuota(quota);
      setAutoCacheStats(autoStats);
      setTileAreas(areas);
    } catch (error) {
      console.error('Failed to load cache data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // 清理历史浏览缓存
  const handleCleanup = async () => {
    if (!confirm('确定要清理历史浏览缓存吗？将删除最旧的历史缓存瓦片直到使用率降至 70%，不会影响手动下载区域。')) return;

    setCleaning(true);
    try {
      const deleted = await runLRUCleanup(70);
      alert(`清理完成，删除了 ${deleted} 个历史缓存瓦片。`);
      await refreshData();
    } catch (error) {
      console.error('Cleanup failed:', error);
      alert('清理失败，请重试。');
    } finally {
      setCleaning(false);
    }
  };

  // 清空历史浏览缓存
  const handleClearAll = async () => {
    if (!confirm('确定要清空所有历史浏览缓存吗？不会删除手动下载的离线区域。')) return;

    setCleaning(true);
    try {
      await clearAutoCache();
      alert('历史浏览缓存已清空。');
      await refreshData();
    } catch (error) {
      console.error('Clear failed:', error);
      alert('清空失败，请重试。');
    } finally {
      setCleaning(false);
    }
  };

  // 删除区域
  const handleDeleteArea = async (id: string) => {
    if (!confirm('确定要删除此区域吗？相关缓存瓦片将被保留。')) return;

    try {
      await deleteTileArea(id);
      await refreshData();
    } catch (error) {
      console.error('Delete area failed:', error);
      alert('删除失败，请重试。');
    }
  };

  // 格式化大小
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // 格式化时间
  const formatTime = (timestamp: number | null): string => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  if (loading) {
    return (
      <div className="offline-manager loading" style={{ padding: '24px', textAlign: 'center' }}>
        <div className="command-status-tag" style={{ display: 'inline-flex' }}>加载中...</div>
      </div>
    );
  }

  const renderTabs = () => (
    <nav className="command-toolbar" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '16px' }}>
      <button className={`btn btn--sm ${activeTab === 'overview' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setActiveTab('overview')}>概览</button>
      <button className={`btn btn--sm ${activeTab === 'areas' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setActiveTab('areas')}>下载区域</button>
      <button className={`btn btn--sm ${activeTab === 'sources' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setActiveTab('sources')}>图源配置</button>
      <button className={`btn btn--sm ${activeTab === 'settings' ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setActiveTab('settings')}>说明</button>
    </nav>
  );

  return (
    <div className="offline-manager" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {renderTabs()}
      
      <div className="offline-content" style={{ flex: 1, overflowY: 'auto' }}>
        {/* 概览 */}
        {activeTab === 'overview' && (
          <div className="overview-panel">
            {/* 存储使用情况 */}
            <section className="stat-section">
              <h3>存储使用</h3>
              <div className="stat-cards">
                <div className="stat-card">
                  <div className="stat-label">浏览器配额</div>
                  <div className="stat-value">
                    {storageQuota ? (
                      <>
                        <span className="stat-number">
                          {formatSize(storageQuota.usage)}
                        </span>
                        <span className="stat-unit"> / {formatSize(storageQuota.quota)}</span>
                      </>
                    ) : (
                      '未知'
                    )}
                  </div>
                  <div className="stat-progress">
                    <div
                      className="stat-progress-bar"
                      style={{ width: `${Math.min(storageQuota?.usagePercent || 0, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-label">离线瓦片占用</div>
                  <div className="stat-value">
                    {cacheUsage ? (
                      <>
                        <span className="stat-number">{cacheUsage.usedMB.toFixed(1)} MB</span>
                        <span className="stat-unit"> / {cacheUsage.maxMB} MB</span>
                      </>
                    ) : (
                      '未知'
                    )}
                  </div>
                  <div className="stat-progress">
                    <div
                      className={`stat-progress-bar ${cacheUsage && cacheUsage.usagePercent > 80 ? 'warning' : ''}`}
                      style={{ width: `${Math.min(cacheUsage?.usagePercent || 0, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* 历史浏览缓存统计 */}
            <section className="stat-section">
              <h3>历史浏览缓存</h3>
              <p className="setting-hint" style={{ marginTop: '0', marginBottom: '12px' }}>
                自动缓存已停用。这里仅统计旧版本遗留的浏览缓存，可按需清理。
              </p>
              <div className="stat-grid">
                <div className="stat-item">
                  <span className="stat-item-label">缓存瓦片数</span>
                  <span className="stat-item-value">{autoCacheStats?.total || 0}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-item-label">总大小</span>
                  <span className="stat-item-value">
                    {formatSize(autoCacheStats?.totalBytes || 0)}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-item-label">最早访问</span>
                  <span className="stat-item-value">
                    {formatTime(autoCacheStats?.oldestAccess ?? null)}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-item-label">最近访问</span>
                  <span className="stat-item-value">
                    {formatTime(autoCacheStats?.newestAccess ?? null)}
                  </span>
                </div>
              </div>
            </section>

            {/* 已下载区域 */}
            <section className="stat-section">
              <h3>已下载区域 ({tileAreas.length})</h3>
              {tileAreas.length === 0 ? (
                <div className="empty-hint">暂无已下载区域</div>
              ) : (
                <div className="download-status-list">
                  {tileAreas.slice(0, 5).map((area) => (
                    <div key={area.id} className="download-status-item">
                      <div className="download-status-info">
                        <span className="download-status-name">{area.name}</span>
                        <span className="download-status-meta">
                          {area.totalTiles} 瓦片 · {area.diskSizeMB.toFixed(1)} MB
                        </span>
                      </div>
                      <span className={`download-status-badge ${area.status}`}>
                        {area.status === 'completed' ? '已完成' : area.status === 'downloading' ? '下载中' : '待下载'}
                      </span>
                    </div>
                  ))}
                  {tileAreas.length > 5 && (
                    <button className="view-all-btn" onClick={() => setActiveTab('areas')}>
                      查看全部 {tileAreas.length} 个区域
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* 操作按钮 */}
            <section className="action-section" style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
              <button className="btn btn--primary" onClick={handleCleanup} disabled={cleaning}>
                {cleaning ? '清理中...' : '清理历史缓存'}
              </button>
              <button className="btn btn--danger" onClick={handleClearAll} disabled={cleaning}>
                清空历史缓存
              </button>
              <button className="btn btn--outline" onClick={refreshData}>
                刷新
              </button>
            </section>
          </div>
        )}

        {/* 下载区域 */}
        {activeTab === 'areas' && (
          <div className="areas-panel">
            <DownloadAreaPanel
              areas={tileAreas}
              onDelete={handleDeleteArea}
              onRefresh={refreshData}
            />
          </div>
        )}

        {/* 图源配置 */}
        {activeTab === 'sources' && (
          <div className="sources-panel">
            <CustomSourcePanel />
          </div>
        )}

        {/* 设置 */}
        {activeTab === 'settings' && (
          <div className="settings-panel">
            <h3>离线说明</h3>
            <div className="setting-item">
              <label>历史缓存上限</label>
              <select defaultValue="100">
                <option value="50">50 MB</option>
                <option value="100">100 MB</option>
                <option value="200">200 MB</option>
                <option value="500">500 MB</option>
              </select>
            </div>
            <div className="setting-item">
              <label>历史缓存清理阈值</label>
              <select defaultValue="0.9">
                <option value="0.8">80%</option>
                <option value="0.9">90%</option>
                <option value="0.95">95%</option>
              </select>
            </div>
            <div className="setting-item">
              <div className="setting-hint">
                自动缓存已永久停用，地图现在直接请求图源。需要离线使用时，请在“下载区域”中手动下载。
              </div>
            </div>
            <p className="setting-hint">
              注意：浏览器缓存配额由浏览器自动管理，通常为可用磁盘空间的 10%。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

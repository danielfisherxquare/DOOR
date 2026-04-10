/**
 * 下载区域面板
 * 用于选择区域、配置下载参数、显示下载进度
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import {
  createTileArea,
  updateTileAreaStatus,
  updateTileAreaStats,
} from '../../utils/db/tileAreaStore';
import { bulkInsertTiles } from '../../utils/db/tileCacheStore';
import { estimateDownload, type TileCoords } from '../../utils/map/tileCoords';
import { resolveTileUrl } from '../../utils/map/tileUrlResolver';
import { PRESET_TILE_SOURCES, type TileSourceConfig } from '../../utils/map/tileLayer';
import type { TileArea } from '../../utils/db/database';

interface DownloadAreaPanelProps {
  areas: TileArea[];
  onDelete: (id: string) => void;
  onRefresh: () => void;
}

interface DownloadProgress {
  areaId: string;
  total: number;
  completed: number;
  failed: number;
  status: 'preparing' | 'downloading' | 'completed' | 'cancelled' | 'error';
  startTime: number;
}

type Mode = 'list' | 'select' | 'downloading';

export default function DownloadAreaPanel({ areas, onDelete, onRefresh }: DownloadAreaPanelProps) {
  const [mode, setMode] = useState<Mode>('list');
  const [selectedSource, setSelectedSource] = useState<string>('light');
  const [minZoom, setMinZoom] = useState(10);
  const [maxZoom, setMaxZoom] = useState(16);
  const [areaName, setAreaName] = useState('');
  const [bounds, setBounds] = useState<{
    south: number;
    west: number;
    north: number;
    east: number;
  } | null>(null);
  const [estimate, setEstimate] = useState<{
    total: number;
    perZoom: Array<{ zoom: number; count: number }>;
    estimatedSizeMB: number;
  } | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [downloadingAreas, setDownloadingAreas] = useState<Set<string>>(new Set());

  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef<L.Rectangle | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 初始化地图
  useEffect(() => {
    if (mode !== 'select' || !mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [30.57, 104.07],
      zoom: 10,
    });

    L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri',
    }).addTo(map);

    mapRef.current = map;

    // 绘制矩形选择
    map.on('mousedown', (e) => {
      if (e.originalEvent.button !== 0) return;
      const startPoint = e.latlng;

      const onMouseMove = (moveEvent: L.LeafletMouseEvent) => {
        const endPoint = moveEvent.latlng;
        const south = Math.min(startPoint.lat, endPoint.lat);
        const north = Math.max(startPoint.lat, endPoint.lat);
        const west = Math.min(startPoint.lng, endPoint.lng);
        const east = Math.max(startPoint.lng, endPoint.lng);

        setBounds({ south, west, north, east });

        if (rectRef.current) {
          rectRef.current.setBounds([
            [south, west],
            [north, east],
          ]);
        } else {
          rectRef.current = L.rectangle(
            [
              [south, west],
              [north, east],
            ],
            { color: '#4f46e5', weight: 2, fillOpacity: 0.1 }
          ).addTo(map);
        }
      };

      const onMouseUp = () => {
        map.off('mousemove', onMouseMove);
        map.off('mouseup', onMouseUp);
      };

      map.on('mousemove', onMouseMove);
      map.on('mouseup', onMouseUp);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [mode]);

  // 更新估算
  useEffect(() => {
    if (!bounds) {
      setEstimate(null);
      return;
    }

    const result = estimateDownload(
      bounds.south,
      bounds.west,
      bounds.north,
      bounds.east,
      minZoom,
      maxZoom
    );
    setEstimate(result);
  }, [bounds, minZoom, maxZoom]);

  // 开始下载
  const handleStartDownload = async () => {
    if (!bounds || !estimate) return;

    const source = PRESET_TILE_SOURCES.find((s) => s.id === selectedSource);
    if (!source) return;

    const areaId = `area_${Date.now()}`;
    const name = areaName || `区域 ${areas.length + 1}`;

    setMode('downloading');
    setProgress({
      areaId,
      total: estimate.total,
      completed: 0,
      failed: 0,
      status: 'preparing',
      startTime: Date.now(),
    });

    abortControllerRef.current = new AbortController();

    try {
      // 创建区域记录
      await createTileArea({
        id: areaId,
        name,
        sourceId: source.id,
        sourceUrl: source.url,
        subdomains: source.subdomains,
        projection: source.projection,
        bounds,
        minZoom,
        maxZoom,
      });

      await updateTileAreaStatus(areaId, 'downloading');
      setProgress((p) => p && { ...p, status: 'downloading' });

      // 准备瓦片列表
      const tiles: Array<{ z: number; x: number; y: number }> = [];
      for (let z = minZoom; z <= maxZoom; z++) {
        const zTiles = estimate.perZoom.find((p) => p.zoom === z)?.count || 0;
        // 简化：只处理有估算数据的层级
      }

      // 实际计算瓦片坐标
      for (let z = minZoom; z <= maxZoom; z++) {
        const n = Math.pow(2, z);
        const xMin = Math.floor(((bounds.west + 180) / 360) * n);
        const xMax = Math.floor(((bounds.east + 180) / 360) * n);
        const yMin = Math.floor(
          ((1 - Math.log(Math.tan((bounds.north * Math.PI) / 180) + 1 / Math.cos((bounds.north * Math.PI) / 180)) / Math.PI) / 2) * n
        );
        const yMax = Math.floor(
          ((1 - Math.log(Math.tan((bounds.south * Math.PI) / 180) + 1 / Math.cos((bounds.south * Math.PI) / 180)) / Math.PI) / 2) * n
        );

        for (let x = Math.max(0, xMin); x <= Math.min(n - 1, xMax); x++) {
          for (let y = Math.max(0, yMin); y <= Math.min(n - 1, yMax); y++) {
            tiles.push({ z, x, y });
          }
        }
      }

      // 下载瓦片
      let completed = 0;
      let failed = 0;
      const downloadedBlobs: Array<{ sourceId: string; z: number; x: number; y: number; blob: Blob }> = [];
      const batchSize = 10;

      for (let i = 0; i < tiles.length; i += batchSize) {
        if (abortControllerRef.current?.signal.aborted) {
          setProgress((p) => p && { ...p, status: 'cancelled' });
          break;
        }

        const batch = tiles.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(async (tile) => {
            const url = resolveTileUrl(source.url, tile.x, tile.y, tile.z, {
              subdomains: source.subdomains,
            });
            const response = await fetch(url, { signal: abortControllerRef.current!.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            return { ...tile, blob };
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            downloadedBlobs.push({
              sourceId: source.id,
              z: result.value.z,
              x: result.value.x,
              y: result.value.y,
              blob: result.value.blob,
            });
            completed++;
          } else {
            failed++;
          }
        }

        setProgress((p) =>
          p ? { ...p, completed, failed } : null
        );

        // 批量存储
        if (downloadedBlobs.length >= 50) {
          await bulkInsertTiles(downloadedBlobs.splice(0, 50));
        }
      }

      // 存储剩余瓦片
      if (downloadedBlobs.length > 0) {
        await bulkInsertTiles(downloadedBlobs);
      }

      // 更新完成状态
      const totalSizeMB = (completed * 30) / 1024; // 估算
      await updateTileAreaStats(areaId, completed, totalSizeMB);

      setProgress((p) =>
        p ? { ...p, status: 'completed' } : null
      );

      onRefresh();
    } catch (error) {
      console.error('Download failed:', error);
      setProgress((p) =>
        p ? { ...p, status: 'error' } : null
      );
    }
  };

  // 取消下载
  const handleCancel = () => {
    abortControllerRef.current?.abort();
  };

  // 关闭选择
  const handleCloseSelect = () => {
    setMode('list');
    setBounds(null);
    setEstimate(null);
    setAreaName('');
    if (rectRef.current && mapRef.current) {
      mapRef.current.removeLayer(rectRef.current);
      rectRef.current = null;
    }
  };

  // 格式化时间
  const formatDuration = (start: number): string => {
    const seconds = Math.floor((Date.now() - start) / 1000);
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds}秒`;
  };

  // 列表模式
  if (mode === 'list') {
    return (
      <div className="area-list-panel">
        <div className="panel-header">
          <h3>已下载区域</h3>
          <button className="add-btn" onClick={() => setMode('select')}>
            + 新建区域
          </button>
        </div>

        {areas.length === 0 ? (
          <div className="empty-state">
            <p>暂无已下载区域</p>
            <button className="primary-btn" onClick={() => setMode('select')}>
              选择区域下载
            </button>
          </div>
        ) : (
          <div className="area-list">
            {areas.map((area) => (
              <div key={area.id} className="area-card">
                <div className="area-header">
                  <span className="area-name">{area.name}</span>
                  <span className={`area-status ${area.status}`}>
                    {area.status === 'completed'
                      ? '已完成'
                      : area.status === 'downloading'
                      ? '下载中'
                      : '待下载'}
                  </span>
                </div>
                <div className="area-details">
                  <div className="area-detail">
                    <span className="label">图源:</span>
                    <span className="value">{area.sourceId}</span>
                  </div>
                  <div className="area-detail">
                    <span className="label">层级:</span>
                    <span className="value">
                      {area.minZoom} - {area.maxZoom}
                    </span>
                  </div>
                  <div className="area-detail">
                    <span className="label">瓦片数:</span>
                    <span className="value">{area.totalTiles}</span>
                  </div>
                  <div className="area-detail">
                    <span className="label">大小:</span>
                    <span className="value">{area.diskSizeMB.toFixed(1)} MB</span>
                  </div>
                </div>
                <div className="area-actions">
                  <button className="delete-btn" onClick={() => onDelete(area.id)}>
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 选择模式
  if (mode === 'select') {
    return (
      <div className="select-panel">
        <div className="select-header">
          <h3>选择下载区域</h3>
          <button className="close-btn" onClick={handleCloseSelect}>
            ×
          </button>
        </div>

        <div className="select-content">
          <div className="map-container" ref={mapContainerRef} />

          <div className="config-panel">
            <div className="form-group">
              <label>区域名称</label>
              <input
                type="text"
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                placeholder="自动生成"
              />
            </div>

            <div className="form-group">
              <label>图源</label>
              <select value={selectedSource} onChange={(e) => setSelectedSource(e.target.value)}>
                {PRESET_TILE_SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>最小层级</label>
                <input
                  type="number"
                  value={minZoom}
                  onChange={(e) => setMinZoom(parseInt(e.target.value) || 1)}
                  min={1}
                  max={22}
                />
              </div>
              <div className="form-group">
                <label>最大层级</label>
                <input
                  type="number"
                  value={maxZoom}
                  onChange={(e) => setMaxZoom(parseInt(e.target.value) || 1)}
                  min={minZoom}
                  max={22}
                />
              </div>
            </div>

            {bounds && (
              <div className="bounds-info">
                <h4>选中区域</h4>
                <div className="bounds">
                  <span>北: {bounds.north.toFixed(4)}</span>
                  <span>南: {bounds.south.toFixed(4)}</span>
                  <span>西: {bounds.west.toFixed(4)}</span>
                  <span>东: {bounds.east.toFixed(4)}</span>
                </div>
              </div>
            )}

            {estimate && (
              <div className="estimate-info">
                <div className="estimate-item">
                  <span className="label">预估瓦片数:</span>
                  <span className="value">{estimate.total.toLocaleString()}</span>
                </div>
                <div className="estimate-item">
                  <span className="label">预估大小:</span>
                  <span className="value">{estimate.estimatedSizeMB.toFixed(1)} MB</span>
                </div>
              </div>
            )}

            <div className="hint">
              在地图上按住鼠标左键拖动绘制矩形区域
            </div>

            <div className="actions">
              <button className="cancel-btn" onClick={handleCloseSelect}>
                取消
              </button>
              <button
                className="download-btn"
                onClick={handleStartDownload}
                disabled={!bounds || !estimate || estimate.total > 5000}
              >
                开始下载
              </button>
            </div>

            {estimate && estimate.total > 5000 && (
              <div className="warning">
                瓦片数量过多（{estimate.total.toLocaleString()}），请缩小范围或减少层级
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 下载模式
  return (
    <div className="downloading-panel">
      <h3>正在下载</h3>

      {progress && (
        <div className="progress-container">
          <div className="progress-info">
            <span className="status">
              {progress.status === 'preparing'
                ? '准备中...'
                : progress.status === 'downloading'
                ? '下载中...'
                : progress.status === 'completed'
                ? '下载完成'
                : progress.status === 'cancelled'
                ? '已取消'
                : '下载失败'}
            </span>
            <span className="count">
              {progress.completed} / {progress.total}
            </span>
          </div>

          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(progress.completed / progress.total) * 100}%` }}
            />
          </div>

          <div className="progress-meta">
            <span>失败: {progress.failed}</span>
            <span>耗时: {formatDuration(progress.startTime)}</span>
          </div>

          {(progress.status === 'downloading' || progress.status === 'preparing') && (
            <button className="cancel-btn" onClick={handleCancel}>
              取消下载
            </button>
          )}

          {(progress.status === 'completed' ||
            progress.status === 'cancelled' ||
            progress.status === 'error') && (
            <button
              className="close-btn"
              onClick={() => {
                setMode('list');
                setProgress(null);
              }}
            >
              返回列表
            </button>
          )}
        </div>
      )}
    </div>
  );
}

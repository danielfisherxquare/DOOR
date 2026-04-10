/**
 * TileNetworkMonitor.tsx
 * 瓦片网络实时显示器
 * 显示缓存命中和网络请求统计
 */

import React, { useState } from 'react';
import { useTileNetworkStats, type TileLoadEvent } from '../../utils/map/tileEvents';
import './TileNetworkMonitor.css';

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function EventRow({ event }: { event: TileLoadEvent }) {
  const iconMap = {
    cache: '🟢',
    network: '🔵',
    error: '🔴',
  };

  return (
    <div className={`tile-event-row ${event.type}`}>
      <span className="event-icon">{iconMap[event.type]}</span>
      <span className="event-coords">z{event.z}/x{event.x}/y{event.y}</span>
      {event.duration !== undefined && (
        <span className="event-duration">{event.duration}ms</span>
      )}
      <span className="event-time">{formatTimestamp(event.timestamp)}</span>
    </div>
  );
}

export default function TileNetworkMonitor() {
  const stats = useTileNetworkStats();
  const [collapsed, setCollapsed] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  // 计算总请求数和命中率
  const total = stats.cacheHits + stats.networkRequests;
  const hitRate = total > 0 ? stats.hitRate.toFixed(1) : '0';

  // 折叠状态
  if (collapsed) {
    return (
      <div className="tile-monitor-collapsed" onClick={() => setCollapsed(false)}>
        <span className="monitor-icon">🗺️</span>
        {stats.activeRequests > 0 ? (
          <span className="active-indicator">⏳ {stats.activeRequests}</span>
        ) : (
          <span className="ready-indicator">✓</span>
        )}
        {total > 0 && (
          <span className="hit-rate-mini">{hitRate}%</span>
        )}
      </div>
    );
  }

  return (
    <div className="tile-monitor">
      {/* 标题栏 */}
      <div className="tile-monitor-header">
        <h4>📊 瓦片加载监控</h4>
        <button className="collapse-btn" onClick={() => setCollapsed(true)}>
          −
        </button>
      </div>

      {/* 统计数据 */}
      <div className="tile-monitor-stats">
        <div className="tile-stat-item">
          <span className="tile-stat-label">缓存命中</span>
          <span className="tile-stat-value cache">🟢 {stats.cacheHits}</span>
        </div>
        <div className="tile-stat-item">
          <span className="tile-stat-label">网络请求</span>
          <span className="tile-stat-value network">🔵 {stats.networkRequests}</span>
        </div>
        <div className="tile-stat-item">
          <span className="tile-stat-label">命中率</span>
          <span className="tile-stat-value rate">{hitRate}%</span>
        </div>
        {stats.activeRequests > 0 && (
          <div className="tile-stat-item">
            <span className="tile-stat-label">活跃请求</span>
            <span className="tile-stat-value active">⏳ {stats.activeRequests}</span>
          </div>
        )}
        {stats.errors > 0 && (
          <div className="tile-stat-item">
            <span className="tile-stat-label">错误</span>
            <span className="tile-stat-value error">🔴 {stats.errors}</span>
          </div>
        )}
      </div>

      {/* 命中率进度条 */}
      <div className="hit-rate-bar">
        <div className="hit-rate-fill" style={{ width: `${stats.hitRate}%` }} />
      </div>

      {/* 历史记录切换 */}
      <button
        className="history-toggle"
        onClick={() => setShowHistory(!showHistory)}
      >
        {showHistory ? '▲ 隐藏记录' : '▼ 显示记录'}
      </button>

      {/* 历史记录列表 */}
      {showHistory && (
        <div className="tile-monitor-history">
          {stats.recentEvents.length === 0 ? (
            <div className="no-events">暂无加载记录</div>
          ) : (
            stats.recentEvents.slice(0, 20).map((event, index) => (
              <EventRow key={`${event.timestamp}-${index}`} event={event} />
            ))
          )}
        </div>
      )}

      {/* 重置按钮 */}
      <button
        className="reset-btn"
        onClick={() => {
          import('../../utils/map/tileEvents').then(({ tileEventManager }) => {
            tileEventManager.reset();
          });
        }}
      >
        重置统计
      </button>
    </div>
  );
}
/**
 * tileEvents.ts
 * 瓦片加载事件管理
 * 用于监控缓存命中和网络请求
 */

import React from 'react';

// 简单的事件发射器实现（浏览器兼容）
type EventHandler = (stats: TileNetworkStats) => void;

class SimpleEventEmitter {
  private listeners: Map<string, Set<EventHandler>> = new Map();

  on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, stats: TileNetworkStats): void {
    this.listeners.get(event)?.forEach((handler) => handler(stats));
  }
}

export interface TileLoadEvent {
  type: 'cache' | 'network' | 'error';
  z: number;
  x: number;
  y: number;
  sourceId?: string;
  sourceName?: string;
  duration?: number;
  timestamp: number;
}

export interface TileNetworkStats {
  cacheHits: number;
  networkRequests: number;
  errors: number;
  activeRequests: number;
  hitRate: number;
  recentEvents: TileLoadEvent[];
}

const MAX_RECENT_EVENTS = 50;

class TileEventManager extends SimpleEventEmitter {
  private stats: TileNetworkStats = {
    cacheHits: 0,
    networkRequests: 0,
    errors: 0,
    activeRequests: 0,
    hitRate: 0,
    recentEvents: [],
  };

  recordCacheHit(z: number, x: number, y: number, sourceId?: string, sourceName?: string): void {
    this.stats.cacheHits += 1;
    this.updateHitRate();
    this.addEvent({
      type: 'cache',
      z,
      x,
      y,
      sourceId,
      sourceName,
      timestamp: Date.now(),
    });
    this.emit('stats-change', this.getStats());
  }

  recordNetworkRequest(
    z: number,
    x: number,
    y: number,
    duration: number,
    sourceId?: string,
    sourceName?: string
  ): void {
    this.stats.networkRequests += 1;
    this.updateHitRate();
    this.addEvent({
      type: 'network',
      z,
      x,
      y,
      duration,
      sourceId,
      sourceName,
      timestamp: Date.now(),
    });
    this.emit('stats-change', this.getStats());
  }

  recordError(z: number, x: number, y: number, sourceId?: string, sourceName?: string): void {
    this.stats.errors += 1;
    this.addEvent({
      type: 'error',
      z,
      x,
      y,
      sourceId,
      sourceName,
      timestamp: Date.now(),
    });
    this.emit('stats-change', this.getStats());
  }

  incrementActiveRequests(): void {
    this.stats.activeRequests += 1;
    this.emit('stats-change', this.getStats());
  }

  decrementActiveRequests(): void {
    this.stats.activeRequests = Math.max(0, this.stats.activeRequests - 1);
    this.emit('stats-change', this.getStats());
  }

  getStats(): TileNetworkStats {
    return {
      ...this.stats,
      recentEvents: [...this.stats.recentEvents],
    };
  }

  reset(): void {
    this.stats = {
      cacheHits: 0,
      networkRequests: 0,
      errors: 0,
      activeRequests: 0,
      hitRate: 0,
      recentEvents: [],
    };
    this.emit('stats-change', this.getStats());
  }

  private updateHitRate(): void {
    const total = this.stats.cacheHits + this.stats.networkRequests;
    this.stats.hitRate = total > 0 ? (this.stats.cacheHits / total) * 100 : 0;
  }

  private addEvent(event: TileLoadEvent): void {
    this.stats.recentEvents.unshift(event);
    if (this.stats.recentEvents.length > MAX_RECENT_EVENTS) {
      this.stats.recentEvents.pop();
    }
  }
}

// 全局单例
export const tileEventManager = new TileEventManager();

// React Hook
export function useTileNetworkStats(): TileNetworkStats {
  const [stats, setStats] = React.useState<TileNetworkStats>(tileEventManager.getStats());

  React.useEffect(() => {
    const handleChange = (newStats: TileNetworkStats) => {
      setStats(newStats);
    };

    tileEventManager.on('stats-change', handleChange);
    return () => {
      tileEventManager.off('stats-change', handleChange);
    };
  }, []);

  return stats;
}

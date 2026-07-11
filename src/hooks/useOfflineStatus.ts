/**
 * 离线状态检测 Hook
 */

import { useState, useEffect, useCallback } from 'react';

export interface OfflineStatus {
  isOnline: boolean;
  wasOffline: boolean;
  lastOnlineTime: number | null;
  offlineDuration: number;
  connectionType: string;
}

const initialStatus: OfflineStatus = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  wasOffline: false,
  lastOnlineTime: typeof navigator !== 'undefined' && navigator.onLine ? Date.now() : null,
  offlineDuration: 0,
  connectionType: 'unknown',
};

/**
 * 获取网络连接类型
 */
function getConnectionType(): string {
  const nav = navigator as any;

  if (nav.connection) {
    return nav.connection.effectiveType || nav.connection.type || 'unknown';
  }

  return 'unknown';
}

/**
 * 离线状态 Hook
 */
export function useOfflineStatus(): OfflineStatus {
  const [status, setStatus] = useState<OfflineStatus>(() => ({
    ...initialStatus,
    connectionType: getConnectionType(),
  }));

  useEffect(() => {
    const handleOnline = () => {
      setStatus((prev) => {
        const now = Date.now();
        return {
          isOnline: true,
          wasOffline: prev.wasOffline,
          lastOnlineTime: now,
          offlineDuration: prev.lastOnlineTime ? now - prev.lastOnlineTime : 0,
          connectionType: getConnectionType(),
        };
      });
    };

    const handleOffline = () => {
      setStatus((prev) => ({
        isOnline: false,
        wasOffline: true,
        lastOnlineTime: prev.lastOnlineTime,
        offlineDuration: 0,
        connectionType: getConnectionType(),
      }));
    };

    // 监听网络状态变化
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 监听连接类型变化 (如果支持)
    const nav = navigator as any;
    if (nav.connection) {
      nav.connection.addEventListener('change', () => {
        setStatus((prev) => ({
          ...prev,
          connectionType: getConnectionType(),
        }));
      });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      if (nav.connection) {
        nav.connection.removeEventListener('change', () => {});
      }
    };
  }, []);

  return status;
}

/**
 * 网络恢复提示 Hook
 */
export function useNetworkRecovery(
  onRecovery: () => void,
  deps: any[] = []
): void {
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      if (wasOffline) {
        onRecovery();
        setWasOffline(false);
      }
    };

    const handleOffline = () => {
      setWasOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline, ...deps]);
}

/**
 * 离线提示 Hook
 */
export function useOfflineWarning(_message: string = '当前处于离线状态'): {
  showWarning: boolean;
  dismissWarning: () => void;
} {
  const { isOnline } = useOfflineStatus();
  const [dismissed, setDismissed] = useState(false);

  const showWarning = !isOnline && !dismissed;

  const dismissWarning = useCallback(() => {
    setDismissed(true);
  }, []);

  // 在线时重置
  useEffect(() => {
    if (isOnline) {
      setDismissed(false);
    }
  }, [isOnline]);

  return { showWarning, dismissWarning };
}

/**
 * 格式化离线持续时间
 */
export function formatOfflineDuration(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}小时${minutes % 60}分钟`;
  }
  if (minutes > 0) {
    return `${minutes}分钟`;
  }
  return `${seconds}秒`;
}

import { useEffect } from 'react';
import { LEGACY_TILE_CACHE_RELOAD_SESSION_KEY } from '../utils/map/serviceWorkerManager';
import { runLegacyTileCacheMigration } from '../utils/map/tileCacheService';

export function useLegacyTileCacheMigration(scopeLabel: string): void {
  useEffect(() => {
    let disposed = false;

    runLegacyTileCacheMigration()
      .then((result) => {
        if (disposed) return;

        if (result.needsReload) {
          const hasReloaded = sessionStorage.getItem(LEGACY_TILE_CACHE_RELOAD_SESSION_KEY) === 'done';
          if (!hasReloaded) {
            sessionStorage.setItem(LEGACY_TILE_CACHE_RELOAD_SESSION_KEY, 'done');
            window.location.reload();
            return;
          }
          sessionStorage.removeItem(LEGACY_TILE_CACHE_RELOAD_SESSION_KEY);
        }

        if (import.meta.env.DEV && (result.cleaned || result.deletedCaches.length > 0)) {
          console.info(`[${scopeLabel}] Legacy tile cache migrated`, result);
        }
      })
      .catch((error) => {
        console.warn(`[${scopeLabel}] Legacy tile cache migration failed:`, error);
      });

    return () => {
      disposed = true;
    };
  }, [scopeLabel]);
}

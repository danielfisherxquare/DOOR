import { useEffect, useMemo, useRef, useState } from 'react';
import { useMapStore, type TileStyle, type BuildingStyle } from '../../stores/mapStore';
import type { MapViewMode } from '../../utils/map/browseState';
import {
  PRESET_TILE_SOURCES,
  getTileSourceAvailabilityIssue,
  type TileSourceConfig,
  type TileSourceCategory,
} from '../../utils/map/tileLayer';

const VIEW_MODES: { value: MapViewMode; label: string; icon: string }[] = [
  { value: '2D', label: '二维平面', icon: 'map' },
  { value: '3DGlobe', label: '三维地球', icon: 'public' },
  { value: '3D', label: '高德三维', icon: 'satellite_alt' },
];

// 分类配置
const CATEGORY_LABELS: Record<TileSourceCategory, { label: string; icon: string; description: string }> = {
  basic: { label: '基础地图', icon: 'map', description: '道路、标注与通用浏览底图' },
  satellite: { label: '卫星影像', icon: 'satellite_alt', description: '真实影像与航片底图' },
  terrain: { label: '地形', icon: 'terrain', description: '地势起伏与等高信息' },
  special: { label: '专题地图', icon: 'interests', description: '面向专题分析的表达样式' },
  esri: { label: 'Esri 系列', icon: 'layers', description: 'ArcGIS 系列在线底图' },
  tianditu: { label: '天地图', icon: 'public', description: '适合国内场景的政务图源' },
  stadia: { label: 'Stadia', icon: 'palette', description: '风格化地图与暗色方案' },
  weather: { label: '天气叠加', icon: 'cloud', description: '云图、降水等气象叠加' },
  other: { label: '其他', icon: 'more_horiz', description: '补充图源与特殊选项' },
};

// 快速访问底图（常用底图的快捷入口）
const QUICK_ACCESS_TILES: string[] = [
  'osm_mapnik',
  'esri_world_imagery',
  'carto_darkmatter',
  'gaode_road',
  'gaode_satellite',
];

// 根据视图模式过滤可用图源
function filterSourcesByViewMode(sources: TileSourceConfig[], viewMode: MapViewMode): TileSourceConfig[] {
  switch (viewMode) {
    case '2D':
      // 2D支持所有图源
      return sources;
    case '3DGlobe':
      // 3D Globe仅支持WGS84投影（GCJ02会有坐标偏移）
      return sources.filter(s => s.projection === 'wgs84');
    case '3D':
      // 高德3D仅支持高德底图
      return sources.filter(s => s.id.startsWith('gaode_'));
    default:
      return sources;
  }
}

// 建筑/白模配置 - 按视图模式分组
const BUILDING_STYLES_CONFIG: Record<MapViewMode, { value: BuildingStyle; label: string; icon: string }[]> = {
  '2D': [], // 2D模式不支持建筑
  '3DGlobe': [
    { value: 'osm', label: 'OSM 白模', icon: 'apartment' },
    { value: 'osmGeoJson', label: '三方OSM', icon: 'domain' },
    { value: 'google3d', label: 'Google 真实 3D', icon: 'location_city' },
  ],
  '3D': [
    { value: 'amap', label: '高德白模', icon: 'apartment' },
  ],
};

const VIEW_MODE_SOURCE_HINTS: Record<MapViewMode, string> = {
  '2D': '当前显示全部可用底图。',
  '3DGlobe': '当前仅显示可直接使用的 WGS84 图源，已自动隐藏需 Key、HTTP 或覆盖不足的底图。',
  '3D': '当前仅显示高德图源，保证高德三维场景一致性。',
};

function getProviderLabel(source: TileSourceConfig): string {
  if (source.id.startsWith('gaode_')) return '高德';
  if (source.id.startsWith('esri_')) return 'Esri';
  if (source.id.startsWith('tianditu_')) return '天地图';
  if (source.id.startsWith('stadia_')) return 'Stadia';
  if (source.id.startsWith('carto_')) return 'CARTO';
  if (source.id.startsWith('osm_')) return 'OSM';
  if (source.id.startsWith('weather_')) return 'Weather';
  if (source.name.toLowerCase().includes('google')) return 'Google';
  return CATEGORY_LABELS[source.category || 'other']?.label ?? '地图图源';
}

function getProjectionLabel(source: TileSourceConfig): string {
  return source.projection === 'gcj02' ? 'GCJ-02' : 'WGS84';
}

function getTileSourceVisual(source: TileSourceConfig): { symbol: string; tone: TileSourceCategory } {
  const tone = source.category || 'other';

  if (source.id.includes('dark') || source.name.toLowerCase().includes('dark')) {
    return { symbol: 'dark_mode', tone };
  }
  if (source.id.startsWith('gaode_')) {
    return { symbol: source.category === 'satellite' ? 'satellite_alt' : 'route', tone };
  }
  if (source.id.startsWith('esri_')) {
    return { symbol: source.category === 'satellite' ? 'satellite_alt' : 'layers', tone };
  }
  if (source.id.startsWith('tianditu_')) {
    return { symbol: 'globe_asia', tone };
  }
  if (source.category === 'terrain') {
    return { symbol: 'terrain', tone };
  }
  if (source.category === 'weather') {
    return { symbol: 'cloud', tone };
  }
  if (source.category === 'satellite') {
    return { symbol: 'satellite_alt', tone };
  }
  if (source.category === 'special') {
    return { symbol: 'interests', tone };
  }
  if (source.category === 'stadia') {
    return { symbol: 'palette', tone };
  }
  return { symbol: 'map', tone };
}

function getTileSourceMeta(source: TileSourceConfig): string {
  const parts = [getProviderLabel(source), getProjectionLabel(source)];
  if (source.requires_api_key) {
    parts.push(source.api_key ? '已配置 Key' : '需 Key');
  }
  return parts.join(' · ');
}

interface MapControlsProps {
  variant?: 'floating' | 'inline';
  showHint?: boolean;
}

export default function MapControls({ variant = 'floating', showHint = true }: MapControlsProps) {
  const { viewMode, tileStyle, buildingStyle, autoTilt, setViewMode, setTileStyle, setBuildingStyle, toggleAutoTilt } = useMapStore();
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showTileMenu, setShowTileMenu] = useState(false);
  const [tileSearchQuery, setTileSearchQuery] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<TileSourceCategory | null>('basic');
  const controlsRef = useRef<HTMLDivElement | null>(null);

  // 根据当前视图模式过滤可用图源
  const availableSources = useMemo(() => {
    return filterSourcesByViewMode(PRESET_TILE_SOURCES, viewMode).filter(
      (source) => !getTileSourceAvailabilityIssue(source, viewMode),
    );
  }, [viewMode]);

  // 快速访问图源
  const quickAccessSources = useMemo(() => {
    return QUICK_ACCESS_TILES
      .map(id => availableSources.find(s => s.id === id))
      .filter((s): s is TileSourceConfig => s !== undefined);
  }, [availableSources]);

  // 按分类组织的图源
  const categorizedSources = useMemo(() => {
    const map = new Map<TileSourceCategory, TileSourceConfig[]>();
    availableSources.forEach(source => {
      const cat = source.category || 'other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(source);
    });
    return map;
  }, [availableSources]);

  // 搜索结果
  const searchResults = useMemo(() => {
    if (!tileSearchQuery.trim()) return [];
    const q = tileSearchQuery.toLowerCase();
    return availableSources.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  }, [availableSources, tileSearchQuery]);

  // 获取当前选中的图源信息
  const currentSource = useMemo(() => {
    return availableSources.find(s => s.id === tileStyle);
  }, [availableSources, tileStyle]);

  useEffect(() => {
    if (availableSources.length === 0) {
      return;
    }

    if (!availableSources.some((source) => source.id === tileStyle)) {
      setTileStyle(availableSources[0].id);
    }
  }, [availableSources, setTileStyle, tileStyle]);

  useEffect(() => {
    if (!showViewMenu && !showTileMenu) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && controlsRef.current?.contains(target)) {
        return;
      }
      setShowViewMenu(false);
      setShowTileMenu(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowViewMenu(false);
        setShowTileMenu(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showTileMenu, showViewMenu]);

  const openTileMenu = () => {
    const nextOpen = !showTileMenu;
    setShowTileMenu(nextOpen);
    setShowViewMenu(false);
    if (nextOpen) {
      setTileSearchQuery('');
      setExpandedCategory(currentSource?.category || 'basic');
    }
  };

  const handleTileSelect = (sourceId: TileStyle) => {
    setTileStyle(sourceId);
    setShowTileMenu(false);
    setTileSearchQuery('');
  };

  // 切换视图模式时，自动回退不兼容的底图
  const handleViewModeChange = (newMode: MapViewMode) => {
    const newAvailableSources = filterSourcesByViewMode(PRESET_TILE_SOURCES, newMode);
    const newBuildingStyles = BUILDING_STYLES_CONFIG[newMode];

    setViewMode(newMode);
    setShowViewMenu(false);

    // 底图回退：如果当前底图不在新模式下可用，切换到第一个
    if (!newAvailableSources.some(s => s.id === tileStyle) && newAvailableSources.length > 0) {
      setTileStyle(newAvailableSources[0].id);
    }

    // 建筑回退
    if (buildingStyle !== 'none' && !newBuildingStyles.some(s => s.value === buildingStyle)) {
      setBuildingStyle('none');
    }
  };

  // 建筑样式切换
  const handleBuildingStyleToggle = (style: BuildingStyle) => {
    if (buildingStyle === style) {
      setBuildingStyle('none');
    } else {
      setBuildingStyle(style);
    }
  };

  const currentViewMode = VIEW_MODES.find(m => m.value === viewMode);
  const availableBuildingStyles = BUILDING_STYLES_CONFIG[viewMode];
  const currentVisual = currentSource ? getTileSourceVisual(currentSource) : null;

  return (
    <div ref={controlsRef} className={`map-controls map-controls--${variant}`}>
      <div className="map-controls__toolbar">
        {/* 视图切换按钮 */}
        <div className="map-controls__btn-group">
          <button
            type="button"
            className="map-controls__btn"
            onClick={() => {
              setShowViewMenu(!showViewMenu);
              setShowTileMenu(false);
            }}
            title={`视图: ${currentViewMode?.label || '二维平面'}`}
          >
            <span className="material-symbols-outlined">{currentViewMode?.icon || 'map'}</span>
          </button>
          {showViewMenu && (
            <div className={`map-controls__menu ${variant === 'inline' ? 'map-controls__menu--inline' : ''}`.trim()}>
              <div className="map-controls__menu-label">视图模式</div>
              {VIEW_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={`map-controls__menu-item ${viewMode === mode.value ? 'is-active' : ''}`}
                  onClick={() => handleViewModeChange(mode.value)}
                >
                  <span className="material-symbols-outlined">{mode.icon}</span>
                  <span>{mode.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 底图切换按钮 */}
        <div className="map-controls__btn-group">
          <button
            type="button"
            className="map-controls__btn"
            onClick={openTileMenu}
            title={`底图: ${currentSource?.name || '选择底图'}`}
          >
            <span className="material-symbols-outlined">{currentVisual?.symbol || 'layers'}</span>
          </button>
          {showTileMenu && (
            <div
              className={`map-controls__tile-menu ${variant === 'inline' ? 'map-controls__tile-menu--inline' : ''}`.trim()}
              role="dialog"
              aria-label="底图选择面板"
            >
              <div className="map-controls__tile-menu-header">
                <div className="map-controls__tile-eyebrow">Basemap Library</div>
                <div className="map-controls__tile-title-row">
                  <div className="map-controls__tile-title-group">
                    <div className="map-controls__tile-title">选择底图</div>
                    <div className="map-controls__tile-subline">
                      {currentSource
                        ? `当前使用 ${currentSource.name}。${VIEW_MODE_SOURCE_HINTS[viewMode]}`
                        : VIEW_MODE_SOURCE_HINTS[viewMode]}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="map-controls__tile-close"
                    onClick={() => setShowTileMenu(false)}
                    aria-label="关闭底图面板"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
                <div className="map-controls__tile-meta">
                  <span>{currentViewMode?.label || '二维平面'}</span>
                  <span>{availableSources.length} 个可用图源</span>
                  {currentSource && <span>{getTileSourceMeta(currentSource)}</span>}
                </div>
              </div>

              <div className="map-controls__tile-search">
                <div className="map-controls__tile-search-shell">
                  <span className="material-symbols-outlined">search</span>
                  <input
                    type="text"
                    placeholder="搜索底图、图源或关键字"
                    value={tileSearchQuery}
                    onChange={(e) => setTileSearchQuery(e.target.value)}
                  />
                  {tileSearchQuery && (
                    <button
                      type="button"
                      className="map-controls__tile-search-clear"
                      onClick={() => setTileSearchQuery('')}
                      aria-label="清空搜索"
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="map-controls__tile-body">
                {tileSearchQuery.trim() && (
                  <div className="map-controls__tile-section">
                    <div className="map-controls__tile-section-head">
                      <div className="map-controls__tile-section-label">搜索结果</div>
                      <div className="map-controls__tile-section-meta">{searchResults.length} 个匹配</div>
                    </div>
                    {searchResults.length === 0 ? (
                      <div className="map-controls__tile-empty">
                        <div className="map-controls__tile-empty-title">未找到匹配的底图</div>
                        <div className="map-controls__tile-empty-subline">尝试搜索品牌名、用途或切换当前视图模式。</div>
                      </div>
                    ) : (
                      <div className="map-controls__tile-results">
                        {searchResults.map((source) => {
                          const visual = getTileSourceVisual(source);
                          return (
                            <button
                              key={source.id}
                              type="button"
                              className={`map-controls__tile-item ${tileStyle === source.id ? 'is-active' : ''}`}
                              onClick={() => handleTileSelect(source.id as TileStyle)}
                            >
                              <span className={`map-controls__tile-glyph is-${visual.tone}`}>
                                <span className="material-symbols-outlined">{visual.symbol}</span>
                              </span>
                              <span className="map-controls__tile-copy">
                                <span className="map-controls__tile-name">{source.name}</span>
                                <span className="map-controls__tile-meta-line">{getTileSourceMeta(source)}</span>
                              </span>
                              {tileStyle === source.id ? (
                                <span className="map-controls__tile-state" aria-hidden="true">
                                  <span className="material-symbols-outlined">check</span>
                                </span>
                              ) : (
                                source.requires_api_key && !source.api_key && (
                                  <span className="map-controls__tile-key" title={source.api_key_hint || '需要 API Key'}>
                                    <span className="material-symbols-outlined">key</span>
                                    <span>需 Key</span>
                                  </span>
                                )
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {!tileSearchQuery.trim() && (
                  <>
                    <div className="map-controls__tile-section">
                      <div className="map-controls__tile-section-head">
                        <div className="map-controls__tile-section-label">常用底图</div>
                        <div className="map-controls__tile-section-meta">优先推荐的快速切换</div>
                      </div>
                      <div className="map-controls__tile-quick">
                        {quickAccessSources.map((source) => {
                          const visual = getTileSourceVisual(source);
                          return (
                            <button
                              key={source.id}
                              type="button"
                              className={`map-controls__tile-item map-controls__tile-item--quick ${tileStyle === source.id ? 'is-active' : ''}`}
                              onClick={() => handleTileSelect(source.id as TileStyle)}
                            >
                              <span className={`map-controls__tile-glyph is-${visual.tone}`}>
                                <span className="material-symbols-outlined">{visual.symbol}</span>
                              </span>
                              <span className="map-controls__tile-copy">
                                <span className="map-controls__tile-name">{source.name}</span>
                                <span className="map-controls__tile-meta-line">{getTileSourceMeta(source)}</span>
                              </span>
                              {tileStyle === source.id && (
                                <span className="map-controls__tile-state" aria-hidden="true">
                                  <span className="material-symbols-outlined">check</span>
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {Array.from(categorizedSources.entries()).map(([category, sources]) => {
                      const catInfo = CATEGORY_LABELS[category] || CATEGORY_LABELS.other;
                      const isExpanded = expandedCategory === category;
                      const hasApiKeyRequired = sources.some(s => s.requires_api_key);

                      return (
                        <div key={category} className="map-controls__tile-category">
                          <button
                            type="button"
                            className="map-controls__tile-category-header"
                            onClick={() => setExpandedCategory(isExpanded ? null : category)}
                          >
                            <span className={`map-controls__tile-category-icon is-${category}`}>
                              <span className="material-symbols-outlined">{catInfo.icon}</span>
                            </span>
                            <span className="map-controls__tile-category-copy">
                              <span className="map-controls__tile-category-label">{catInfo.label}</span>
                              <span className="map-controls__tile-category-summary">{catInfo.description}</span>
                            </span>
                            <span className="map-controls__tile-count">{sources.length}</span>
                            {hasApiKeyRequired && (
                              <span className="map-controls__tile-key map-controls__tile-key--compact" title="部分图源需要 API Key">
                                <span className="material-symbols-outlined">key</span>
                              </span>
                            )}
                            <span className={`material-symbols-outlined map-controls__tile-expand ${isExpanded ? 'is-expanded' : ''}`}>expand_more</span>
                          </button>
                          {isExpanded && (
                            <div className="map-controls__tile-category-items">
                              {sources.map((source) => {
                                const visual = getTileSourceVisual(source);
                                return (
                                  <button
                                    key={source.id}
                                    type="button"
                                    className={`map-controls__tile-item ${tileStyle === source.id ? 'is-active' : ''}`}
                                    onClick={() => handleTileSelect(source.id as TileStyle)}
                                  >
                                    <span className={`map-controls__tile-glyph is-${visual.tone}`}>
                                      <span className="material-symbols-outlined">{visual.symbol}</span>
                                    </span>
                                    <span className="map-controls__tile-copy">
                                      <span className="map-controls__tile-name">{source.name}</span>
                                      <span className="map-controls__tile-meta-line">{getTileSourceMeta(source)}</span>
                                    </span>
                                    {tileStyle === source.id ? (
                                      <span className="map-controls__tile-state" aria-hidden="true">
                                        <span className="material-symbols-outlined">check</span>
                                      </span>
                                    ) : (
                                      source.requires_api_key && !source.api_key && (
                                        <span className="map-controls__tile-key" title={source.api_key_hint || '需要 API Key'}>
                                          <span className="material-symbols-outlined">key</span>
                                          <span>需 Key</span>
                                        </span>
                                      )
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 建筑切换按钮（仅3D模式显示） */}
        {availableBuildingStyles.length > 0 && (
          <div className="map-controls__btn-group">
            {availableBuildingStyles.map((style) => (
              <button
                key={style.value}
                type="button"
                className={`map-controls__btn ${buildingStyle === style.value ? 'is-active' : ''}`}
                onClick={() => handleBuildingStyleToggle(style.value)}
                title={`${style.label}${buildingStyle === style.value ? ' (已启用)' : ''}`}
              >
                <span className="material-symbols-outlined">{style.icon}</span>
              </button>
            ))}
          </div>
        )}

        {/* 自动倾斜开关（仅3DGlobe模式显示） */}
        {viewMode === '3DGlobe' && (
          <div className="map-controls__btn-group">
            <button
              type="button"
              className={`map-controls__btn ${autoTilt ? 'is-active' : ''}`}
              onClick={toggleAutoTilt}
              title={`自动倾斜${autoTilt ? ' (已启用)' : ' (已关闭)'} — 缩放到近地面时自动切换3D视角`}
            >
              <span className="material-symbols-outlined">3d_rotation</span>
            </button>
          </div>
        )}
      </div>

      {/* 提示信息 */}
      {showHint && buildingStyle !== 'none' && (
        <div className="map-controls__hint">
          {buildingStyle === 'google3d' ? 'Google 真实3D' : buildingStyle === 'osmGeoJson' ? '三方 OSM 白模' : '白模仅供参考'}
        </div>
      )}
    </div>
  );
}

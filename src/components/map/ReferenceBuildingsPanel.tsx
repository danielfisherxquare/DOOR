import { useEffect, useState } from 'react';
import { useMapStore, type HiddenOsmBuilding } from '../../stores/mapStore';
import { CommandEmptyState, CommandNotice, CommandPanel } from '../command/CommandPrimitives';

function getBuildingLabel(building: HiddenOsmBuilding): string {
  const name = building.name?.trim();
  return name || `OSM 建筑 #${building.elementId}`;
}

export default function ReferenceBuildingsPanel() {
  const buildingStyle = useMapStore((state) => state.buildingStyle);
  const browseState = useMapStore((state) => state.browseState);
  const hiddenOsmBuildings = useMapStore((state) => state.hiddenOsmBuildings);
  const setBrowseState = useMapStore((state) => state.setBrowseState);
  const showOsmBuilding = useMapStore((state) => state.showOsmBuilding);
  const showOsmBuildings = useMapStore((state) => state.showOsmBuildings);
  const clearHiddenOsmBuildings = useMapStore((state) => state.clearHiddenOsmBuildings);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    const existingKeys = new Set(hiddenOsmBuildings.map((item) => item.key));
    setCheckedKeys((prev) => prev.filter((key) => existingKeys.has(key)));
  }, [hiddenOsmBuildings]);

  const hiddenCount = hiddenOsmBuildings.length;
  const checkedCount = checkedKeys.length;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const buildingTypes = Array.from(
    new Set(
      hiddenOsmBuildings
        .map((item) => item.buildingType?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  ).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const filteredHiddenOsmBuildings = hiddenOsmBuildings.filter((building) => {
    const buildingType = building.buildingType?.trim() || '';
    const matchesType = typeFilter === 'all' || buildingType === typeFilter;
    if (!matchesType) return false;
    if (!normalizedSearch) return true;

    const haystack = [
      getBuildingLabel(building),
      buildingType,
      building.elementType,
      String(building.elementId),
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });
  const filteredKeys = filteredHiddenOsmBuildings.map((item) => item.key);
  const allChecked = filteredKeys.length > 0 && filteredKeys.every((key) => checkedKeys.includes(key));

  const toggleChecked = (key: string) => {
    setCheckedKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  };

  const toggleAll = () => {
    if (filteredKeys.length === 0) return;
    setCheckedKeys((prev) => {
      if (allChecked) {
        return prev.filter((key) => !filteredKeys.includes(key));
      }

      return Array.from(new Set([...prev, ...filteredKeys]));
    });
  };

  const restoreChecked = () => {
    if (checkedKeys.length === 0) return;
    showOsmBuildings(checkedKeys);
    setCheckedKeys([]);
  };

  const restoreAll = () => {
    if (hiddenCount === 0) return;
    if (!window.confirm('确定恢复所有已隐藏的白模建筑吗？')) return;
    clearHiddenOsmBuildings();
    setCheckedKeys([]);
  };

  const locateBuilding = (building: HiddenOsmBuilding) => {
    if (!Number.isFinite(building.latitude) || !Number.isFinite(building.longitude)) return;

    setBrowseState({
      centerWgs84: [building.latitude as number, building.longitude as number],
      zoom: Math.max(browseState.zoom, 18),
      headingDeg: browseState.headingDeg,
      pitchDeg: Math.max(browseState.pitchDeg, 55),
      targetElevation: building.targetElevation ?? browseState.targetElevation ?? 0,
      cameraRangeMeters: 420,
    }, 'ui');
  };

  return (
    <CommandPanel
      title="白模管理"
      subtitle="统计当前项目里被隐藏的 OSM 参考建筑，支持筛选、定位和批量恢复。"
      actions={<span className="command-shell__eyebrow">{hiddenCount} 栋已隐藏</span>}
      className="reference-buildings-panel"
    >
      {buildingStyle !== 'osm' && hiddenCount > 0 && (
        <CommandNotice tone="info">
          当前 OSM 白模未开启。列表仍会保留，再次切回 OSM 白模时会继续生效。
        </CommandNotice>
      )}

      {hiddenCount === 0 ? (
        <CommandEmptyState
          icon="location_city"
          title="还没有隐藏的白模"
          description="在 3D 地球视图点击一栋 OSM 白模建筑，即可弹出隐藏菜单。"
        />
      ) : (
        <div className="reference-buildings">
          <div className="reference-buildings__filters">
            <input
              type="search"
              className="reference-buildings__search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索名称、编号或类型"
            />
            <select
              className="reference-buildings__select"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="all">全部类型</option>
              {buildingTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="reference-buildings__toolbar">
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              disabled={filteredKeys.length === 0}
              onClick={toggleAll}
            >
              {allChecked ? '取消全选' : '全选当前'}
            </button>
            <button
              type="button"
              className="btn btn--sm btn--secondary"
              disabled={checkedCount === 0}
              onClick={restoreChecked}
            >
              恢复选中
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              disabled={hiddenCount === 0}
              onClick={restoreAll}
            >
              全部恢复
            </button>
          </div>

          <div className="reference-buildings__summary">
            <span>已勾选 {checkedCount} 栋</span>
            <span>显示 {filteredHiddenOsmBuildings.length} / {hiddenCount} 栋</span>
          </div>

          <div className="reference-buildings__list">
            {filteredHiddenOsmBuildings.length === 0 && (
              <CommandEmptyState
                icon="search"
                title="没有匹配结果"
                description="换个关键词，或者切换建筑类型筛选。"
              />
            )}

            {filteredHiddenOsmBuildings.map((building) => {
              const checked = checkedKeys.includes(building.key);
              const canLocate = Number.isFinite(building.latitude) && Number.isFinite(building.longitude);
              const buildingType = building.buildingType?.trim();
              return (
                <label key={building.key} className={`reference-buildings__item ${checked ? 'is-checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleChecked(building.key)}
                  />
                  <div className="reference-buildings__item-copy">
                    <strong>{getBuildingLabel(building)}</strong>
                    <span>
                      {building.elementType} #{building.elementId}
                      {buildingType ? ` · ${buildingType}` : ''}
                    </span>
                  </div>
                  <div className="reference-buildings__item-actions">
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      disabled={!canLocate}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        locateBuilding(building);
                      }}
                    >
                      定位
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        showOsmBuilding(building.key);
                      }}
                    >
                      恢复
                    </button>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </CommandPanel>
  );
}

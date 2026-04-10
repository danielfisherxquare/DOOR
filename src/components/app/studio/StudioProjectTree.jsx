import { isBuildingAnchored } from '../../../utils/studioProjectUtils'

const MODE_ITEMS = [
  { key: 'map', label: '地图', summary: '底图 / 图层 / 锚点' },
  { key: 'structure', label: '结构', summary: '建筑 / 楼层 / 仓库' },
  { key: 'assets', label: '资产', summary: '模板 / 模型 / 摆放' },
  { key: 'zones', label: '区域', summary: '分区 / 通道 / 禁入区' },
  { key: 'ops', label: '运营', summary: '绑定 / 状态 / 清单' },
]

export default function StudioProjectTree({
  project,
  snapshot,
  activeMode = 'map',
  activeBuildingId = null,
  activeLevelId = null,
  activeWarehouseId = null,
  onModeChange,
  onSelectBuilding,
  onSelectLevel,
  onSelectWarehouse,
  onBack,
}) {
  const siteName = snapshot?.site?.name || project?.name || '未命名项目'
  const projectType = project?.projectType || snapshot?.projectType || snapshot?.sceneType || 'warehouse'
  const buildings = Array.isArray(snapshot?.buildings) ? snapshot.buildings : []
  const projectTypeLabel = projectType === 'warehouse' ? '机构共享仓储空间' : '机构共享场地空间'

  return (
    <aside className="studio-shell__sidebar">
      <div className="studio-shell__sidebar-head">
        <div>
          <div className="studio-shell__eyebrow">空间工作台</div>
          <h2>{siteName}</h2>
          <p>{projectTypeLabel}</p>
        </div>
        <button type="button" className="studio-shell__ghost" onClick={onBack}>
          返回列表
        </button>
      </div>

      <div className="studio-shell__mode-list">
        {MODE_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`studio-shell__mode-btn ${activeMode === item.key ? 'is-active' : ''}`}
            onClick={() => onModeChange?.(item.key)}
          >
            <strong>{item.label}</strong>
            <span>{item.summary}</span>
          </button>
        ))}
      </div>

      <div className="studio-shell__tree">
        <div className="studio-shell__tree-section">
          <div className="studio-shell__tree-title">项目根节点</div>
          <div className="studio-shell__tree-item is-root">{siteName}</div>
        </div>

        <div className="studio-shell__tree-section">
          <div className="studio-shell__tree-title">空间结构</div>
          {buildings.length === 0 ? (
            <div className="studio-shell__tree-empty">还没有建筑节点</div>
          ) : (
            buildings.map((building) => (
              <div key={building.id} className="studio-shell__tree-branch">
                <button
                  type="button"
                  className={`studio-shell__tree-item ${activeBuildingId === building.id ? 'is-active' : ''}`}
                  onClick={() => onSelectBuilding?.(building.id)}
                >
                  <strong>{isBuildingAnchored(building) ? '📍' : '⚠️'} {building.name || building.id}</strong>
                  <span>{building.address || '未设置地址'}</span>
                </button>
                {(building.levels || []).map((level) => (
                  <div key={level.id} className="studio-shell__tree-children">
                    <button
                      type="button"
                      className={`studio-shell__tree-item studio-shell__tree-item--nested ${activeLevelId === level.id ? 'is-active' : ''}`}
                      onClick={() => onSelectLevel?.(building.id, level.id)}
                    >
                      <strong>{level.name || level.id}</strong>
                      <span>标高 {level.elevation || 0}m · 层高 {level.height || 0}m</span>
                    </button>
                    {(level.warehouses || []).map((warehouse) => (
                      <button
                        key={warehouse.id}
                        type="button"
                        className={`studio-shell__tree-item studio-shell__tree-item--leaf ${activeWarehouseId === warehouse.id ? 'is-active' : ''}`}
                        onClick={() => onSelectWarehouse?.(building.id, level.id, warehouse.id)}
                      >
                        <strong>{warehouse.name || warehouse.id}</strong>
                        <span>{warehouse.code || '未设编码'} · {(warehouse.sceneSnapshot?.assetPlacements || []).length} 个资产</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  )
}

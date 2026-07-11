import { useEffect, useMemo, useState } from 'react'
import studioProjectApi from '../../../services/studioProjectApi'
import { isBuildingAnchored } from '../../../utils/studioProjectUtils'
import { showError, showSuccess } from '../../../utils/toast'

function defaultBuildingForm() {
  return {
    name: '未命名建筑',
    address: '',
    widthMeters: '36',
    depthMeters: '24',
    headingDeg: '0',
    floorCount: '3',
    floorHeight: '4.5',
  }
}

function defaultLevelForm() {
  return {
    name: '',
    height: '4.5',
  }
}

function defaultWarehouseForm() {
  return {
    name: '',
    code: '',
  }
}

export default function StudioStructurePanel({
  projectId,
  orgId,
  project,
  snapshot,
  hierarchy,
  ensureProjectExists,
  onProjectUpdated,
  onSelectBuilding,
  onSelectLevel,
  onSelectWarehouse,
  onPlaceBuilding,
}) {
  const [buildingForm, setBuildingForm] = useState(defaultBuildingForm)
  const [levelForm, setLevelForm] = useState(defaultLevelForm)
  const [warehouseForm, setWarehouseForm] = useState(defaultWarehouseForm)
  const [raceForm, setRaceForm] = useState({ raceId: '', bindCurrentWarehouseOnly: true })
  const [races, setRaces] = useState([])
  const [busy, setBusy] = useState(false)

  const activeBuilding = hierarchy?.activeBuilding || null
  const activeLevel = hierarchy?.activeLevel || null
  const activeWarehouse = hierarchy?.activeWarehouse || null
  const raceBindings = useMemo(
    () => Array.isArray(snapshot?.raceBindings) ? snapshot.raceBindings : [],
    [snapshot?.raceBindings],
  )
  const buildingCount = Array.isArray(snapshot?.buildings) ? snapshot.buildings.length : 0
  const levelCount = (snapshot?.buildings || []).reduce((sum, building) => sum + (building.levels?.length || 0), 0)
  const warehouseCount = (snapshot?.buildings || []).reduce(
    (sum, building) => sum + (building.levels || []).reduce((levelSum, level) => levelSum + (level.warehouses?.length || 0), 0),
    0,
  )

  useEffect(() => {
    if (!orgId) return
    studioProjectApi.listRaces(orgId).then((result) => {
      setRaces(result.data || [])
    }).catch((error) => {
      showError(`加载赛事列表失败：${error.message}`)
    })
  }, [orgId])

  useEffect(() => {
    if (!activeBuilding) return
    setBuildingForm({
      name: activeBuilding.name || '未命名建筑',
      address: activeBuilding.address || '',
      widthMeters: String(activeBuilding.dimensionsMeters?.width ?? 36),
      depthMeters: String(activeBuilding.dimensionsMeters?.depth ?? 24),
      headingDeg: String(activeBuilding.headingDeg ?? 0),
      floorCount: String(activeBuilding.levels?.length || 1),
      floorHeight: String(activeBuilding.levels?.[0]?.height ?? 4.5),
    })
  }, [activeBuilding])

  useEffect(() => {
    if (!activeLevel) return
    setLevelForm({
      name: activeLevel.name || '',
      height: String(activeLevel.height ?? 4.5),
    })
  }, [activeLevel])

  useEffect(() => {
    if (!activeWarehouse) return
    setWarehouseForm({
      name: activeWarehouse.name || '',
      code: activeWarehouse.code || '',
    })
  }, [activeWarehouse])

  const activeBuildingBindings = useMemo(
    () => raceBindings.filter((binding) => binding.buildingId === activeBuilding?.id),
    [activeBuilding?.id, raceBindings],
  )

  async function withProject(action) {
    setBusy(true)
    try {
      const persistedProject = projectId ? { id: projectId } : await ensureProjectExists?.()
      if (!persistedProject?.id) return null
      return await action(persistedProject.id)
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateBuilding() {
    try {
      const result = await withProject((currentProjectId) => studioProjectApi.createBuilding(currentProjectId, {
        ...buildingForm,
      }, orgId))
      if (!result) return
      onProjectUpdated?.(result.data)
      showSuccess('建筑已创建')
    } catch (error) {
      showError(`创建建筑失败：${error.message}`)
    }
  }

  async function handleUpdateBuilding() {
    if (!activeBuilding) return
    try {
      const result = await withProject((currentProjectId) => studioProjectApi.updateBuilding(currentProjectId, activeBuilding.id, {
        ...buildingForm,
      }, orgId))
      if (!result) return
      onProjectUpdated?.(result.data)
      showSuccess('建筑已更新')
    } catch (error) {
      showError(`更新建筑失败：${error.message}`)
    }
  }

  async function handleCreateLevel() {
    if (!activeBuilding) return
    try {
      const result = await withProject((currentProjectId) => studioProjectApi.createLevel(currentProjectId, activeBuilding.id, {
        ...levelForm,
      }, orgId))
      if (!result) return
      onProjectUpdated?.(result.data)
      showSuccess('楼层已创建')
    } catch (error) {
      showError(`创建楼层失败：${error.message}`)
    }
  }

  async function handleUpdateLevel() {
    if (!activeBuilding || !activeLevel) return
    try {
      const result = await withProject((currentProjectId) => studioProjectApi.updateLevel(currentProjectId, activeBuilding.id, activeLevel.id, {
        ...levelForm,
      }, orgId))
      if (!result) return
      onProjectUpdated?.(result.data)
      showSuccess('楼层已更新')
    } catch (error) {
      showError(`更新楼层失败：${error.message}`)
    }
  }

  async function handleCreateWarehouse() {
    if (!activeBuilding || !activeLevel) return
    try {
      const result = await withProject((currentProjectId) => studioProjectApi.createWarehouse(currentProjectId, activeBuilding.id, activeLevel.id, {
        ...warehouseForm,
      }, orgId))
      if (!result) return
      onProjectUpdated?.(result.data)
      showSuccess('仓库已创建')
    } catch (error) {
      showError(`创建仓库失败：${error.message}`)
    }
  }

  async function handleUpdateWarehouse() {
    if (!activeWarehouse) return
    try {
      const result = await withProject((currentProjectId) => studioProjectApi.updateWarehouse(currentProjectId, activeWarehouse.id, {
        ...warehouseForm,
      }, orgId))
      if (!result) return
      onProjectUpdated?.(result.data)
      showSuccess('仓库已更新')
    } catch (error) {
      showError(`更新仓库失败：${error.message}`)
    }
  }

  async function handleBindRace() {
    if (!activeBuilding || !raceForm.raceId) return
    try {
      const persistedProject = projectId ? { id: projectId } : await ensureProjectExists?.()
      const persistedProjectId = persistedProject?.id || project?.id
      if (!persistedProjectId) return
      setBusy(true)
      await studioProjectApi.createRaceBinding(persistedProjectId, {
        raceId: Number(raceForm.raceId),
        buildingId: activeBuilding.id,
        warehouseIds: raceForm.bindCurrentWarehouseOnly && activeWarehouse ? [activeWarehouse.id] : [],
        mode: 'reference',
        status: 'active',
      }, orgId)
      const refreshed = await studioProjectApi.getProject(persistedProjectId, orgId)
      onProjectUpdated?.(refreshed.data)
      showSuccess('赛事绑定已更新')
    } catch (error) {
      showError(`绑定赛事失败：${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  function renderLevelList() {
    const levels = activeBuilding?.levels || []
    if (levels.length === 0) {
      return <div className="studio-shell__tree-empty">先创建建筑，再创建楼层。</div>
    }
    return (
      <div className="studio-structure__list">
        {levels.map((level) => (
          <button
            key={level.id}
            type="button"
            className={`studio-structure__item ${activeLevel?.id === level.id ? 'is-active' : ''}`}
            onClick={() => onSelectLevel?.(activeBuilding.id, level.id)}
          >
            <strong>{level.name}</strong>
            <span>标高 {level.elevation}m · 层高 {level.height}m</span>
            <em>{level.warehouses?.length || 0} 个仓库</em>
          </button>
        ))}
      </div>
    )
  }

  function renderWarehouseList() {
    const warehouses = activeLevel?.warehouses || []
    if (warehouses.length === 0) {
      return <div className="studio-shell__tree-empty">这个楼层还没有仓库，先创建一个仓库节点。</div>
    }
    return (
      <div className="studio-structure__list">
        {warehouses.map((warehouse) => (
          <button
            key={warehouse.id}
            type="button"
            className={`studio-structure__item ${activeWarehouse?.id === warehouse.id ? 'is-active' : ''}`}
            onClick={() => onSelectWarehouse?.(activeBuilding.id, activeLevel.id, warehouse.id)}
          >
            <strong>{warehouse.name}</strong>
            <span>{warehouse.code || '未设编码'} · {warehouse.sceneType === 'outdoor-event' ? '赛事空间' : '仓储空间'}</span>
            <em>{warehouse.sceneSnapshot?.assetPlacements?.length || 0} 个资产实例</em>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="studio-structure">
      <section className="studio-structure__hero">
        <div>
          <div className="studio-shell__eyebrow">结构模式</div>
          <h3>先定义建筑层级，再把仓储空间锚定到具体楼层</h3>
          <p>这里负责建筑地址、楼层结构和仓库节点。地图会使用这些结构做宏观定位，3D 画布则继续细化仓库内部布局。</p>
        </div>
        <div className="studio-ops__summary">
          <article><span>建筑</span><strong>{buildingCount}</strong></article>
          <article><span>楼层</span><strong>{levelCount}</strong></article>
          <article><span>仓库</span><strong>{warehouseCount}</strong></article>
        </div>
      </section>

      <section className="studio-structure__grid">
        <div className="studio-structure__card">
          <div className="studio-ops__list-head">建筑</div>
          {activeBuilding && (
            <div className="studio-structure__pill-row">
              {snapshot?.buildings?.map((building) => (
                <button
                  key={building.id}
                  type="button"
                  className={`studio-structure__pill ${activeBuilding.id === building.id ? 'is-active' : ''}`}
                  onClick={() => onSelectBuilding?.(building.id)}
                >
                  {isBuildingAnchored(building) ? '📍' : '⚠️'} {building.name}
                </button>
              ))}
            </div>
          )}
          <label className="studio-ops__field"><span>建筑名称</span><input value={buildingForm.name} onChange={(e) => setBuildingForm((current) => ({ ...current, name: e.target.value }))} /></label>
          <label className="studio-ops__field"><span>地址</span><input value={buildingForm.address} onChange={(e) => setBuildingForm((current) => ({ ...current, address: e.target.value }))} /></label>
          {activeBuilding && (
            <div className="studio-structure__anchor-status">
              {isBuildingAnchored(activeBuilding) ? (
                <>
                  <div className="studio-structure__anchor-badge is-anchored">
                    <span className="material-symbols-outlined">location_on</span>
                    <span>已定位 · {activeBuilding.geoAnchor.latitude.toFixed(6)}, {activeBuilding.geoAnchor.longitude.toFixed(6)}</span>
                  </div>
                  <button type="button" className="studio-shell__ghost" onClick={() => onPlaceBuilding?.(activeBuilding.id)}>重新定位</button>
                </>
              ) : (
                <>
                  <div className="studio-structure__anchor-badge is-unanchored">
                    <span className="material-symbols-outlined">location_off</span>
                    <span>未定位 · 此建筑尚未放置到地图</span>
                  </div>
                  <button type="button" className="studio-shell__primary" onClick={() => onPlaceBuilding?.(activeBuilding.id)}>📍 在地图上放置</button>
                </>
              )}
            </div>
          )}
          <div className="studio-structure__inline">
            <label className="studio-ops__field"><span>宽度 m</span><input value={buildingForm.widthMeters} onChange={(e) => setBuildingForm((current) => ({ ...current, widthMeters: e.target.value }))} /></label>
            <label className="studio-ops__field"><span>进深 m</span><input value={buildingForm.depthMeters} onChange={(e) => setBuildingForm((current) => ({ ...current, depthMeters: e.target.value }))} /></label>
          </div>
          <div className="studio-structure__inline">
            <label className="studio-ops__field"><span>朝向</span><input value={buildingForm.headingDeg} onChange={(e) => setBuildingForm((current) => ({ ...current, headingDeg: e.target.value }))} /></label>
            <label className="studio-ops__field"><span>楼层数</span><input value={buildingForm.floorCount} onChange={(e) => setBuildingForm((current) => ({ ...current, floorCount: e.target.value }))} /></label>
            <label className="studio-ops__field"><span>层高 m</span><input value={buildingForm.floorHeight} onChange={(e) => setBuildingForm((current) => ({ ...current, floorHeight: e.target.value }))} /></label>
          </div>
          <div className="studio-structure__actions">
            <button type="button" className="studio-shell__primary" onClick={handleCreateBuilding} disabled={busy}>新建建筑</button>
            {activeBuilding && <button type="button" className="studio-shell__ghost" onClick={handleUpdateBuilding} disabled={busy}>更新建筑</button>}
          </div>
        </div>

        <div className="studio-structure__card">
          <div className="studio-ops__list-head">楼层</div>
          {renderLevelList()}
          {activeBuilding && (
            <>
              <label className="studio-ops__field"><span>楼层名称</span><input value={levelForm.name} onChange={(e) => setLevelForm((current) => ({ ...current, name: e.target.value }))} placeholder="例如 二层 / 地下一层" /></label>
              <label className="studio-ops__field"><span>层高 m</span><input value={levelForm.height} onChange={(e) => setLevelForm((current) => ({ ...current, height: e.target.value }))} /></label>
              <div className="studio-structure__actions">
                <button type="button" className="studio-shell__primary" onClick={handleCreateLevel} disabled={busy}>新增楼层</button>
                {activeLevel && <button type="button" className="studio-shell__ghost" onClick={handleUpdateLevel} disabled={busy}>更新楼层</button>}
              </div>
            </>
          )}
        </div>

        <div className="studio-structure__card">
          <div className="studio-ops__list-head">仓库</div>
          {renderWarehouseList()}
          {activeLevel && (
            <>
              <label className="studio-ops__field"><span>仓库名称</span><input value={warehouseForm.name} onChange={(e) => setWarehouseForm((current) => ({ ...current, name: e.target.value }))} placeholder="例如 主仓 / 赛事仓" /></label>
              <label className="studio-ops__field"><span>仓库编码</span><input value={warehouseForm.code} onChange={(e) => setWarehouseForm((current) => ({ ...current, code: e.target.value }))} placeholder="例如 WH-A1" /></label>
              <div className="studio-structure__actions">
                <button type="button" className="studio-shell__primary" onClick={handleCreateWarehouse} disabled={busy}>新增仓库</button>
                {activeWarehouse && <button type="button" className="studio-shell__ghost" onClick={handleUpdateWarehouse} disabled={busy}>更新仓库</button>}
              </div>
            </>
          )}
        </div>

        <div className="studio-structure__card">
          <div className="studio-ops__list-head">赛事绑定</div>
          {!activeBuilding ? (
            <div className="studio-shell__tree-empty">选择一个建筑后，可以把整栋建筑或当前仓库引用到赛事。</div>
          ) : (
            <>
              <label className="studio-ops__field">
                <span>赛事</span>
                <select value={raceForm.raceId} onChange={(e) => setRaceForm((current) => ({ ...current, raceId: e.target.value }))}>
                  <option value="">选择赛事</option>
                  {races.map((race) => <option key={race.id} value={race.id}>{race.name || race.id}</option>)}
                </select>
              </label>
              <label className="studio-structure__checkbox">
                <input
                  type="checkbox"
                  checked={raceForm.bindCurrentWarehouseOnly}
                  onChange={(e) => setRaceForm((current) => ({ ...current, bindCurrentWarehouseOnly: e.target.checked }))}
                />
                <span>只绑定当前仓库；关闭后表示整栋建筑引用给赛事</span>
              </label>
              <button type="button" className="studio-shell__primary" onClick={handleBindRace} disabled={busy || !raceForm.raceId}>
                绑定到赛事
              </button>
              <div className="studio-structure__binding-list">
                {activeBuildingBindings.length === 0 ? (
                  <div className="studio-shell__tree-empty">当前建筑还没有赛事引用。</div>
                ) : activeBuildingBindings.map((binding) => (
                  <div key={binding.id} className="studio-structure__binding-item">
                    <strong>赛事 #{binding.raceId}</strong>
                    <span>{binding.warehouseIds?.length ? `绑定 ${binding.warehouseIds.length} 个仓库` : '整栋建筑引用'}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

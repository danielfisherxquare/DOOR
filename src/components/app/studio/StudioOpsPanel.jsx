import { useEffect, useMemo, useState } from 'react'
import studioProjectApi from '../../../services/studioProjectApi'
import { showError, showSuccess } from '../../../utils/toast'

const STATUS_OPTIONS = [
  { value: 'in-stock', label: '在库' },
  { value: 'reserved', label: '预留' },
  { value: 'deployed', label: '已部署' },
  { value: 'returned', label: '已返仓' },
]

function getPlacementTypeLabel(type) {
  if (type === 'rack') return '货架'
  if (type === 'prefab') return '预制件'
  if (type === 'model') return '模型'
  return '资产'
}

export default function StudioOpsPanel({
  projectId,
  orgId,
  warehouse,
  warehouseScene,
  onPlacementUpdated,
}) {
  const [selectedPlacementId, setSelectedPlacementId] = useState('')
  const [units, setUnits] = useState([])
  const [locations, setLocations] = useState([])
  const [binding, setBinding] = useState({
    inventoryAssetId: '',
    warehouseLocationId: '',
    status: 'reserved',
    note: '',
  })

  const placements = useMemo(
    () => Array.isArray(warehouseScene?.assetPlacements) ? warehouseScene.assetPlacements : [],
    [warehouseScene?.assetPlacements],
  )
  const selectedPlacement = placements.find((item) => item.id === selectedPlacementId) || null

  useEffect(() => {
    if (!orgId) return
    Promise.all([
      studioProjectApi.listInventoryUnits({ limit: 120 }, orgId),
      studioProjectApi.listWarehouseLocations({}, orgId),
    ]).then(([unitRes, locationRes]) => {
      setUnits(unitRes.data || [])
      setLocations(locationRes.data || [])
    }).catch((error) => {
      showError(`加载运营绑定数据失败：${error.message}`)
    })
  }, [orgId])

  useEffect(() => {
    if (!selectedPlacement) {
      setBinding({
        inventoryAssetId: '',
        warehouseLocationId: '',
        status: 'reserved',
        note: '',
      })
      return
    }
    setBinding({
      inventoryAssetId: selectedPlacement.inventoryAssetId ? String(selectedPlacement.inventoryAssetId) : '',
      warehouseLocationId: selectedPlacement.warehouseLocationId ? String(selectedPlacement.warehouseLocationId) : '',
      status: selectedPlacement.status || 'reserved',
      note: selectedPlacement.metadata?.note || '',
    })
  }, [selectedPlacement])

  async function handleBind() {
    if (!selectedPlacementId || !projectId || !warehouse?.id) return
    try {
      const result = await studioProjectApi.bindInventoryToPlacement(selectedPlacementId, {
        projectId,
        warehouseId: warehouse.id,
        inventoryAssetId: binding.inventoryAssetId || null,
        warehouseLocationId: binding.warehouseLocationId || null,
        status: binding.status,
        note: binding.note,
      }, orgId)
      onPlacementUpdated?.(result.data)
      showSuccess('资产实例已更新')
    } catch (error) {
      showError(`更新资产实例失败：${error.message}`)
    }
  }

  return (
    <div className="studio-ops">
      <section className="studio-ops__overview">
        <div>
          <div className="studio-shell__eyebrow">运营模式</div>
          <h3>{warehouse?.name || '当前仓库'} 的运营绑定</h3>
          <p>把仓库内部的资产实例映射到真实物资、库位与状态流转，让这套空间配置真正具备执行语义。</p>
        </div>
        <div className="studio-ops__summary">
          <article><span>资产实例</span><strong>{placements.length}</strong></article>
          <article><span>物资单元</span><strong>{units.length}</strong></article>
          <article><span>库位</span><strong>{locations.length}</strong></article>
        </div>
      </section>

      <section className="studio-ops__grid">
        <div className="studio-ops__list">
          <div className="studio-ops__list-head">资产实例</div>
          {placements.length === 0 ? (
            <div className="studio-shell__tree-empty">先去资产或区域模式放置对象，再回到这里做运营绑定。</div>
          ) : placements.map((placement) => (
            <button
              key={placement.id}
              type="button"
              className={`studio-ops__placement ${selectedPlacementId === placement.id ? 'is-active' : ''}`}
              onClick={() => setSelectedPlacementId(placement.id)}
            >
              <strong>{placement.metadata?.name || placement.id}</strong>
              <span>{getPlacementTypeLabel(placement.placementType)}</span>
              <em>{STATUS_OPTIONS.find((item) => item.value === (placement.status || 'reserved'))?.label || '预留'}</em>
            </button>
          ))}
        </div>

        <div className="studio-ops__editor">
          <div className="studio-ops__list-head">运营绑定</div>
          {!selectedPlacement ? (
            <div className="studio-shell__tree-empty">选择一个资产实例开始绑定</div>
          ) : (
            <>
              <div className="studio-ops__card">
                <h4>{selectedPlacement.metadata?.name || selectedPlacement.id}</h4>
                <p>{getPlacementTypeLabel(selectedPlacement.placementType)} · {warehouse?.name || '未指定仓库'}</p>
              </div>

              <label className="studio-ops__field">
                <span>状态</span>
                <select value={binding.status} onChange={(e) => setBinding((current) => ({ ...current, status: e.target.value }))}>
                  {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>

              <label className="studio-ops__field">
                <span>绑定物资</span>
                <select value={binding.inventoryAssetId} onChange={(e) => setBinding((current) => ({ ...current, inventoryAssetId: e.target.value }))}>
                  <option value="">不绑定</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      #{unit.id} · {unit.item_type || unit.itemType || 'asset'} · {unit.status}
                    </option>
                  ))}
                </select>
              </label>

              <label className="studio-ops__field">
                <span>绑定库位</span>
                <select value={binding.warehouseLocationId} onChange={(e) => setBinding((current) => ({ ...current, warehouseLocationId: e.target.value }))}>
                  <option value="">不绑定</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      #{location.id} · {location.code || location.name || 'location'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="studio-ops__field">
                <span>备注</span>
                <textarea
                  rows="4"
                  value={binding.note}
                  onChange={(e) => setBinding((current) => ({ ...current, note: e.target.value }))}
                  placeholder="记录部署要求、返仓说明或现场备注"
                />
              </label>

              <button type="button" className="studio-shell__primary" onClick={handleBind}>
                保存运营绑定
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

import { useMemo, useState } from 'react'
import useEditor, { TOOL_TYPES } from '../store/useEditor'
import useModelingDocument from '../store/useModelingDocument'
import { deriveWallOpeningHost, extrudeProfileInDocument, getSketchPlaneById, normalizeEditorDocument } from '../model/editorDocument'

function Field({ label, children }) {
  return (
    <label className="pi-field">
      <span className="pi-field__label">{label}</span>
      {children}
    </label>
  )
}

export default function PropertyInspector() {
  const inspectorOpen = useEditor((state) => state.inspectorOpen)
  const selectedGeometry = useEditor((state) => state.selectedGeometry)
  const setDirty = useEditor((state) => state.setDirty)
  const openingPlacement = useEditor((state) => state.openingPlacement)
  const startOpeningPlacement = useEditor((state) => state.startOpeningPlacement)
  const clearOpeningPlacement = useEditor((state) => state.clearOpeningPlacement)
  const setTool = useEditor((state) => state.setTool)
  const document = useModelingDocument((state) => state.document)
  const replaceDocument = useModelingDocument((state) => state.replaceDocument)
  const addOpening = useModelingDocument((state) => state.addOpening)
  const updateOpening = useModelingDocument((state) => state.updateOpening)
  const removeOpening = useModelingDocument((state) => state.removeOpening)
  const createSweepSurface = useModelingDocument((state) => state.createSweepSurface)
  const createLoftSurface = useModelingDocument((state) => state.createLoftSurface)
  const normalized = useMemo(() => normalizeEditorDocument(document), [document])

  const profile = selectedGeometry?.meta?.entityType === 'profile'
    ? normalized.profiles.find((item) => item.id === selectedGeometry.entityId)
    : selectedGeometry?.meta?.profileId
      ? normalized.profiles.find((item) => item.id === selectedGeometry.meta.profileId)
      : null
  const solid = selectedGeometry?.meta?.entityType === 'solid'
    ? normalized.solids.find((item) => item.id === selectedGeometry.entityId)
    : selectedGeometry?.meta?.solidId
      ? normalized.solids.find((item) => item.id === selectedGeometry.meta.solidId)
      : null
  const opening = selectedGeometry?.meta?.entityType === 'opening'
    ? normalized.openings.find((item) => item.id === (selectedGeometry.meta?.openingId || selectedGeometry.entityId))
    : null
  const segment = selectedGeometry?.meta?.entityType === 'segment'
    ? normalized.segments.find((item) => item.id === selectedGeometry.entityId)
    : selectedGeometry?.meta?.segmentId
      ? normalized.segments.find((item) => item.id === selectedGeometry.meta.segmentId)
      : null
  const surface = selectedGeometry?.meta?.entityType === 'surface'
    ? normalized.surfaces.find((item) => item.id === (selectedGeometry.meta?.surfaceId || selectedGeometry.entityId))
    : null
  const selectedItems = selectedGeometry?.meta?.entityType === 'multi'
    ? selectedGeometry.meta.items || []
    : selectedGeometry ? [selectedGeometry] : []
  const selectedProfileIds = [...new Set(selectedItems.map((item) => item.meta?.profileId || (item.meta?.entityType === 'profile' ? item.entityId : null)).filter(Boolean))]
  const selectedSegmentIds = [...new Set(selectedItems.filter((item) => item.meta?.entityType === 'segment').map((item) => item.entityId))]
  const profilePlane = profile ? getSketchPlaneById(normalized, profile.planeId || 'plane-ground') : null
  const wallHost = solid ? deriveWallOpeningHost(normalized, solid.id) : null
  const solidOpenings = useMemo(
    () => (solid ? normalized.openings.filter((opening) => opening.solidId === solid.id) : []),
    [normalized.openings, solid],
  )

  const [draftName, setDraftName] = useState('')
  const placementForSelectedSolid = openingPlacement?.solidId && solid?.id === openingPlacement.solidId ? openingPlacement : null
  const canPlaceOnSideFace = selectedGeometry?.meta?.entityType === 'solid-face' && selectedGeometry?.meta?.faceKind === 'side'

  if (!inspectorOpen) return null

  const updateProfileName = (name) => {
    const nextDocument = {
      ...normalized,
      profiles: normalized.profiles.map((item) => (item.id === profile.id ? { ...item, name } : item)),
    }
    replaceDocument(nextDocument, { historyLabel: '修改轮廓名称' })
    setDirty(true)
  }

  const updateSolidHeight = (height) => {
    if (!profile) return
    replaceDocument(extrudeProfileInDocument(normalized, profile.id, height), { historyLabel: '修改实体高度' })
    setDirty(true)
  }

  const updateOpeningField = (patch, historyLabel) => {
    if (!opening) return
    const result = updateOpening(opening.id, {
      ...patch,
      historyLabel,
      source: 'inspector',
    })
    if (!result?.error) setDirty(true)
  }

  const handleAddOpening = (type) => {
    if (!solid) return
    if (canPlaceOnSideFace) {
      if (placementForSelectedSolid?.type === type) {
        clearOpeningPlacement()
        return
      }
      startOpeningPlacement({
        type,
        solidId: solid.id,
        faceNormal: selectedGeometry?.meta?.normal || null,
        facePoint: selectedGeometry?.meta?.hitPoint || null,
      })
      setTool(TOOL_TYPES.SELECT)
      return
    }
    const result = addOpening(solid.id, {
      type,
      point: selectedGeometry?.meta?.hitPoint,
      source: selectedGeometry?.meta?.faceKind === 'side' ? 'side-face' : 'inspector',
      historyLabel: type === 'door' ? '新增门洞' : '新增窗洞',
    })
    if (!result?.error) setDirty(true)
  }

  const handleCreateSweep = () => {
    const profileId = selectedProfileIds[0] || normalized.profiles[0]?.id
    const pathSegmentIds = selectedSegmentIds.length ? selectedSegmentIds : segment ? [segment.id] : []
    if (!profileId || !pathSegmentIds.length) return
    const result = createSweepSurface(profileId, pathSegmentIds, { historyLabel: '扫掠曲面' })
    if (!result?.error) setDirty(true)
  }

  const handleCreateLoft = () => {
    const profileIds = selectedProfileIds.length >= 2 ? selectedProfileIds : normalized.profiles.slice(0, 2).map((item) => item.id)
    if (profileIds.length < 2) return
    const result = createLoftSurface(profileIds, { historyLabel: '放样曲面' })
    if (!result?.error) setDirty(true)
  }

  return (
    <aside className="property-inspector">
      <div className="property-inspector__header">
        <strong>属性</strong>
        <span>{selectedGeometry?.label || '未选择'}</span>
      </div>

      {!selectedGeometry ? (
        <div className="property-inspector__empty">选择顶点、边、面或实体后可直接编辑。</div>
      ) : (
        <div className="property-inspector__body">
          <Field label="选择类型">
            <span className="pi-field__readonly">{selectedGeometry.kind}</span>
          </Field>

          {profile ? (
            <>
              <Field label="轮廓名称">
                <input
                  className="pi-input"
                  defaultValue={draftName || profile.name}
                  onBlur={(event) => updateProfileName(event.target.value)}
                  onChange={(event) => setDraftName(event.target.value)}
                  type="text"
                />
              </Field>
              <Field label="顶点数">
                <span className="pi-field__readonly">{profile.vertexIds.length}</span>
              </Field>
              <Field label="草图平面">
                <span className="pi-field__readonly">{profilePlane?.name || 'Ground'}</span>
              </Field>
              {profile.metadata?.autoCreatedFromWallBoundary ? (
                <Field label="生成来源">
                  <span className="pi-field__readonly">墙体边界自动切面</span>
                </Field>
              ) : null}
            </>
          ) : null}

          {solid ? (
            <>
              <Field label="高度">
                <input
                  className="pi-input"
                  defaultValue={solid.height}
                  min="0.1"
                  onBlur={(event) => updateSolidHeight(Number(event.target.value))}
                  step="0.1"
                  type="number"
                />
              </Field>
              <Field label="基底标高">
                <span className="pi-field__readonly">{solid.baseElevation}</span>
              </Field>
              {wallHost ? (
                <>
                  {opening ? (
                    <>
                      <Field label="开洞类型">
                        <span className="pi-field__readonly">{opening.type === 'door' ? '门洞' : '窗洞'}</span>
                      </Field>
                      <Field label="宽度">
                        <input
                          className="pi-input"
                          defaultValue={opening.width}
                          min="0.2"
                          onBlur={(event) => updateOpeningField({ width: Number(event.target.value) }, '调整开洞宽度')}
                          step="0.1"
                          type="number"
                        />
                      </Field>
                      <Field label="高度">
                        <input
                          className="pi-input"
                          defaultValue={opening.height}
                          min="0.2"
                          onBlur={(event) => updateOpeningField({ height: Number(event.target.value) }, '调整开洞高度')}
                          step="0.1"
                          type="number"
                        />
                      </Field>
                      <Field label="标高">
                        <input
                          className="pi-input"
                          defaultValue={opening.elevation}
                          min="0"
                          onBlur={(event) => updateOpeningField({ elevation: Number(event.target.value) }, '调整开洞标高')}
                          step="0.1"
                          type="number"
                        />
                      </Field>
                      <Field label="沿墙位置">
                        <span className="pi-field__readonly">{opening.offset}m / {wallHost.length}m</span>
                      </Field>
                      <div className="pi-opening-actions">
                        <button className="studio-link-btn" onClick={() => { removeOpening(opening.id); setDirty(true) }} type="button">
                          删除开洞
                        </button>
                      </div>
                    </>
                  ) : null}
                  <Field label="开洞能力">
                    <span className="pi-field__readonly">
                      {canPlaceOnSideFace ? '当前侧面支持直接预落位开洞' : '支持门窗开洞'}
                    </span>
                  </Field>
                  {placementForSelectedSolid ? (
                    <div className="pi-placement-banner">
                      <strong>{placementForSelectedSolid.type === 'door' ? '门洞放置中' : '窗洞放置中'}</strong>
                      <span>移动鼠标预览，单击侧面落位，按 Esc 取消。</span>
                    </div>
                  ) : null}
                  <div className="pi-opening-actions">
                    <button className="studio-link-btn" onClick={() => handleAddOpening('door')} type="button">
                      {placementForSelectedSolid?.type === 'door' ? '取消门洞' : canPlaceOnSideFace ? '放置门洞' : '新增门洞'}
                    </button>
                    <button className="studio-link-btn" onClick={() => handleAddOpening('window')} type="button">
                      {placementForSelectedSolid?.type === 'window' ? '取消窗洞' : canPlaceOnSideFace ? '放置窗洞' : '新增窗洞'}
                    </button>
                  </div>
                  {!opening && solidOpenings.length ? (
                    <div className="pi-opening-list">
                      {solidOpenings.map((opening) => (
                        <div className="pi-opening-item" key={opening.id}>
                          <div>
                            <strong>{opening.type === 'door' ? '门洞' : '窗洞'}</strong>
                            <div>{opening.width}m × {opening.height}m · 标高 {opening.elevation}m</div>
                          </div>
                          <button className="studio-link-btn" onClick={() => { removeOpening(opening.id); setDirty(true) }} type="button">
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="property-inspector__empty">当前墙面还没有门窗开洞。</div>
                  )}
                </>
              ) : null}
            </>
          ) : null}

          {segment ? (
            <>
              <Field label="边类型">
                <span className="pi-field__readonly">{segment.kind === 'arc' ? '圆弧' : segment.kind === 'bezier' ? '贝塞尔曲线' : '直线'}</span>
              </Field>
              {segment.kind !== 'line' ? (
                <Field label="曲线控制">
                  <span className="pi-field__readonly">选中曲线后可拖动黄色端点和蓝色控制点。</span>
                </Field>
              ) : null}
              <div className="pi-opening-actions">
                <button className="studio-link-btn" onClick={handleCreateSweep} type="button">用此路径 Sweep</button>
              </div>
            </>
          ) : null}

          {surface ? (
            <>
              <Field label="曲面类型">
                <span className="pi-field__readonly">{surface.kind === 'loft' ? 'Loft 放样' : 'Sweep 扫掠'}</span>
              </Field>
              <Field label="曲面输入">
                <span className="pi-field__readonly">{surface.profileIds.length} 截面 · {surface.pathSegmentIds.length} 路径</span>
              </Field>
            </>
          ) : null}

          {selectedProfileIds.length >= 2 ? (
            <div className="pi-opening-actions">
              <button className="studio-link-btn" onClick={handleCreateLoft} type="button">用所选截面 Loft</button>
            </div>
          ) : null}
        </div>
      )}
    </aside>
  )
}

import useEditor from '../store/useEditor'
import useModelingDocument from '../store/useModelingDocument'
import { normalizeEditorDocument } from '../model/editorDocument'

function selectedItems(selection) {
  if (!selection) return []
  if (selection.meta?.entityType === 'multi') return selection.meta.items || []
  return [selection]
}

function mergeSelection(currentSelection, nextItem, additive) {
  if (!additive) return nextItem
  const existing = selectedItems(currentSelection)
  const exists = existing.some((item) => item.entityId === nextItem.entityId)
  const items = exists
    ? existing.filter((item) => item.entityId !== nextItem.entityId)
    : [...existing, nextItem]
  if (!items.length) return null
  if (items.length === 1) return items[0]
  return {
    kind: 'multi',
    entityId: 'multi-selection',
    label: `${items.length} 个对象`,
    meta: {
      entityType: 'multi',
      items,
    },
  }
}

function TreeItem({ icon, item, selectedGeometry, setSelectedGeometry }) {
  const selected = selectedItems(selectedGeometry).some((selectedItem) => selectedItem.entityId === item.entityId)
  return (
    <button
      className={`scene-tree-panel__item ${selected ? 'is-active' : ''}`}
      onClick={(event) => {
        setSelectedGeometry(mergeSelection(selectedGeometry, item, event.ctrlKey || event.metaKey || event.shiftKey))
      }}
      type="button"
    >
      {icon} {item.label}
    </button>
  )
}

export default function SceneTreePanel() {
  const sceneTreeOpen = useEditor((state) => state.sceneTreeOpen)
  const selectedGeometry = useEditor((state) => state.selectedGeometry)
  const setSelectedGeometry = useEditor((state) => state.setSelectedGeometry)
  const document = useModelingDocument((state) => state.document)
  const normalized = normalizeEditorDocument(document)

  if (!sceneTreeOpen) return null

  const profileItem = (profile) => ({
    kind: 'face',
    entityId: profile.id,
    label: profile.metadata?.autoCreatedFromWallBoundary ? `${profile.name} · 自动切面` : profile.name,
    meta: {
      entityType: 'profile',
      solidId: profile.solidId || null,
      profileId: profile.id,
      autoCreatedFromWallBoundary: Boolean(profile.metadata?.autoCreatedFromWallBoundary),
    },
  })
  const segmentItem = (segment) => ({
    kind: 'edge',
    entityId: segment.id,
    label: segment.kind === 'line' ? segment.id : `${segment.kind} · ${segment.id}`,
    meta: { entityType: 'segment' },
  })
  const solidItem = (solid) => ({
    kind: 'object',
    entityId: solid.id,
    label: solid.name,
    meta: { entityType: 'solid', solidId: solid.id, profileId: solid.profileId },
  })
  const surfaceItem = (surface) => ({
    kind: 'object',
    entityId: surface.id,
    label: surface.name,
    meta: { entityType: 'surface', surfaceId: surface.id },
  })

  return (
    <aside className="scene-tree-panel">
      <div className="scene-tree-panel__header">
        <strong>场景</strong>
        <span>{normalized.solids.length} 实体 · {normalized.surfaces.length} 曲面</span>
      </div>

      <div className="scene-tree-panel__group">
        <div className="scene-tree-panel__title">Profiles</div>
        {normalized.profiles.map((profile) => (
          <TreeItem icon={profile.metadata?.autoCreatedFromWallBoundary ? '◫' : '▢'} item={profileItem(profile)} key={profile.id} selectedGeometry={selectedGeometry} setSelectedGeometry={setSelectedGeometry} />
        ))}
      </div>

      <div className="scene-tree-panel__group">
        <div className="scene-tree-panel__title">Edges</div>
        {normalized.segments.map((segment) => (
          <TreeItem icon={segment.kind === 'line' ? '─' : '⌁'} item={segmentItem(segment)} key={segment.id} selectedGeometry={selectedGeometry} setSelectedGeometry={setSelectedGeometry} />
        ))}
      </div>

      <div className="scene-tree-panel__group">
        <div className="scene-tree-panel__title">Solids</div>
        {normalized.solids.map((solid) => (
          <TreeItem icon="◼" item={solidItem(solid)} key={solid.id} selectedGeometry={selectedGeometry} setSelectedGeometry={setSelectedGeometry} />
        ))}
      </div>

      <div className="scene-tree-panel__group">
        <div className="scene-tree-panel__title">Surfaces</div>
        {normalized.surfaces.map((surface) => (
          <TreeItem icon="◩" item={surfaceItem(surface)} key={surface.id} selectedGeometry={selectedGeometry} setSelectedGeometry={setSelectedGeometry} />
        ))}
      </div>
    </aside>
  )
}

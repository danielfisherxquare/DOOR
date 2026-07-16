import { useEffect, useMemo, useState } from 'react'
import type { AssetFolder, AssetItem, AssetTag } from '@arcspro/asset-client'

export type FolderFilter = 'all' | 'root' | string
export type KindFilter = 'all' | 'image' | 'design' | 'video' | 'audio' | 'document' | 'archive' | 'other'
export type SortOption = 'updated-desc' | 'created-desc' | 'name-asc' | 'size-desc'

interface AssetLibrarySidebarProps {
  folders: AssetFolder[]
  tags: AssetTag[]
  activeFolder: FolderFilter
  activeTag: string | null
  onFolderSelect: (folder: FolderFilter) => void
  onTagSelect: (tagId: string | null) => void
  onCreateFolder: (name: string, parentId: string | null) => Promise<void>
  onRenameFolder: (folder: AssetFolder, name: string) => Promise<void>
  onCreateTag: (name: string, color: string) => Promise<void>
}

interface FolderTreeProps {
  folders: AssetFolder[]
  parentId: string | null
  depth: number
  activeFolder: FolderFilter
  onSelect: (folderId: string) => void
}

function FolderTree({ folders, parentId, depth, activeFolder, onSelect }: FolderTreeProps) {
  return folders.filter((folder) => folder.parentId === parentId).map((folder) => (
    <div key={folder.id}>
      <button
        className={`library-nav-row ${activeFolder === folder.id ? 'active' : ''}`}
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={() => onSelect(folder.id)}
      >
        <span aria-hidden="true">📁</span><span>{folder.name}</span>
      </button>
      <FolderTree folders={folders} parentId={folder.id} depth={depth + 1} activeFolder={activeFolder} onSelect={onSelect} />
    </div>
  ))
}

export function AssetLibrarySidebar({
  folders,
  tags,
  activeFolder,
  activeTag,
  onFolderSelect,
  onTagSelect,
  onCreateFolder,
  onRenameFolder,
  onCreateTag,
}: AssetLibrarySidebarProps) {
  const [folderName, setFolderName] = useState('')
  const [tagName, setTagName] = useState('')
  const [tagColor, setTagColor] = useState('#d8262c')
  const [rename, setRename] = useState('')
  const activeFolderItem = folders.find((folder) => folder.id === activeFolder)

  useEffect(() => setRename(activeFolderItem?.name || ''), [activeFolderItem?.id, activeFolderItem?.name])

  return (
    <nav className="library-sidebar" aria-label="素材归类">
      <section>
        <h2>素材视图</h2>
        <button className={`library-nav-row ${activeFolder === 'all' ? 'active' : ''}`} onClick={() => onFolderSelect('all')}>
          <span aria-hidden="true">▦</span><span>全部素材</span>
        </button>
        <button className={`library-nav-row ${activeFolder === 'root' ? 'active' : ''}`} onClick={() => onFolderSelect('root')}>
          <span aria-hidden="true">○</span><span>未归类</span>
        </button>
      </section>

      <section>
        <h2>文件夹</h2>
        <FolderTree folders={folders} parentId={null} depth={0} activeFolder={activeFolder} onSelect={onFolderSelect} />
        {folders.length === 0 && <p className="empty-hint">还没有文件夹。</p>}
        <form className="compact-create" onSubmit={async (event) => {
          event.preventDefault()
          const name = folderName.trim()
          if (!name) return
          await onCreateFolder(name, activeFolderItem?.id || null)
          setFolderName('')
        }}>
          <input value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder={activeFolderItem ? `在“${activeFolderItem.name}”中新建` : '新文件夹'} aria-label="新文件夹名称" />
          <button type="submit" title="新建文件夹">+</button>
        </form>
        {activeFolderItem && <form className="compact-create" onSubmit={async (event) => {
          event.preventDefault()
          const name = rename.trim()
          if (name && name !== activeFolderItem.name) await onRenameFolder(activeFolderItem, name)
        }}>
          <input value={rename} onChange={(event) => setRename(event.target.value)} aria-label="重命名当前文件夹" />
          <button type="submit" className="secondary" title="保存文件夹名称">保存</button>
        </form>}
      </section>

      <section>
        <h2>标签</h2>
        <button className={`library-nav-row ${activeTag === null ? 'active' : ''}`} onClick={() => onTagSelect(null)}>
          <span aria-hidden="true">#</span><span>全部标签</span>
        </button>
        {tags.map((tag) => <button key={tag.id} className={`library-nav-row ${activeTag === tag.id ? 'active' : ''}`} onClick={() => onTagSelect(tag.id)}>
          <i className="tag-dot" style={{ backgroundColor: tag.color }} /><span>{tag.name}</span>
        </button>)}
        <form className="compact-create tag-create" onSubmit={async (event) => {
          event.preventDefault()
          const name = tagName.trim()
          if (!name) return
          await onCreateTag(name, tagColor)
          setTagName('')
        }}>
          <input type="color" value={tagColor} onChange={(event) => setTagColor(event.target.value)} aria-label="标签颜色" />
          <input value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="新标签" aria-label="新标签名称" />
          <button type="submit" title="新建标签">+</button>
        </form>
      </section>
    </nav>
  )
}

interface AssetToolbarProps {
  search: string
  kind: KindFilter
  sort: SortOption
  resultCount: number
  allSelected: boolean
  onSearchChange: (search: string) => void
  onKindChange: (kind: KindFilter) => void
  onSortChange: (sort: SortOption) => void
  onSelectAll: (selected: boolean) => void
  onRefresh: () => void
}

export function AssetToolbar({ search, kind, sort, resultCount, allSelected, onSearchChange, onKindChange, onSortChange, onSelectAll, onRefresh }: AssetToolbarProps) {
  return (
    <div className="asset-toolbar">
      <label className="search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="搜索素材名称" aria-label="搜索素材名称" /></label>
      <select value={kind} onChange={(event) => onKindChange(event.target.value as KindFilter)} aria-label="素材类型">
        <option value="all">全部类型</option><option value="image">位图</option><option value="design">矢量与设计稿</option>
        <option value="video">视频</option><option value="audio">音频</option><option value="document">文档</option>
        <option value="archive">压缩包</option><option value="other">其他</option>
      </select>
      <select value={sort} onChange={(event) => onSortChange(event.target.value as SortOption)} aria-label="排序方式">
        <option value="updated-desc">最近更新</option><option value="created-desc">最近上传</option><option value="name-asc">名称 A–Z</option><option value="size-desc">文件最大</option>
      </select>
      <label className="select-all"><input type="checkbox" checked={allSelected && resultCount > 0} onChange={(event) => onSelectAll(event.target.checked)} />全选 {resultCount}</label>
      <button className="secondary" onClick={onRefresh}>刷新</button>
    </div>
  )
}

interface AssetInspectorProps {
  asset: AssetItem
  folders: AssetFolder[]
  tags: AssetTag[]
  onClose: () => void
  onSave: (asset: AssetItem, patch: { name: string; folderId: string | null; note: string | null; rating: number | null; tagIds: string[] }) => Promise<void>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function extension(name: string) {
  return name.includes('.') ? name.split('.').pop()?.toUpperCase() || '无' : '无'
}

export function AssetInspector({ asset, folders, tags, onClose, onSave }: AssetInspectorProps) {
  const [name, setName] = useState(asset.name)
  const [folderId, setFolderId] = useState(asset.folderId || '')
  const [note, setNote] = useState(asset.note || '')
  const [rating, setRating] = useState(asset.rating || 0)
  const [tagIds, setTagIds] = useState<string[]>(asset.tags.map((tag) => tag.id))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(asset.name); setFolderId(asset.folderId || ''); setNote(asset.note || ''); setRating(asset.rating || 0); setTagIds(asset.tags.map((tag) => tag.id))
  }, [asset])

  return (
    <aside className="asset-inspector" aria-label="素材属性">
      <header><div><small>ASSET DETAILS</small><h2>素材属性</h2></div><button className="secondary inspector-close" onClick={onClose} aria-label="关闭属性面板">×</button></header>
      <form onSubmit={async (event) => {
        event.preventDefault(); setSaving(true)
        try { await onSave(asset, { name: name.trim(), folderId: folderId || null, note: note.trim() || null, rating: rating || null, tagIds }) }
        finally { setSaving(false) }
      }}>
        <label>文件名<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <div className="metadata-grid"><div><span>格式</span><strong>{extension(asset.name)}</strong></div><div><span>尺寸</span><strong>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : '—'}</strong></div><div><span>大小</span><strong>{(asset.size / 1024 / 1024).toFixed(2)} MB</strong></div><div><span>版本</span><strong>v{asset.currentVersion} / r{asset.revision}</strong></div></div>
        <label>文件夹<select value={folderId} onChange={(event) => setFolderId(event.target.value)}><option value="">未归类</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
        <fieldset><legend>标签</legend><div className="tag-checks">{tags.map((tag) => <label key={tag.id}><input type="checkbox" checked={tagIds.includes(tag.id)} onChange={(event) => setTagIds((current) => event.target.checked ? [...current, tag.id] : current.filter((id) => id !== tag.id))} /><i style={{ backgroundColor: tag.color }} />{tag.name}</label>)}{tags.length === 0 && <span>请先在左侧创建标签。</span>}</div></fieldset>
        <fieldset><legend>星级</legend><div className="rating-buttons">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} className={value <= rating ? 'rated' : ''} onClick={() => setRating(value === rating ? 0 : value)} aria-label={`${value}星`}>★</button>)}</div></fieldset>
        <label>备注<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="记录用途、授权范围或交付说明" /></label>
        <dl className="attribution"><div><dt>上传人</dt><dd>{asset.createdBy?.username || '未知账号'}</dd></div><div><dt>上传时间</dt><dd>{formatDate(asset.createdAt)}</dd></div><div><dt>最近更新</dt><dd>{asset.updatedBy?.username || '未知账号'}</dd></div><div><dt>更新时间</dt><dd>{formatDate(asset.updatedAt)}</dd></div></dl>
        <button type="submit" disabled={saving || !name.trim()}>{saving ? '正在保存…' : '保存素材属性'}</button>
      </form>
    </aside>
  )
}

interface BulkOrganizeBarProps {
  count: number
  folders: AssetFolder[]
  tags: AssetTag[]
  busy: boolean
  onMove: (folderId: string | null) => Promise<void>
  onAddTag: (tagId: string) => Promise<void>
  onClear: () => void
}

export function BulkOrganizeBar({ count, folders, tags, busy, onMove, onAddTag, onClear }: BulkOrganizeBarProps) {
  const [folderId, setFolderId] = useState('')
  const [tagId, setTagId] = useState('')
  if (count === 0) return null
  return (
    <div className="bulk-organize" role="region" aria-label="批量整理">
      <strong>已选 {count} 项</strong>
      <select value={folderId} onChange={(event) => setFolderId(event.target.value)} aria-label="目标文件夹"><option value="">移到未归类</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>
      <button disabled={busy} onClick={() => onMove(folderId || null)}>移动</button>
      <select value={tagId} onChange={(event) => setTagId(event.target.value)} aria-label="要添加的标签"><option value="">选择标签</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select>
      <button disabled={busy || !tagId} onClick={() => onAddTag(tagId)}>添加标签</button>
      <button className="secondary" onClick={onClear}>取消选择</button>
    </div>
  )
}

export function selectedAssetsById(assets: AssetItem[], selectedIds: Set<string>) {
  return assets.filter((asset) => selectedIds.has(asset.id))
}

export function folderNameById(folders: AssetFolder[], folderId: string | null) {
  return folders.find((folder) => folder.id === folderId)?.name || '未归类'
}

export function useSelectedAssets(assets: AssetItem[], selectedIds: Set<string>) {
  return useMemo(() => selectedAssetsById(assets, selectedIds), [assets, selectedIds])
}

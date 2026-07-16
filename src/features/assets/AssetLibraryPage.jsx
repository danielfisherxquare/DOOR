import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { assetClient } from '../../api/assets.js'
import AssetGrid from './components/AssetGrid.jsx'
import AssetInspector from './components/AssetInspector.jsx'
import InlineNameEditor from './components/InlineNameEditor.jsx'
import SyncActivityTray from './components/SyncActivityTray.jsx'
import './asset-library.css'

const KIND_FILTERS = [
  ['all', '全部类型'],
  ['image', '图片'],
  ['video', '视频'],
  ['design', '设计源文件'],
  ['document', '文档'],
  ['archive', '压缩包'],
]

function saveBlob(response, fileName) {
  const source = response.data instanceof Blob ? response.data : new Blob([response.data])
  const url = URL.createObjectURL(source)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function AssetLibraryPage() {
  const fileInputRef = useRef(null)
  const [libraryContext, setLibraryContext] = useState({ libraries: [], folders: [], tags: [] })
  const [items, setItems] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [openedId, setOpenedId] = useState(null)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [kind, setKind] = useState('all')
  const [folderId, setFolderId] = useState('root')
  const [tagId, setTagId] = useState(null)
  const [layout, setLayout] = useState('grid')
  const [cursor, setCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [jobs, setJobs] = useState([])
  const [editor, setEditor] = useState(null)
  const [versions, setVersions] = useState([])
  const [versionsLoading, setVersionsLoading] = useState(false)

  const currentLibrary = libraryContext.libraries[0] || null
  const openedAsset = useMemo(() => items.find((asset) => asset.id === openedId) || null, [items, openedId])

  async function loadAssets({ append = false, nextCursor = null } = {}) {
    setLoading(true)
    setError('')
    try {
      const result = await assetClient.listAssets({
        libraryId: currentLibrary?.id,
        folderId,
        search: deferredSearch || undefined,
        kinds: kind === 'all' ? undefined : kind,
        tags: tagId || undefined,
        cursor: nextCursor || undefined,
        limit: 48,
      })
      setItems((current) => append ? [...current, ...result.items] : result.items)
      setCursor(result.nextCursor)
      setHasMore(result.hasMore)
    } catch (requestError) {
      setError(requestError.message || '素材列表载入失败')
    } finally {
      setLoading(false)
    }
  }

  async function refreshContext() {
    const context = await assetClient.getContext()
    setLibraryContext(context)
    return context
  }

  useEffect(() => {
    let active = true
    assetClient.getContext()
      .then((context) => active && setLibraryContext(context))
      .catch((requestError) => active && setError(requestError.message || '素材库初始化失败'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (currentLibrary?.id) loadAssets()
    // loadAssets intentionally follows visible filter state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLibrary?.id, folderId, tagId, kind, deferredSearch])

  useEffect(() => {
    if (!openedId) {
      setVersions([])
      return
    }
    let active = true
    setVersionsLoading(true)
    assetClient.listVersions(openedId)
      .then((result) => active && setVersions(result.items))
      .catch((requestError) => active && setError(requestError.message || '版本记录载入失败'))
      .finally(() => active && setVersionsLoading(false))
    return () => { active = false }
  }, [openedId])

  function patchJob(id, patch) {
    setJobs((current) => current.map((job) => job.id === id ? { ...job, ...patch } : job))
  }

  async function uploadFiles(fileList) {
    const files = [...fileList]
    for (const file of files) {
      const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${file.name}`
      setJobs((current) => [...current, { id, name: file.name, file, state: 'running', progress: 0 }])
      try {
        await assetClient.uploadFile(file, {
          libraryId: currentLibrary?.id,
          folderId: folderId === 'root' ? null : folderId,
          onProgress: ({ loaded, total }) => patchJob(id, { progress: total ? loaded / total : 0 }),
        })
        patchJob(id, { state: 'completed', progress: 1 })
      } catch (uploadError) {
        patchJob(id, { state: 'failed', error: uploadError.message || '上传失败' })
      }
    }
    await loadAssets()
  }

  async function updateAsset(patch) {
    try {
      const updated = await assetClient.patchAsset(openedId, patch)
      setItems((current) => current.map((asset) => asset.id === updated.id ? { ...asset, ...updated } : asset))
    } catch (requestError) {
      setError(requestError.message)
      if (requestError.code === 'ASSET_REVISION_CONFLICT') await loadAssets()
    }
  }

  async function deleteAsset(asset) {
    if (!window.confirm(`将“${asset.name}”移入回收站？`)) return
    try {
      await assetClient.deleteAsset(asset.id, asset.revision)
      setOpenedId(null)
      setSelectedIds(new Set())
      await loadAssets()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function downloadAsset(asset) {
    try {
      saveBlob(await assetClient.downloadAsset(asset), asset.name)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function saveEditor({ name, color }) {
    try {
      if (editor.type === 'folder-create') {
        await assetClient.createFolder({ libraryId: currentLibrary?.id, name, parentId: null })
      } else if (editor.type === 'folder-edit') {
        await assetClient.patchFolder(editor.item.id, { name, baseRevision: editor.item.revision })
      } else if (editor.type === 'tag-create') {
        await assetClient.createTag({ name, color })
      } else if (editor.type === 'tag-edit') {
        await assetClient.patchTag(editor.item.id, { name, color, baseRevision: editor.item.revision })
      }
      await refreshContext()
      setEditor(null)
    } catch (requestError) {
      setError(requestError.message || '保存失败')
    }
  }

  async function removeFolder(folder) {
    if (!window.confirm(`删除空文件夹“${folder.name}”？`)) return
    try {
      await assetClient.deleteFolder(folder.id, folder.revision)
      if (folderId === folder.id) setFolderId('root')
      await refreshContext()
    } catch (requestError) {
      setError(requestError.message || '文件夹删除失败')
    }
  }

  async function removeTag(tag) {
    if (!window.confirm(`删除标签“${tag.name}”？素材文件不会被删除。`)) return
    try {
      await assetClient.deleteTag(tag.id, tag.revision)
      if (tagId === tag.id) setTagId(null)
      await refreshContext()
      await loadAssets()
    } catch (requestError) {
      setError(requestError.message || '标签删除失败')
    }
  }

  async function refreshVersions(assetId = openedId) {
    if (!assetId) return
    const result = await assetClient.listVersions(assetId)
    setVersions(result.items)
  }

  async function uploadVersion(file) {
    if (!openedAsset || !file) return
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${file.name}`
    setJobs((current) => [...current, { id, name: `${openedAsset.name} · 新版本`, file, state: 'running', progress: 0 }])
    try {
      const updated = await assetClient.uploadNewVersion(openedAsset.id, openedAsset.revision, file, {
        onProgress: ({ loaded, total }) => patchJob(id, { progress: total ? loaded / total : 0 }),
      })
      patchJob(id, { state: 'completed', progress: 1 })
      setItems((current) => current.map((asset) => asset.id === updated.id ? { ...asset, ...updated } : asset))
      await refreshVersions(updated.id)
    } catch (requestError) {
      patchJob(id, { state: 'failed', error: requestError.message || '版本上传失败' })
      setError(requestError.message || '版本上传失败')
      if (requestError.code === 'ASSET_REVISION_CONFLICT') await loadAssets()
    }
  }

  async function downloadVersion(version) {
    try {
      saveBlob(await assetClient.downloadVersion(openedAsset.id, version.id), version.fileName)
    } catch (requestError) {
      setError(requestError.message || '版本下载失败')
    }
  }

  return (
    <main
      className="asset-library"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        if (event.dataTransfer.files.length) uploadFiles(event.dataTransfer.files)
      }}
    >
      <header className="asset-toolbar">
        <div className="asset-toolbar__title">
          <span className="asset-toolbar__mark material-symbols-outlined" aria-hidden="true">photo_library</span>
          <div><span>ArcSpro Assets</span><h1>团队素材库</h1></div>
        </div>
        <div className="asset-search">
          <label htmlFor="asset-search">搜索素材</label>
          <span className="material-symbols-outlined" aria-hidden="true">search</span>
          <input id="asset-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="文件名、标签…" />
        </div>
        <select aria-label="素材类型" value={kind} onChange={(event) => setKind(event.target.value)}>
          {KIND_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <div className="asset-layout-switch" aria-label="显示方式">
          {['grid', 'list'].map((value) => (
            <button key={value} type="button" aria-label={value === 'grid' ? '网格' : '列表'} aria-pressed={layout === value} onClick={() => setLayout(value)}>
              <span className="material-symbols-outlined" aria-hidden="true">{value === 'grid' ? 'grid_view' : 'view_list'}</span>
            </button>
          ))}
        </div>
        <input ref={fileInputRef} className="asset-file-input" type="file" multiple onChange={(event) => uploadFiles(event.target.files)} />
        <button type="button" className="button button--primary asset-upload-button" onClick={() => fileInputRef.current?.click()}>
          <span className="material-symbols-outlined" aria-hidden="true">upload</span><span className="asset-upload-button__label">上传素材</span>
        </button>
      </header>

      {error && <div className="asset-error" role="alert"><span className="material-symbols-outlined" aria-hidden="true">error</span>{error}<button type="button" onClick={() => setError('')} aria-label="关闭错误">&times;</button></div>}

      <div className="asset-library__workspace">
        <nav className="asset-sidebar" aria-label="素材库导航">
          <button type="button" className={folderId === 'root' && !tagId ? 'is-active' : ''} onClick={() => { setFolderId('root'); setTagId(null) }}>
            <span className="material-symbols-outlined" aria-hidden="true">folder_open</span>全部素材
            <small>{items.length}</small>
          </button>
          <div className="asset-sidebar__section">
            <div className="asset-sidebar__heading"><span>文件夹</span><button type="button" onClick={() => setEditor({ type: 'folder-create' })} aria-label="新建文件夹"><span className="material-symbols-outlined" aria-hidden="true">create_new_folder</span></button></div>
            {editor?.type === 'folder-create' && <InlineNameEditor label="文件夹名称" onSave={saveEditor} onCancel={() => setEditor(null)} />}
            {libraryContext.folders.map((folder) => (
              editor?.type === 'folder-edit' && editor.item.id === folder.id
                ? <InlineNameEditor key={folder.id} label="文件夹名称" initialValue={folder.name} onSave={saveEditor} onCancel={() => setEditor(null)} />
                : <div className="asset-sidebar__row" key={folder.id}>
                    <button type="button" className={folderId === folder.id ? 'is-active' : ''} onClick={() => { setFolderId(folder.id); setTagId(null) }}>
                      <span className="material-symbols-outlined" aria-hidden="true">folder</span><span>{folder.name}</span>
                    </button>
                    <span className="asset-sidebar__actions">
                      <button type="button" onClick={() => setEditor({ type: 'folder-edit', item: folder })} aria-label={`重命名${folder.name}`}><span className="material-symbols-outlined" aria-hidden="true">edit</span></button>
                      <button type="button" onClick={() => removeFolder(folder)} aria-label={`删除${folder.name}`}><span className="material-symbols-outlined" aria-hidden="true">delete</span></button>
                    </span>
                  </div>
            ))}
            {libraryContext.folders.length === 0 && <p>尚未创建文件夹</p>}
          </div>
          <div className="asset-sidebar__section asset-sidebar__tags">
            <div className="asset-sidebar__heading"><span>标签</span><button type="button" onClick={() => setEditor({ type: 'tag-create' })} aria-label="新建标签"><span className="material-symbols-outlined" aria-hidden="true">new_label</span></button></div>
            {editor?.type === 'tag-create' && <InlineNameEditor label="标签名称" withColor onSave={saveEditor} onCancel={() => setEditor(null)} />}
            {libraryContext.tags.map((tag) => (
              editor?.type === 'tag-edit' && editor.item.id === tag.id
                ? <InlineNameEditor key={tag.id} label="标签名称" initialValue={tag.name} initialColor={tag.color} withColor onSave={saveEditor} onCancel={() => setEditor(null)} />
                : <div className="asset-sidebar__row asset-sidebar__tag-row" key={tag.id}>
                    <button type="button" className={tagId === tag.id ? 'is-active' : ''} onClick={() => { setTagId(tagId === tag.id ? null : tag.id); setFolderId('root') }}>
                      <i style={{ '--tag-color': tag.color }} /><span>{tag.name}</span>
                    </button>
                    <span className="asset-sidebar__actions">
                      <button type="button" onClick={() => setEditor({ type: 'tag-edit', item: tag })} aria-label={`编辑${tag.name}`}><span className="material-symbols-outlined" aria-hidden="true">edit</span></button>
                      <button type="button" onClick={() => removeTag(tag)} aria-label={`删除${tag.name}`}><span className="material-symbols-outlined" aria-hidden="true">delete</span></button>
                    </span>
                  </div>
            ))}
            {libraryContext.tags.length === 0 && <p>尚未添加标签</p>}
          </div>
        </nav>

        <section className="asset-results" aria-label="素材列表">
          <div className="asset-results__summary">
            <span>{deferredSearch ? `搜索“${deferredSearch}”` : tagId ? `标签 · ${libraryContext.tags.find((tag) => tag.id === tagId)?.name || ''}` : currentLibrary?.name || '团队素材库'}</span>
            <small>{items.length} 个素材{selectedIds.size ? ` · 已选 ${selectedIds.size}` : ''}</small>
          </div>
          <AssetGrid
            items={items}
            selectedIds={selectedIds}
            layout={layout}
            isLoading={loading}
            hasMore={hasMore}
            onSelectionChange={(ids) => setSelectedIds(new Set(ids))}
            onOpen={setOpenedId}
            onLoadMore={() => loadAssets({ append: true, nextCursor: cursor })}
          />
        </section>

        <AssetInspector
          asset={openedAsset}
          open={Boolean(openedAsset)}
          editable
          onClose={() => setOpenedId(null)}
          onUpdate={updateAsset}
          onDownload={downloadAsset}
          onDelete={deleteAsset}
          folders={libraryContext.folders}
          tags={libraryContext.tags}
          versions={versions}
          versionsLoading={versionsLoading}
          onUploadVersion={uploadVersion}
          onDownloadVersion={downloadVersion}
        />
      </div>
      <SyncActivityTray jobs={jobs} onRetry={(id) => {
        const job = jobs.find((entry) => entry.id === id)
        if (job?.file) uploadFiles([job.file])
      }} />
    </main>
  )
}

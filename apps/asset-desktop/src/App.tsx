import { useEffect, useMemo, useRef, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir, readFile, stat, watch, writeFile } from '@tauri-apps/plugin-fs'
import { basename, join } from '@tauri-apps/api/path'
import {
  createDesktopSession,
  desktopAssetClient,
  login,
  type DesktopPendingOrganizationSelection,
  type DesktopSession,
} from './asset-api'
import { loadLocalIndex, saveLocalIndex, type PersistedQueueItem } from './local-index'
import type { AssetFolder, AssetItem, AssetTag } from '@arcspro/asset-client'
import { AssetPreviewDialog, AssetThumbnail } from './AssetPreviewDialog'
import {
  AssetInspector,
  AssetLibrarySidebar,
  AssetToolbar,
  BulkOrganizeBar,
  folderNameById,
  useSelectedAssets,
  type FolderFilter,
  type KindFilter,
  type SortOption,
} from './AssetOrganizer'

type QueueItem = PersistedQueueItem

function mimeType(name: string) {
  const extension = name.split('.').pop()?.toLowerCase()
  const types: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg',
    pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', json: 'application/json', csv: 'text/csv',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    psd: 'image/vnd.adobe.photoshop', ai: 'application/illustrator', eps: 'application/postscript', ps: 'application/postscript',
    psb: 'image/vnd.adobe.photoshop', psdt: 'image/vnd.adobe.photoshop', heic: 'image/heic', heif: 'image/heif',
    tif: 'image/tiff', tiff: 'image/tiff', tga: 'image/x-tga', hdr: 'image/vnd.radiance', exr: 'image/x-exr', dds: 'image/vnd-ms.dds',
    jp2: 'image/jp2', j2k: 'image/jp2', pcx: 'image/x-pcx', dng: 'image/x-adobe-dng',
    otf: 'font/otf', ttf: 'font/ttf', woff: 'font/woff', woff2: 'font/woff2',
  }
  return types[extension || ''] || 'application/octet-stream'
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '未知错误'
}

function errorStatus(error: unknown): number {
  return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 0
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readDir(directory)
  const result: string[] = []
  for (const entry of entries) {
    const fullPath = await join(directory, entry.name)
    if (entry.isDirectory) result.push(...await collectFiles(fullPath))
    else if (entry.isFile && !entry.name.startsWith('.')) result.push(fullPath)
  }
  return result
}

async function fingerprint(path: string): Promise<string> {
  const metadata = await stat(path)
  return `${metadata.size}:${metadata.mtime?.getTime() || 0}`
}

export default function App() {
  const [session, setSession] = useState<DesktopSession | null>(null)
  const [serverUrl, setServerUrl] = useState('https://www.arcspro.work:18443')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [pendingOrganization, setPendingOrganization] = useState<DesktopPendingOrganizationSelection | null>(null)
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [error, setError] = useState('')
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [syncFolder, setSyncFolder] = useState('')
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [cursor, setCursor] = useState('0')
  const [fingerprints, setFingerprints] = useState<Record<string, string>>({})
  const [assetLinks, setAssetLinks] = useState<Record<string, { assetId: string; revision: number }>>({})
  const [indexReady, setIndexReady] = useState(false)
  const [previewAsset, setPreviewAsset] = useState<AssetItem | null>(null)
  const [folders, setFolders] = useState<AssetFolder[]>([])
  const [tags, setTags] = useState<AssetTag[]>([])
  const [libraryId, setLibraryId] = useState('')
  const [activeFolder, setActiveFolder] = useState<FolderFilter>('all')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<KindFilter>('all')
  const [sort, setSort] = useState<SortOption>('updated-desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [inspectedAssetId, setInspectedAssetId] = useState<string | null>(null)
  const [organizing, setOrganizing] = useState(false)
  const fingerprintsRef = useRef(fingerprints)
  const assetLinksRef = useRef(assetLinks)
  const client = useMemo(() => session ? desktopAssetClient(session) : null, [session])
  const loadOriginal = useMemo(() => async (asset: AssetItem) => {
    if (!client) throw new Error('素材库尚未连接')
    return (await client.downloadAsset(asset)).data
  }, [client])
  const loadConverted = useMemo(() => async (asset: AssetItem) => {
    if (!client) throw new Error('素材库尚未连接')
    return client.getPreview(asset.id)
  }, [client])
  const loadThumbnail = useMemo(() => async (asset: AssetItem) => {
    if (!client) throw new Error('素材库尚未连接')
    return client.getThumbnail(asset.id)
  }, [client])
  const selectedAssets = useSelectedAssets(assets, selectedIds)
  const inspectedAsset = assets.find((asset) => asset.id === inspectedAssetId) || null

  useEffect(() => { fingerprintsRef.current = fingerprints }, [fingerprints])
  useEffect(() => { assetLinksRef.current = assetLinks }, [assetLinks])

  useEffect(() => {
    let active = true
    loadLocalIndex().then((index) => {
      if (!active) return
      setServerUrl(index.serverUrl)
      setSyncFolder(index.syncFolder)
      setCursor(index.cursor)
      setFingerprints(index.fingerprints)
      setAssetLinks(index.assetLinks)
      setQueue(index.queue)
      setIndexReady(true)
    }).catch((indexError) => active && setError(`本地同步索引载入失败：${errorMessage(indexError)}`))
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!indexReady) return
    saveLocalIndex({ serverUrl, syncFolder, cursor, fingerprints, assetLinks, queue }).catch((indexError) => setError(`本地同步索引保存失败：${errorMessage(indexError)}`))
  }, [assetLinks, cursor, fingerprints, indexReady, queue, serverUrl, syncFolder])

  async function refreshContext() {
    if (!client) return
    try {
      const context = await client.getContext()
      setFolders(context.folders)
      setTags(context.tags)
      setLibraryId(context.libraries.find((library) => library.isDefault)?.id || context.libraries[0]?.id || '')
    } catch (requestError) { setError(errorMessage(requestError)) }
  }

  async function refresh() {
    if (!client) return
    try {
      const result = await client.listAssets({
        limit: 100,
        ...(activeFolder !== 'all' ? { folderId: activeFolder } : {}),
        ...(activeTag ? { tags: [activeTag] } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(kind !== 'all' ? { kinds: [kind] } : {}),
        sort,
      })
      setAssets(result.items)
      setSelectedIds((current) => new Set([...current].filter((id) => result.items.some((asset) => asset.id === id))))
      let nextCursor = cursor
      let page
      do {
        page = await client.pullChanges(nextCursor, 200)
        nextCursor = page.nextCursor
      } while (page.hasMore)
      setCursor(nextCursor)
    } catch (requestError) { setError(errorMessage(requestError)) }
  }

  useEffect(() => { refreshContext() }, [client])
  useEffect(() => { refresh() }, [client, activeFolder, activeTag, search, kind, sort])

  useEffect(() => {
    if (!syncFolder) return undefined
    let unwatch: (() => void) | undefined
    watch(syncFolder, async (event) => {
      const additions: QueueItem[] = []
      for (const path of event.paths || []) {
        try {
          const metadata = await stat(path)
          if (!metadata.isFile) continue
          const nextFingerprint = await fingerprint(path)
          if (fingerprintsRef.current[path] === nextFingerprint) continue
          additions.push({ id: crypto.randomUUID(), path, state: 'queued', progress: 0, fingerprint: nextFingerprint })
        } catch { /* deleted paths do not need an upload job */ }
      }
      setQueue((current) => {
        const existing = new Set(current.filter((item) => item.state !== 'completed').map((item) => item.path))
        return [...current, ...additions.filter((item) => !existing.has(item.path))]
      })
    }, { recursive: true, delayMs: 800 })
      .then((stop) => { unwatch = stop })
      .catch((watchError) => setError(`无法监听同步文件夹：${errorMessage(watchError)}`))
    return () => unwatch?.()
  }, [syncFolder])

  async function chooseFolder() {
    try {
      const selected = await open({ directory: true, recursive: true, multiple: false, title: '选择素材同步文件夹' })
      if (typeof selected === 'string') setSyncFolder(selected)
    } catch (folderError) {
      setError(`无法选择同步文件夹：${errorMessage(folderError)}`)
    }
  }

  async function enqueueDirectory() {
    if (!syncFolder) return
    try {
      const paths = await collectFiles(syncFolder)
      const additions: QueueItem[] = []
      for (const path of paths) {
        const nextFingerprint = await fingerprint(path)
        if (fingerprintsRef.current[path] !== nextFingerprint) additions.push({ id: crypto.randomUUID(), path, state: 'queued', progress: 0, fingerprint: nextFingerprint })
      }
      setQueue((current) => {
        const existing = new Set(current.filter((item) => item.state !== 'completed').map((item) => item.path))
        return [...current.filter((item) => item.state !== 'completed'), ...additions.filter((item) => !existing.has(item.path))]
      })
    } catch (scanError) {
      setError(`无法扫描同步文件夹：${errorMessage(scanError)}`)
    }
  }

  async function runQueue() {
    if (!client) return
    for (const pending of queue.filter((item) => item.state === 'queued' || item.state === 'failed')) {
      setQueue((current) => current.map((item) => item.id === pending.id ? { ...item, state: 'uploading', error: undefined } : item))
      try {
        const bytes = await readFile(pending.path)
        const name = await basename(pending.path)
        const file = new File([bytes], name, { type: mimeType(name), lastModified: Date.now() })
        const linkedAsset = assetLinksRef.current[pending.path]
        const uploaded = linkedAsset
          ? await client.uploadNewVersion(linkedAsset.assetId, linkedAsset.revision, file, {
              onProgress: ({ loaded, total }: { loaded: number; total: number }) => setQueue((current) => current.map((item) => item.id === pending.id ? { ...item, progress: total ? loaded / total : 0 } : item)),
            })
          : await client.uploadFile(file, {
          onProgress: ({ loaded, total }: { loaded: number; total: number }) => setQueue((current) => current.map((item) => item.id === pending.id ? { ...item, progress: total ? loaded / total : 0 } : item)),
            })
        setQueue((current) => current.map((item) => item.id === pending.id ? { ...item, state: 'completed', progress: 1 } : item))
        const uploadedFingerprint = pending.fingerprint || await fingerprint(pending.path)
        setFingerprints((current) => ({ ...current, [pending.path]: uploadedFingerprint }))
        setAssetLinks((current) => ({ ...current, [pending.path]: { assetId: uploaded.id, revision: uploaded.revision } }))
      } catch (uploadError) {
        setQueue((current) => current.map((item) => item.id === pending.id ? { ...item, state: 'failed', error: errorMessage(uploadError) } : item))
      }
    }
    await refresh()
  }

  async function download(asset: AssetItem) {
    if (!client || !syncFolder) return setError('请先选择同步文件夹')
    try {
      const response = await client.downloadAsset(asset)
      const bytes = new Uint8Array(await response.data.arrayBuffer())
      const target = await join(syncFolder, asset.name)
      await writeFile(target, bytes)
      const downloadedFingerprint = await fingerprint(target)
      const downloadedLink = { assetId: asset.id, revision: asset.revision }
      fingerprintsRef.current = { ...fingerprintsRef.current, [target]: downloadedFingerprint }
      assetLinksRef.current = { ...assetLinksRef.current, [target]: downloadedLink }
      setFingerprints(fingerprintsRef.current)
      setAssetLinks(assetLinksRef.current)
      setQueue((current) => current.map((item) => item.path === target && item.state !== 'completed'
        ? { ...item, state: 'completed', progress: 1, error: undefined, fingerprint: downloadedFingerprint }
        : item))
    } catch (downloadError) { setError(errorMessage(downloadError)) }
  }

  async function createFolder(name: string, parentId: string | null) {
    if (!client || !libraryId) return
    try {
      await client.createFolder({ libraryId, parentId, name })
      await refreshContext()
    } catch (requestError) { setError(errorMessage(requestError)) }
  }

  async function renameFolder(folder: AssetFolder, name: string) {
    if (!client) return
    try {
      await client.patchFolder(folder.id, { baseRevision: folder.revision, name })
      await refreshContext()
    } catch (requestError) {
      setError(errorStatus(requestError) === 409 ? '文件夹已被其他成员修改，已刷新最新内容。' : errorMessage(requestError))
      await refreshContext()
    }
  }

  async function createTag(name: string, color: string) {
    if (!client) return
    try {
      await client.createTag({ name, color })
      await refreshContext()
    } catch (requestError) { setError(errorMessage(requestError)) }
  }

  async function saveAsset(asset: AssetItem, patch: { name: string; folderId: string | null; note: string | null; rating: number | null; tagIds: string[] }) {
    if (!client) return
    try {
      const updated = await client.patchAsset(asset.id, { baseRevision: asset.revision, ...patch })
      setAssets((current) => current.map((item) => item.id === updated.id ? updated : item))
    } catch (requestError) {
      setError(errorStatus(requestError) === 409 ? '该素材已被其他成员修改，已加载最新版本，请重新确认后保存。' : errorMessage(requestError))
      await refresh()
    }
  }

  async function organizeSelected(operation: (asset: AssetItem) => Promise<AssetItem>) {
    if (selectedAssets.length === 0) return
    setOrganizing(true)
    const results = await Promise.allSettled(selectedAssets.map(operation))
    const updated = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
    const failed = results.length - updated.length
    setAssets((current) => current.map((asset) => updated.find((item) => item.id === asset.id) || asset))
    setSelectedIds(new Set())
    setOrganizing(false)
    if (failed) setError(`${failed} 个素材未能整理，可能已被其他成员更新。列表已刷新。`)
    await refresh()
  }

  async function moveSelected(folderId: string | null) {
    if (!client) return
    await organizeSelected((asset) => client.patchAsset(asset.id, { baseRevision: asset.revision, folderId }))
  }

  async function tagSelected(tagId: string) {
    if (!client) return
    await organizeSelected((asset) => client.patchAsset(asset.id, {
      baseRevision: asset.revision,
      tagIds: [...new Set([...asset.tags.map((tag) => tag.id), tagId])],
    }))
  }

  function toggleAsset(assetId: string, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (selected) next.add(assetId); else next.delete(assetId)
      return next
    })
  }

  if (!session) {
    return (
      <main className="desktop-login">
        <section>
          <span className="brand-mark">AS</span>
          <p className="eyebrow">ArcSpro Assets</p>
          <h1>连接团队素材库</h1>
          <p>密码只用于本次登录，App 不保存密码。</p>
          <form onSubmit={async (event) => {
            event.preventDefault()
            setError('')
            try {
              if (pendingOrganization) {
                setSession(createDesktopSession(pendingOrganization, selectedOrgId))
                setPendingOrganization(null)
                return
              }
              const result = await login(serverUrl, account, password)
              setPassword('')
              if (result.kind === 'session') {
                setSession(result.session)
                return
              }
              setPendingOrganization(result.pending)
              setSelectedOrgId(result.pending.organizations[0]?.id || '')
            } catch (loginError) { setError(errorMessage(loginError)) }
          }}>
            <label>ArcSpro 服务地址<input value={serverUrl} onChange={(event) => { setServerUrl(event.target.value); setPendingOrganization(null) }} type="url" required disabled={Boolean(pendingOrganization)} /></label>
            {pendingOrganization ? <>
              <div className="desktop-login-note">已验证账号 <strong>{pendingOrganization.userName}</strong>，请选择要连接的团队机构。</div>
              <label>团队机构
                <select value={selectedOrgId} onChange={(event) => setSelectedOrgId(event.target.value)} required>
                  {pendingOrganization.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
                </select>
              </label>
            </> : <>
              <label>账号<input value={account} onChange={(event) => setAccount(event.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required /></label>
              <label>密码<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>
            </>}
            {error && <div className="desktop-error" role="alert">{error}</div>}
            <div className="desktop-login-actions">
              {pendingOrganization && <button type="button" className="secondary" onClick={() => { setPendingOrganization(null); setSelectedOrgId(''); setError('') }}>切换账号</button>}
              <button type="submit" disabled={!indexReady || (Boolean(pendingOrganization) && !selectedOrgId)}>{indexReady ? (pendingOrganization ? '进入团队素材库' : '登录并同步') : '正在载入本地索引…'}</button>
            </div>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="desktop-shell">
      <header>
        <div><span className="brand-mark">AS</span><div><small>ARCSPRO ASSETS</small><h1>团队素材库</h1></div></div>
        <span className="connection"><i />{session.userName} · 已连接</span>
      </header>
      {error && <div className="desktop-error" role="alert">{error}<button onClick={() => setError('')}>&times;</button></div>}
      <div className="desktop-workspace">
        <aside>
          <AssetLibrarySidebar
            folders={folders}
            tags={tags}
            activeFolder={activeFolder}
            activeTag={activeTag}
            onFolderSelect={setActiveFolder}
            onTagSelect={setActiveTag}
            onCreateFolder={createFolder}
            onRenameFolder={renameFolder}
            onCreateTag={createTag}
          />
          <details className="sync-panel">
            <summary>本地同步与队列</summary>
            <button onClick={chooseFolder} className="secondary">选择文件夹</button>
            <code>{syncFolder || '尚未选择'}</code>
            <small className="index-status">{indexReady ? `本地索引已保存 · 游标 ${cursor} · ${Object.keys(assetLinks).length} 个云端映射` : '正在载入本地索引…'}</small>
            <button onClick={enqueueDirectory} disabled={!syncFolder}>扫描本地文件</button>
            <button onClick={runQueue} disabled={!queue.some((item) => item.state !== 'completed')}>开始同步 ({queue.filter((item) => item.state !== 'completed').length})</button>
            <div className="queue-list">
              {queue.slice(-8).map((item) => <div key={item.id}><span>{item.path.split(/[\\/]/).pop()}</span><progress value={item.progress} max="1" /><small>{item.state === 'failed' ? item.error : item.state}</small></div>)}
              {queue.length === 0 && <p>监听目录变化后，新文件会出现在这里。</p>}
            </div>
          </details>
        </aside>
        <section className="desktop-assets">
          <div className="section-title"><div><small>CLOUD LIBRARY</small><h2>{assets.length} 个素材</h2><p>{activeFolder === 'all' ? '全部文件夹' : activeFolder === 'root' ? '未归类' : folderNameById(folders, activeFolder)}{activeTag ? ` · #${tags.find((tag) => tag.id === activeTag)?.name || '标签'}` : ''}</p></div></div>
          <AssetToolbar
            search={search}
            kind={kind}
            sort={sort}
            resultCount={assets.length}
            allSelected={assets.length > 0 && assets.every((asset) => selectedIds.has(asset.id))}
            onSearchChange={setSearch}
            onKindChange={setKind}
            onSortChange={setSort}
            onSelectAll={(selected) => setSelectedIds(selected ? new Set(assets.map((asset) => asset.id)) : new Set())}
            onRefresh={() => { refreshContext(); refresh() }}
          />
          <BulkOrganizeBar count={selectedAssets.length} folders={folders} tags={tags} busy={organizing} onMove={moveSelected} onAddTag={tagSelected} onClear={() => setSelectedIds(new Set())} />
          <div className="desktop-grid">
            {assets.map((asset) => <article key={asset.id}>
              <label className="asset-select" title="选择素材"><input type="checkbox" checked={selectedIds.has(asset.id)} onChange={(event) => toggleAsset(asset.id, event.target.checked)} /><span /></label>
              <AssetThumbnail asset={asset} loadThumbnail={loadThumbnail} loadConverted={loadConverted} onOpen={() => setPreviewAsset(asset)} />
              <strong title={asset.name}>{asset.name}</strong>
              <span>{(asset.size / 1024 / 1024).toFixed(1)} MB · r{asset.revision} · {asset.createdBy?.username || '未知账号'} 上传</span>
              <div className="asset-card-tags">{asset.tags.slice(0, 3).map((tag) => <i key={tag.id} style={{ borderColor: tag.color }}>{tag.name}</i>)}</div>
              <div className="asset-card-actions"><button className="secondary" onClick={() => setPreviewAsset(asset)}>预览</button><button className="secondary" onClick={() => setInspectedAssetId(asset.id)}>整理</button><button onClick={() => download(asset)}>下载</button></div>
            </article>)}
            {assets.length === 0 && <div className="empty-library"><strong>这里还没有素材</strong><span>可以切换文件夹或筛选条件，也可以从本地同步面板上传文件。</span></div>}
          </div>
        </section>
      </div>
      {inspectedAsset && <AssetInspector asset={inspectedAsset} folders={folders} tags={tags} onClose={() => setInspectedAssetId(null)} onSave={saveAsset} />}
      <AssetPreviewDialog asset={previewAsset} onClose={() => setPreviewAsset(null)} onDownload={download} loadOriginal={loadOriginal} loadConverted={loadConverted} />
    </main>
  )
}

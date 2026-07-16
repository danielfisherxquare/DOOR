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
import type { AssetItem } from '@arcspro/asset-client'
import { AssetPreviewDialog, AssetThumbnail } from './AssetPreviewDialog'

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

  async function refresh() {
    if (!client) return
    try {
      const result = await client.listAssets({ limit: 100 })
      setAssets(result.items)
      let nextCursor = cursor
      let page
      do {
        page = await client.pullChanges(nextCursor, 200)
        nextCursor = page.nextCursor
      } while (page.hasMore)
      setCursor(nextCursor)
    } catch (requestError) { setError(errorMessage(requestError)) }
  }

  useEffect(() => { refresh() }, [client])

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
            <label>DOOR 服务地址<input value={serverUrl} onChange={(event) => { setServerUrl(event.target.value); setPendingOrganization(null) }} type="url" required disabled={Boolean(pendingOrganization)} /></label>
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
          <h2>本地同步</h2>
          <button onClick={chooseFolder} className="secondary">选择文件夹</button>
          <code>{syncFolder || '尚未选择'}</code>
          <small className="index-status">{indexReady ? `本地索引已保存 · 游标 ${cursor} · ${Object.keys(assetLinks).length} 个云端映射` : '正在载入本地索引…'}</small>
          <button onClick={enqueueDirectory} disabled={!syncFolder}>扫描本地文件</button>
          <button onClick={runQueue} disabled={!queue.some((item) => item.state !== 'completed')}>开始同步 ({queue.filter((item) => item.state !== 'completed').length})</button>
          <h2>同步队列</h2>
          <div className="queue-list">
            {queue.slice(-8).map((item) => <div key={item.id}><span>{item.path.split(/[\\/]/).pop()}</span><progress value={item.progress} max="1" /><small>{item.state === 'failed' ? item.error : item.state}</small></div>)}
            {queue.length === 0 && <p>监听目录变化后，新文件会出现在这里。</p>}
          </div>
        </aside>
        <section className="desktop-assets">
          <div className="section-title"><div><small>CLOUD LIBRARY</small><h2>{assets.length} 个素材</h2></div><button className="secondary" onClick={refresh}>刷新</button></div>
          <div className="desktop-grid">
            {assets.map((asset) => <article key={asset.id}>
              <AssetThumbnail asset={asset} loadThumbnail={loadThumbnail} loadConverted={loadConverted} onOpen={() => setPreviewAsset(asset)} />
              <strong title={asset.name}>{asset.name}</strong>
              <span>{(asset.size / 1024 / 1024).toFixed(1)} MB · r{asset.revision}</span>
              <div className="asset-card-actions"><button className="secondary" onClick={() => setPreviewAsset(asset)}>预览</button><button onClick={() => download(asset)}>下载</button></div>
            </article>)}
          </div>
        </section>
      </div>
      <AssetPreviewDialog asset={previewAsset} onClose={() => setPreviewAsset(null)} onDownload={download} loadOriginal={loadOriginal} loadConverted={loadConverted} />
    </main>
  )
}

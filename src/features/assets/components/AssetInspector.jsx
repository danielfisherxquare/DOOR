import { useEffect, useRef, useState } from 'react'

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatSize(bytes) {
  if (!Number.isFinite(Number(bytes))) return '—'
  if (Number(bytes) < 1024 * 1024) return `${Math.max(1, Math.round(Number(bytes) / 1024))} KB`
  return `${(Number(bytes) / 1024 / 1024).toFixed(1)} MB`
}

export default function AssetInspector({
  asset,
  open,
  editable,
  folders = [],
  tags = [],
  versions = [],
  versionsLoading = false,
  onClose,
  onUpdate,
  onDownload,
  onDelete,
  onUploadVersion,
  onDownloadVersion,
}) {
  const closeButtonRef = useRef(null)
  const versionInputRef = useRef(null)
  const [name, setName] = useState(asset?.name || '')
  const [rating, setRating] = useState(asset?.rating ?? 0)
  const [folderId, setFolderId] = useState(asset?.folderId || '')
  const [note, setNote] = useState(asset?.note || '')
  const [tagIds, setTagIds] = useState(() => new Set(asset?.tags?.map((tag) => tag.id) || []))

  useEffect(() => {
    setName(asset?.name || '')
    setRating(asset?.rating ?? 0)
    setFolderId(asset?.folderId || '')
    setNote(asset?.note || '')
    setTagIds(new Set(asset?.tags?.map((tag) => tag.id) || []))
  }, [asset])

  useEffect(() => {
    if (open) closeButtonRef.current?.focus()
  }, [open])

  if (!open || !asset) return null

  return (
    <aside className="asset-inspector" aria-label="素材详情">
      <header>
        <div>
          <span className="asset-inspector__eyebrow">{asset.kind}</span>
          <h2>{asset.name}</h2>
        </div>
        <button ref={closeButtonRef} type="button" className="icon-button" onClick={onClose} aria-label="关闭详情">
          <span className="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </header>

      <div className="asset-inspector__body">
        <label htmlFor="asset-inspector-name">文件名</label>
        <input id="asset-inspector-name" value={name} onChange={(event) => setName(event.target.value)} disabled={!editable} />

        <label htmlFor="asset-inspector-folder">文件夹</label>
        <select id="asset-inspector-folder" value={folderId} onChange={(event) => setFolderId(event.target.value)} disabled={!editable}>
          <option value="">未归档</option>
          {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
        </select>

        <fieldset disabled={!editable}>
          <legend>评分</legend>
          <div className="asset-rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <button key={value} type="button" aria-label={`${value} 星`} aria-pressed={rating === value} onClick={() => setRating(rating === value ? 0 : value)}>
                <span className="material-symbols-outlined" aria-hidden="true">{value <= rating ? 'star' : 'star_outline'}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="asset-tag-picker" disabled={!editable}>
          <legend>标签</legend>
          {tags.map((tag) => (
            <label key={tag.id}>
              <input type="checkbox" checked={tagIds.has(tag.id)} onChange={() => setTagIds((current) => {
                const next = new Set(current)
                if (next.has(tag.id)) next.delete(tag.id)
                else next.add(tag.id)
                return next
              })} />
              <i style={{ '--tag-color': tag.color }} />{tag.name}
            </label>
          ))}
          {tags.length === 0 && <p>在左侧新建标签后即可关联。</p>}
        </fieldset>

        <label htmlFor="asset-inspector-note">备注</label>
        <textarea id="asset-inspector-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={5000} disabled={!editable} placeholder="记录用途、版权或交付说明" />

        <dl>
          <div><dt>类型</dt><dd>{asset.mimeType}</dd></div>
          <div><dt>尺寸</dt><dd>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : '—'}</dd></div>
          <div><dt>版本</dt><dd>v{asset.currentVersion} / r{asset.revision}</dd></div>
          <div><dt>更新</dt><dd>{formatDate(asset.updatedAt)}</dd></div>
          <div><dt>SHA-256</dt><dd className="asset-hash" title={asset.sha256}>{asset.sha256.slice(0, 16)}…</dd></div>
        </dl>

        <section className="asset-versions" aria-labelledby="asset-version-heading">
          <div className="asset-versions__heading">
            <div><span>VERSION HISTORY</span><h3 id="asset-version-heading">版本记录</h3></div>
            {editable && <button type="button" className="button button--secondary" onClick={() => versionInputRef.current?.click()}>
              <span className="material-symbols-outlined" aria-hidden="true">upgrade</span>上传新版本
            </button>}
          </div>
          <input ref={versionInputRef} className="asset-file-input" type="file" onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onUploadVersion(file)
            event.target.value = ''
          }} />
          {versionsLoading && <p role="status">正在载入版本…</p>}
          {!versionsLoading && versions.map((version) => (
            <article key={version.id}>
              <div><strong>v{version.version}</strong><span>{version.fileName}</span><small>{formatSize(version.size)} · {formatDate(version.createdAt)}</small></div>
              <button type="button" className="icon-button" onClick={() => onDownloadVersion(version)} aria-label={`下载版本 ${version.version}`}>
                <span className="material-symbols-outlined" aria-hidden="true">download</span>
              </button>
            </article>
          ))}
        </section>
      </div>

      <footer>
        <button type="button" className="button button--secondary" onClick={() => onDownload(asset)}>
          <span className="material-symbols-outlined" aria-hidden="true">download</span>下载
        </button>
        {editable && (
          <button type="button" className="button button--primary" disabled={!name.trim()} onClick={() => onUpdate({
            name: name.trim(),
            rating: rating || null,
            folderId: folderId || null,
            note: note.trim() || null,
            tagIds: [...tagIds],
            baseRevision: asset.revision,
          })}>
            保存修改
          </button>
        )}
        {editable && <button type="button" className="button button--danger-link" onClick={() => onDelete(asset)}>移入回收站</button>}
      </footer>
    </aside>
  )
}

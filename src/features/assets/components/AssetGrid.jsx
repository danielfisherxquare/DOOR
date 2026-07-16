import AssetThumbnail from './AssetThumbnail.jsx'

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

export default function AssetGrid({
  items,
  selectedIds,
  layout = 'grid',
  isLoading,
  hasMore,
  onSelectionChange,
  onOpen,
  onLoadMore,
}) {
  function select(event, assetId) {
    const next = new Set(event.metaKey || event.ctrlKey ? selectedIds : [])
    if (next.has(assetId)) next.delete(assetId)
    else next.add(assetId)
    onSelectionChange([...next])
  }

  if (!isLoading && items.length === 0) {
    return (
      <div className="asset-empty" role="status">
        <span className="material-symbols-outlined" aria-hidden="true">photo_library</span>
        <strong>这里还没有素材</strong>
        <p>拖入图片、视频或设计文件，上传完成后团队立即可见。</p>
      </div>
    )
  }

  return (
    <div className="asset-grid-wrap">
      <div className={`asset-grid asset-grid--${layout}`} role="list" aria-busy={isLoading}>
        {items.map((asset) => {
          const selected = selectedIds.has(asset.id)
          return (
            <article
              className={`asset-card${selected ? ' asset-card--selected' : ''}`}
              key={asset.id}
              role="listitem"
            >
              <button
                type="button"
                className="asset-card__preview"
                aria-label={`选择 ${asset.name}`}
                aria-pressed={selected}
                onClick={(event) => select(event, asset.id)}
                onDoubleClick={() => onOpen(asset.id)}
              >
                <AssetThumbnail asset={asset} />
                <span className="asset-card__selection" aria-hidden="true">
                  <span className="material-symbols-outlined">{selected ? 'check_circle' : 'circle'}</span>
                </span>
              </button>
              <button type="button" className="asset-card__meta" onClick={() => onOpen(asset.id)}>
                <strong title={asset.name}>{asset.name}</strong>
                <span>{formatSize(asset.size)} · v{asset.currentVersion}</span>
              </button>
            </article>
          )
        })}
      </div>
      {hasMore && (
        <button type="button" className="asset-load-more" onClick={onLoadMore} disabled={isLoading}>
          {isLoading ? '正在载入…' : '加载更多'}
        </button>
      )}
    </div>
  )
}

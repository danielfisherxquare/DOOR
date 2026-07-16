import { useEffect, useMemo, useRef, useState } from 'react'
import type { AssetItem } from '@arcspro/asset-client'

type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'font' | 'converted' | 'unsupported'

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'xml', 'csv', 'tsv', 'yaml', 'yml', 'html', 'css', 'scss',
  'js', 'jsx', 'ts', 'tsx', 'vue', 'py', 'rb', 'php', 'java', 'kt', 'swift', 'go', 'rs', 'sql', 'sh', 'log',
])
const NATIVE_IMAGE_EXTENSIONS = new Set(['svg', 'png', 'jpg', 'jpeg', 'jpe', 'webp', 'gif', 'bmp', 'ico', 'avif'])
const CONVERTED_IMAGE_EXTENSIONS = new Set([
  'psd', 'psb', 'psdt', 'ai', 'eps', 'ps', 'heic', 'heif', 'tif', 'tiff', 'tga', 'hdr', 'exr', 'dds',
  'ppm', 'pnm', 'pgm', 'pdd', 'pcx', 'pbm', 'pam', 'mpo', 'mng', 'miff', 'jpx', 'jps', 'jpf',
  'jpc', 'jp2', 'j2k', 'j2c', 'dib', 'cur', 'cin', 'wmf', 'emf', 'rw2', 'nef', 'dng', 'crw', 'cr3', 'cr2', 'arw',
])
const FONT_EXTENSIONS = new Set(['otf', 'ttf', 'woff', 'woff2'])

function extensionOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() || ''
}

export function previewKindFor(asset: Pick<AssetItem, 'name' | 'mimeType'>): PreviewKind {
  const extension = extensionOf(asset.name)
  const mime = asset.mimeType.toLowerCase()
  if (CONVERTED_IMAGE_EXTENSIONS.has(extension)) return 'converted'
  if (NATIVE_IMAGE_EXTENSIONS.has(extension) || (mime.startsWith('image/') && !extension)) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf' || extension === 'pdf') return 'pdf'
  if (mime.startsWith('text/') || TEXT_EXTENSIONS.has(extension)) return 'text'
  if (mime.startsWith('font/') || FONT_EXTENSIONS.has(extension)) return 'font'
  return 'unsupported'
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export interface AssetPreviewDialogProps {
  asset: AssetItem | null
  onClose: () => void
  onDownload: (asset: AssetItem) => void | Promise<void>
  loadOriginal: (asset: AssetItem) => Promise<Blob>
  loadConverted: (asset: AssetItem) => Promise<Blob>
}

export function AssetPreviewDialog({ asset, onClose, onDownload, loadOriginal, loadConverted }: AssetPreviewDialogProps) {
  const [sourceUrl, setSourceUrl] = useState('')
  const [text, setText] = useState('')
  const [resolvedKind, setResolvedKind] = useState<PreviewKind>('unsupported')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const requestedKind = useMemo(() => asset ? previewKindFor(asset) : 'unsupported', [asset])

  useEffect(() => {
    if (!asset) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    closeButtonRef.current?.focus()
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [asset, onClose])

  useEffect(() => {
    if (!asset) return undefined
    let active = true
    let objectUrl = ''
    let previewFont: FontFace | null = null
    setSourceUrl('')
    setText('')
    setZoom(1)
    setError('')
    setResolvedKind(requestedKind)
    if (requestedKind === 'unsupported') {
      setLoading(false)
      return undefined
    }
    setLoading(true)

    const load = async () => {
      try {
        const blob = requestedKind === 'converted' ? await loadConverted(asset) : await loadOriginal(asset)
        if (!active) return
        if (requestedKind === 'text') {
          if (blob.size > 4 * 1024 * 1024) throw new Error('文本文件超过 4 MB，请下载后查看完整内容')
          const contents = await blob.text()
          if (active) setText(contents)
          return
        }
        objectUrl = URL.createObjectURL(blob)
        if (requestedKind === 'font') {
          previewFont = new FontFace('ArcSproAssetPreview', `url(${objectUrl})`)
          await previewFont.load()
          if (!active) return
          document.fonts.add(previewFont)
        }
        const convertedKind = requestedKind === 'converted'
          ? (blob.type === 'application/pdf' ? 'pdf' : blob.type.startsWith('image/') ? 'image' : 'unsupported')
          : requestedKind
        setResolvedKind(convertedKind)
        setSourceUrl(objectUrl)
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : '预览加载失败')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
      if (previewFont) document.fonts.delete(previewFont)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [asset, loadConverted, loadOriginal, requestedKind])

  if (!asset) return null

  return (
    <div className="preview-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="preview-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-preview-title">
        <header>
          <div>
            <span className="preview-format">{extensionOf(asset.name).toUpperCase() || asset.kind.toUpperCase()}</span>
            <div><h2 id="asset-preview-title">{asset.name}</h2><p>{humanSize(asset.size)} · r{asset.revision} · {asset.mimeType}</p></div>
          </div>
          <div className="preview-actions">
            <button className="secondary" onClick={() => void onDownload(asset)}>下载原文件</button>
            <button ref={closeButtonRef} className="preview-close" onClick={onClose} aria-label="关闭预览">×</button>
          </div>
        </header>
        <div className={`preview-stage preview-${resolvedKind}`}>
          {loading && <div className="preview-status"><i /><strong>正在准备预览</strong><span>大型设计文件首次转码可能需要几十秒</span></div>}
          {!loading && error && <div className="preview-status preview-failed"><strong>无法预览</strong><span>{error}</span><button onClick={() => void onDownload(asset)}>下载原文件</button></div>}
          {!loading && !error && requestedKind === 'unsupported' && <div className="preview-status preview-failed"><strong>暂不支持此格式</strong><span>可以下载原文件并使用本机应用打开。</span><button onClick={() => void onDownload(asset)}>下载原文件</button></div>}
          {!loading && !error && resolvedKind === 'image' && sourceUrl && <img src={sourceUrl} alt={asset.name} style={{ transform: `scale(${zoom})` }} />}
          {!loading && !error && resolvedKind === 'video' && sourceUrl && <video src={sourceUrl} controls playsInline />}
          {!loading && !error && resolvedKind === 'audio' && sourceUrl && <div className="audio-preview"><span>♪</span><strong>{asset.name}</strong><audio src={sourceUrl} controls /></div>}
          {!loading && !error && resolvedKind === 'pdf' && sourceUrl && <iframe src={sourceUrl} title={`${asset.name} PDF 预览`} />}
          {!loading && !error && resolvedKind === 'text' && <pre>{text}</pre>}
          {!loading && !error && resolvedKind === 'font' && sourceUrl && <div className="font-preview" style={{ fontFamily: 'ArcSproAssetPreview' }}><span>字体预览</span><strong>天地玄黄 ABC xyz 0123</strong><p>设计，让信息清晰地抵达。</p></div>}
        </div>
        {resolvedKind === 'image' && sourceUrl && !error && <footer><span>缩放 {Math.round(zoom * 100)}%</span><div><button className="secondary" onClick={() => setZoom((value) => Math.max(.25, value - .25))}>－</button><button className="secondary" onClick={() => setZoom(1)}>适合窗口</button><button className="secondary" onClick={() => setZoom((value) => Math.min(4, value + .25))}>＋</button></div></footer>}
      </section>
    </div>
  )
}

export interface AssetThumbnailProps {
  asset: AssetItem
  loadThumbnail: (asset: AssetItem) => Promise<Blob>
  loadConverted: (asset: AssetItem) => Promise<Blob>
  onOpen: () => void
}

export function AssetThumbnail({ asset, loadThumbnail, loadConverted, onOpen }: AssetThumbnailProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  useEffect(() => {
    const shouldLoadConverted = !asset.thumbnailUrl && previewKindFor(asset) === 'converted'
    if (!asset.thumbnailUrl && !shouldLoadConverted) return undefined
    let active = true
    let objectUrl = ''
    const loader = shouldLoadConverted ? loadConverted : loadThumbnail
    loader(asset).then((blob) => {
      if (!active) return
      objectUrl = URL.createObjectURL(blob)
      setThumbnailUrl(objectUrl)
    }).catch(() => {})
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [asset, loadConverted, loadThumbnail])
  const label = extensionOf(asset.name).toUpperCase() || asset.kind.toUpperCase()
  return <button className="asset-thumbnail" onClick={onOpen} aria-label={`预览 ${asset.name}`}>{thumbnailUrl ? <img src={thumbnailUrl} alt="" /> : <><span>{label}</span><small>点击预览</small></>}</button>
}

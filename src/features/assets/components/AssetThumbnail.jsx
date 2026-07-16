import { useEffect, useState } from 'react'
import { assetClient } from '../../../api/assets.js'

const KIND_ICONS = {
  video: 'movie',
  audio: 'audio_file',
  document: 'description',
  design: 'design_services',
  archive: 'folder_zip',
  other: 'draft',
}

export default function AssetThumbnail({ asset }) {
  const [source, setSource] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let objectUrl = ''
    if (!asset.thumbnailUrl) {
      setSource('')
      setFailed(false)
      return undefined
    }
    assetClient.getThumbnail(asset.id)
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setSource(objectUrl)
        setFailed(false)
      })
      .catch(() => active && setFailed(true))
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [asset.id, asset.thumbnailUrl])

  if (source && !failed) return <img src={source} alt="" loading="lazy" />
  return (
    <span className="asset-thumbnail__fallback" aria-hidden="true">
      <span className="material-symbols-outlined">{KIND_ICONS[asset.kind] || 'draft'}</span>
      <small>{asset.kind.toUpperCase()}</small>
    </span>
  )
}

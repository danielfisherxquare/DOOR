import { useMemo } from 'react'
import { getReadinessIcon } from './TerrainStatusPanels'

function getDeliveryGroup(fileName) {
  if (/bambu-print\.3mf$/i.test(fileName)) return '推荐下载'
  if (/print-kit\.3mf$/i.test(fileName)) return '备用 3MF'
  if (/manifest\.json$|bambu-print-guide\.txt$/i.test(fileName)) return '记录与说明'
  if (/satellite-texture|geometry-preview|\.glb$/i.test(fileName)) return '预览文件'
  return '可打印部件'
}

function getDeliveryFileBadge(fileName) {
  if (/bambu-print\.3mf$/i.test(fileName)) return 'Bambu 3MF'
  if (/print-kit\.3mf$/i.test(fileName)) return '通用 3MF'
  if (/bambu-print-guide\.txt$/i.test(fileName)) return '说明'
  if (/manifest\.json$/i.test(fileName)) return 'manifest'
  if (/satellite-texture/i.test(fileName)) return '贴图'
  if (/geometry-preview|\.glb$/i.test(fileName)) return '预览'
  if (/\.stl$/i.test(fileName)) return 'STL'
  return '文件'
}

export function getBambuHandoffFromManifest(manifest) {
  if (!manifest?.print?.bambu) return null
  return manifest.print.bambu || null
}

export function BambuHandoffCard({ handoff, files = [], disabled = false, onDownload }) {
  if (!handoff?.materialSlots?.length) return null
  const profile = handoff.printerProfile || {}
  const preflight = handoff.preflight
  const packageFile = files.find((file) => file.name === handoff.package3mf)
  const guideFile = files.find((file) => file.name === handoff.guideFile)
  const canDownloadPackage = Boolean(packageFile && onDownload)
  const canDownloadGuide = Boolean(guideFile && onDownload)

  return (
    <div className="terrain-model-bambu-card">
      <div className="terrain-model-bambu-card__head">
        <span className="material-symbols-outlined">deployed_code</span>
        <div>
          <span>拓竹打印包</span>
          <strong>{handoff.package3mf}</strong>
          <p>
            {profile.printerSettingsId || '-'} / {profile.filamentSettingsId || '-'}
          </p>
        </div>
      </div>
      <div className="terrain-model-bambu-card__notice">
        <span className="material-symbols-outlined">rule_settings</span>
        <p>Bambu Studio 打开后按耗材槽核对颜色；如弹出材料重映射，按下方槽位对应。</p>
      </div>
      <div className="terrain-model-bambu-card__actions">
        <button type="button" disabled={disabled || !canDownloadPackage} onClick={() => packageFile && onDownload(packageFile)}>
          <span className="material-symbols-outlined">download</span>
          <span>下载拓竹 3MF</span>
        </button>
        <button type="button" disabled={disabled || !canDownloadGuide} onClick={() => guideFile && onDownload(guideFile)}>
          <span className="material-symbols-outlined">article</span>
          <span>查看打印说明</span>
        </button>
      </div>
      {preflight?.checks?.length ? (
        <div className={`terrain-model-bambu-preflight terrain-model-bambu-preflight--${preflight.status}`}>
          <div className="terrain-model-bambu-preflight__head">
            <div>
              <span>打印前检查</span>
              <strong>{preflight.label}</strong>
            </div>
            <span>{preflight.warnings?.length ? `${preflight.warnings.length} 项复核` : '全部通过'}</span>
          </div>
          <div className="terrain-model-bambu-preflight__checks">
            {preflight.checks.map((check) => (
              <div key={check.key} className={`terrain-model-bambu-preflight__check terrain-model-bambu-preflight__check--${check.status}`}>
                <span className="material-symbols-outlined">{getReadinessIcon(check.status)}</span>
                <div>
                  <strong>{check.label}</strong>
                  <p>{check.shortDetail || check.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="terrain-model-bambu-slots" aria-label="耗材槽">
        {handoff.materialSlots.map((slot) => (
          <div key={slot.slot} className="terrain-model-bambu-slot">
            <span className="terrain-model-bambu-slot__swatch" style={{ '--bambu-slot-color': slot.color }} />
            <div>
              <span>耗材槽 {slot.slot}</span>
              <strong>
                {slot.filamentType || 'PLA'} / {slot.color}
              </strong>
              <div className="terrain-model-bambu-slot__parts">
                {(slot.parts?.length ? slot.parts : ['未使用']).map((part) => (
                  <span key={part}>{part}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TerrainDeliveryPanel({ files, manifest, model, exportBlocked, onDownload }) {
  const bambuHandoff = useMemo(() => getBambuHandoffFromManifest(manifest), [manifest])
  const groups = ['推荐下载', '备用 3MF', '可打印部件', '预览文件', '记录与说明']
    .map((label) => ({ label, files: files.filter((file) => getDeliveryGroup(file.name) === label) }))
    .filter((group) => group.files.length)

  if (!files.length) {
    return (
      <section className="terrain-model-delivery terrain-model-delivery--empty">
        <div className="terrain-model-delivery__head">
          <div>
            <span>交付清单</span>
            <strong>等待模型</strong>
          </div>
        </div>
        <p>生成模型后，这里会按核心包、可打印部件和记录文件分组展示。</p>
      </section>
    )
  }

  return (
    <section className="terrain-model-delivery">
      <div className="terrain-model-delivery__head">
        <div>
          <span>交付清单</span>
          <strong>{files.length} 个文件</strong>
        </div>
      </div>
      <BambuHandoffCard
        handoff={bambuHandoff}
        files={files}
        disabled={Boolean(!model || exportBlocked)}
        onDownload={onDownload}
      />
      {groups.map((group) => (
        <div key={group.label} className="terrain-model-delivery__group">
          <span>{group.label}</span>
          <div className="terrain-model-downloads">
            {group.files.map((file) => (
              <button key={file.name} type="button" disabled={!model || exportBlocked} onClick={() => onDownload(file)}>
                <span className="material-symbols-outlined">download</span>
                <span className="terrain-model-downloads__badge">{getDeliveryFileBadge(file.name)}</span>
                <span>{file.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

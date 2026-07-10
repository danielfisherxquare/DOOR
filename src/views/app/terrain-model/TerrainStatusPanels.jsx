export function formatNumber(value, suffix = '') {
  return Number.isFinite(value) ? `${Number(value).toFixed(1)}${suffix}` : '-'
}

function firstFinite(...values) {
  return values.find((value) => Number.isFinite(value))
}

export function normalizeReliefMode(value) {
  if (value === 'print-readable') return 'print-readable'
  if (value === 'terrain-forward') return 'terrain-forward'
  return 'realistic'
}

export function getReliefModeLabel(value) {
  const mode = normalizeReliefMode(value)
  if (mode === 'print-readable') return '打印可读'
  if (mode === 'terrain-forward') return '地貌优先'
  return '真实优先'
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 100)
}

function getReliefTone(multiplier) {
  if (!Number.isFinite(multiplier)) return { label: '等待轨迹', tone: 'muted' }
  if (multiplier <= 1.2) return { label: '接近真实', tone: 'real' }
  if (multiplier <= 3) return { label: '轻微增强', tone: 'soft' }
  if (multiplier <= 6) return { label: '成品可读', tone: 'print' }
  return { label: '夸张明显', tone: 'high' }
}

function getReliefMeterData(model, recommendation, options) {
  const reliefMode = normalizeReliefMode(model?.stats?.reliefMode || recommendation?.mode || options.reliefMode)
  const realReliefMm = firstFinite(model?.stats?.realScaleReliefMm, recommendation?.realScaleReliefMm)
  const reliefMm = firstFinite(model?.stats?.reliefMm, Number(options.maxReliefMm))
  const multiplier = firstFinite(
    model?.stats?.verticalExaggeration,
    realReliefMm > 0 && reliefMm > 0 ? reliefMm / realReliefMm : null,
    recommendation?.verticalExaggeration,
  )
  const percent = clampPercent((((multiplier || 1) - 1) / 3) * 100)
  const tone = getReliefTone(multiplier)
  return {
    reliefMm,
    realReliefMm,
    multiplier,
    reliefMode,
    modeLabel: getReliefModeLabel(reliefMode),
    markerPercent: percent,
    ...tone,
  }
}

export function ReliefScaleMeter({ model, recommendation, options }) {
  const meter = getReliefMeterData(model, recommendation, options)
  const valueLabel = model ? '当前模型起伏' : '当前设置起伏'

  return (
    <div
      className="terrain-model-relief-meter"
      aria-label="起伏倍率展示器"
      style={{ '--relief-meter-percent': `${meter.markerPercent}%` }}
    >
      <div className="terrain-model-relief-meter__head">
        <div>
          <span>起伏倍率 · 当前模式</span>
          <strong>
            {meter.modeLabel} / {formatNumber(meter.multiplier, 'x')}
          </strong>
        </div>
        <span className={`terrain-model-relief-meter__status terrain-model-relief-meter__status--${meter.tone}`}>
          {meter.label}
        </span>
      </div>
      <div className="terrain-model-relief-meter__values">
        <div>
          <span>{valueLabel}</span>
          <strong>{formatNumber(meter.reliefMm, ' mm')}</strong>
        </div>
        <div>
          <span>真实比例起伏</span>
          <strong>{formatNumber(meter.realReliefMm, ' mm')}</strong>
        </div>
        <div>
          <span>当前模式</span>
          <strong>{meter.modeLabel}</strong>
        </div>
      </div>
      <div className="terrain-model-relief-meter__track" aria-hidden="true">
        <span className="terrain-model-relief-meter__fill" />
        <span className="terrain-model-relief-meter__marker" />
      </div>
      <div className="terrain-model-relief-meter__ticks" aria-hidden="true">
        <span>1x</span>
        <span>2x</span>
        <span>3x</span>
        <span>4x+</span>
      </div>
    </div>
  )
}

export function getReadinessIcon(status) {
  if (status === 'blocked') return 'error'
  if (status === 'review') return 'rule_settings'
  return 'check_circle'
}

export function PrintReadinessPanel({ readiness }) {
  if (!readiness) return null

  return (
    <section className={`terrain-model-readiness terrain-model-readiness--${readiness.status}`} aria-label="生产检查">
      <div className="terrain-model-readiness__head">
        <div>
          <span>生产检查</span>
          <strong>{readiness.label}</strong>
        </div>
        <span className={`terrain-model-readiness__badge terrain-model-readiness__badge--${readiness.status}`}>
          {readiness.warnings?.length ? `${readiness.warnings.length} 项需处理` : '全部通过'}
        </span>
      </div>
      <div className="terrain-model-readiness__checks">
        {readiness.checks.map((check) => (
          <div key={check.key} className={`terrain-model-readiness__check terrain-model-readiness__check--${check.status}`}>
            <span className="material-symbols-outlined">{getReadinessIcon(check.status)}</span>
            <div>
              <strong>{check.label}</strong>
              <p>{check.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function getWorkflowState(ready, active) {
  if (ready) return 'ready'
  if (active) return 'active'
  return 'idle'
}

export function TerrainWorkflowStrip({
  track,
  fileName,
  demRaster,
  demFileName,
  useSampledTerrain,
  model,
  readiness,
  highPrecisionRecommendation,
  surfaceTexture,
  exportFiles,
}) {
  const steps = [
    {
      key: 'data',
      icon: 'upload_file',
      title: '数据',
      value: fileName || '等待 GPX',
      detail: demRaster ? demFileName || demRaster.sourceName || '高精 DEM' : useSampledTerrain ? '在线高程待采样' : 'GPX 高程',
      state: getWorkflowState(Boolean(track), false),
    },
    {
      key: 'terrain',
      icon: 'terrain',
      title: '地形',
      value: model
        ? `${model.terrain.rows} x ${model.terrain.cols}`
        : highPrecisionRecommendation
          ? `${highPrecisionRecommendation.gridRows} x ${highPrecisionRecommendation.gridCols}`
          : '等待生成',
      detail: model?.terrain?.precision?.gridSpacingMm
        ? `${formatNumber(model.terrain.precision.gridSpacingMm.min, ' mm')} 面网格`
        : '建议会随 GPX 自动更新',
      state: getWorkflowState(Boolean(model), Boolean(track)),
    },
    {
      key: 'print',
      icon: 'print',
      title: '打印',
      value: readiness?.label || '未检查',
      detail: model
        ? `${formatNumber(model.stats.reliefMm, ' mm')} 起伏 / ${formatNumber(model.stats.verticalExaggeration, 'x')}`
        : '生成后判断可打印性',
      state:
        readiness?.status === 'ready'
          ? 'ready'
          : readiness?.status === 'blocked'
            ? 'blocked'
            : getWorkflowState(Boolean(readiness), Boolean(model)),
    },
    {
      key: 'export',
      icon: 'inventory_2',
      title: '交付',
      value: exportFiles.length ? `${exportFiles.length} 个文件` : '等待模型',
      detail: surfaceTexture ? '含贴图 GLB' : '3MF / STL / manifest',
      state: getWorkflowState(exportFiles.length > 0, Boolean(model)),
    },
  ]

  return (
    <section className="terrain-model-workflow" aria-label="生成工作流">
      {steps.map((step, index) => (
        <div key={step.key} className={`terrain-model-workflow__step terrain-model-workflow__step--${step.state}`}>
          <span className="terrain-model-workflow__index">{index + 1}</span>
          <span className="material-symbols-outlined terrain-model-workflow__icon">{step.icon}</span>
          <div className="terrain-model-workflow__copy">
            <span>{step.title}</span>
            <strong>{step.value}</strong>
            <p>{step.detail}</p>
          </div>
        </div>
      ))}
    </section>
  )
}

export function ControlSection({ icon, title, description, children, collapsible = false, defaultOpen = true }) {
  const content = (
    <>
      <div className="terrain-model-control-section__head">
        <span className="material-symbols-outlined">{icon}</span>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <div className="terrain-model-control-section__grid">{children}</div>
    </>
  )

  if (collapsible) {
    return (
      <details className="terrain-model-control-section terrain-model-control-section--collapsible" open={defaultOpen}>
        <summary>
          <span className="material-symbols-outlined">{icon}</span>
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          <span className="material-symbols-outlined terrain-model-control-section__chevron">expand_more</span>
        </summary>
        <div className="terrain-model-control-section__grid">{children}</div>
      </details>
    )
  }

  return <section className="terrain-model-control-section">{content}</section>
}

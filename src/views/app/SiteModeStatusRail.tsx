import type { SiteProviderStatus } from '../../services/siteModeApi'

type StudioSaveState = 'readonly' | 'saved' | 'dirty' | 'saving' | 'error' | 'conflict'

interface SiteImageryRuntime {
  loaded: number
  failed: number
  total: number
  status: 'loading' | 'ready' | 'degraded' | 'failed' | 'unavailable'
  message: string
  retryable: boolean
}

interface SiteModeStatusRailProps {
  providerStatus: SiteProviderStatus | null
  imageryRuntime: SiteImageryRuntime | null
  canReloadImagery: boolean
  bakeStatus: 'ready' | 'degraded' | 'failed' | null
  warnings: string[]
  saveState: StudioSaveState
  rebaking: boolean
  onRebake: () => void
  onReloadImagery: () => void
}

const SOURCE_LABELS = {
  imagery: '卫星影像',
  terrain: '地形',
  buildings: '建筑白模',
} as const

const STATUS_LABELS = {
  loading: '加载中',
  ready: '可用',
  degraded: '降级',
  failed: '失败',
  unavailable: '不可用',
} as const

export default function SiteModeStatusRail({
  providerStatus,
  imageryRuntime,
  canReloadImagery,
  bakeStatus,
  warnings,
  saveState,
  rebaking,
  onRebake,
  onReloadImagery,
}: SiteModeStatusRailProps) {
  const summaryStatus = imageryRuntime?.status === 'failed'
    ? 'failed'
    : imageryRuntime?.status === 'degraded' || imageryRuntime?.status === 'unavailable'
      ? 'degraded'
      : bakeStatus || 'loading'
  const summaryLabel = rebaking
    ? '正在重新生成'
    : imageryRuntime?.status === 'loading'
      ? '正在加载卫星纹理'
      : imageryRuntime?.status === 'failed'
        ? '卫星纹理加载失败'
        : imageryRuntime?.status === 'degraded'
          ? '部分卫星纹理失败'
          : imageryRuntime?.status === 'unavailable'
            ? '没有可用卫星纹理'
            : bakeStatus === 'degraded'
              ? '部分数据降级'
              : bakeStatus === 'failed'
                ? '生成失败'
                : '服务端已持久化'

  return (
    <aside className="site-mode__status-rail" aria-label="场地数据状态" aria-live="polite">
      <div className="site-mode__status-summary">
        <strong>场地数据</strong>
        <span className={`site-mode__bake-state is-${summaryStatus}`}>
          {summaryLabel}
        </span>
      </div>

      {providerStatus ? (
        <div className="site-mode__provider-list">
          {(Object.keys(SOURCE_LABELS) as Array<keyof typeof SOURCE_LABELS>).map((key) => {
            const source = providerStatus[key]
            return (
              <div key={key} className="site-mode__provider-row">
                <span>{SOURCE_LABELS[key]}</span>
                <span className={`site-mode__provider-state is-${source.status}`}>
                  {STATUS_LABELS[source.status]}
                  {Number.isFinite(source.itemCount) ? ` · ${source.itemCount}` : ''}
                </span>
                {source.message ? <small title={source.message}>{source.message}</small> : null}
              </div>
            )
          })}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <details className="site-mode__warning-details">
          <summary>{warnings.length} 项数据警告</summary>
          <ul>
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </details>
      ) : null}

      <div className="site-mode__status-actions">
        <button
          type="button"
          className="site-mode__rebake"
          onClick={onReloadImagery}
          disabled={!canReloadImagery}
          title="只重新请求浏览器纹理，不保存场地或推进项目版本"
        >
          重新加载纹理
        </button>
        <button
          type="button"
          className="site-mode__rebake"
          onClick={onRebake}
          disabled={rebaking || saveState !== 'saved'}
        >
          {rebaking ? '重新生成中…' : '重新生成参考数据'}
        </button>
      </div>
    </aside>
  )
}

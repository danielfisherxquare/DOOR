import type {
  MapProviderKey,
  MapProviderRuntimeEntry,
  MapProviderRuntimeSnapshot,
  MapProviderStatus,
} from '../../utils/map/providerRuntimeStatus'

interface MapProviderStatusHudProps {
  /** Current runtime state for imagery, terrain, and building providers. */
  value: MapProviderRuntimeSnapshot
  /** Retries only the selected provider without reloading the page. */
  onRetry: (_provider: MapProviderKey) => void
}

const PROVIDER_ORDER: MapProviderKey[] = ['imagery', 'terrain', 'buildings']

const PROVIDER_LABELS: Record<MapProviderKey, string> = {
  imagery: '底图',
  terrain: '地形',
  buildings: '建筑',
}

const STATUS_LABELS: Record<MapProviderStatus, string> = {
  loading: '加载中',
  ready: '已连接',
  degraded: '降级运行',
  failed: '加载失败',
  unavailable: '不可用',
}

const STATUS_ICONS: Record<MapProviderStatus, string> = {
  loading: 'progress_activity',
  ready: 'check_circle',
  degraded: 'warning',
  failed: 'error',
  unavailable: 'block',
}

function canRetryProvider(entry: MapProviderRuntimeEntry): boolean {
  return entry.retryable && ['degraded', 'failed'].includes(entry.status)
}

export default function MapProviderStatusHud({ value, onRetry }: MapProviderStatusHudProps) {
  const hasBlockingFailure = value.overall === 'failed' || value.overall === 'unavailable'

  return (
    <section
      className={`map-provider-status is-${value.overall}`}
      role={hasBlockingFailure ? 'alert' : 'status'}
      aria-live="polite"
      aria-label="三维地图资源状态"
      data-testid="map-provider-status"
      data-status={value.overall}
    >
      <div className="map-provider-status__heading">
        <span>资源连接</span>
        <strong>{STATUS_LABELS[value.overall]}</strong>
      </div>
      <ul className="map-provider-status__list">
        {PROVIDER_ORDER.map((key) => {
          const entry = value.sources[key]
          const isRequired = value.requiredProviders.includes(key)
          const itemCountLabel = Number.isFinite(entry.itemCount) ? `${entry.itemCount} 项` : null

          return (
            <li
              key={key}
              className={`map-provider-status__item is-${entry.status}`}
              data-provider={key}
              data-status={entry.status}
            >
              <span
                className={`map-provider-status__icon material-symbols-outlined is-${entry.status}`}
                aria-hidden="true"
              >
                {STATUS_ICONS[entry.status]}
              </span>
              <span className="map-provider-status__copy">
                <span className="map-provider-status__title-row">
                  <strong>{PROVIDER_LABELS[key]}</strong>
                  <span>{entry.provider}</span>
                  {!isRequired && <span className="map-provider-status__optional">可选</span>}
                </span>
                <span className="map-provider-status__message">
                  {entry.message || STATUS_LABELS[entry.status]}
                  {itemCountLabel ? ` · ${itemCountLabel}` : ''}
                </span>
              </span>
              <span className={`map-provider-status__badge is-${entry.status}`}>
                {STATUS_LABELS[entry.status]}
              </span>
              {canRetryProvider(entry) && (
                <button
                  type="button"
                  className="map-provider-status__retry"
                  onClick={() => onRetry(key)}
                  aria-label={`重试${PROVIDER_LABELS[key]}服务`}
                >
                  重试
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

import { Link } from 'react-router-dom'
import './app-h5-surface.css'

function MaterialIcon({ icon }) {
  if (!icon) return null
  return <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
}

function renderSlot(content, className, inlineTag, blockTag = 'div') {
  if (content === null || content === undefined) return null
  const isPlainText = typeof content === 'string' || typeof content === 'number'
  const Tag = isPlainText ? inlineTag : blockTag
  return <Tag className={className}>{content}</Tag>
}

export function AppH5MetricStrip({ items = [], className = '' }) {
  if (!items.length) return null

  return (
    <section className={`app-h5-metric-strip ${className}`.trim()} aria-label="应用概览">
      {items.map((item) => (
        <article key={item.key || item.label} className="app-h5-metric-strip__item">
          <span className="app-h5-metric-strip__label">{item.label}</span>
          <strong className="app-h5-metric-strip__value">{item.value}</strong>
          {item.meta ? <span className="app-h5-metric-strip__meta">{item.meta}</span> : null}
        </article>
      ))}
    </section>
  )
}

export function AppH5Surface({
  eyebrow,
  title,
  summary,
  actions,
  metrics = [],
  children,
  className = '',
}) {
  const hasMetrics = Array.isArray(metrics) ? metrics.length > 0 : Boolean(metrics)
  const metricsNode = Array.isArray(metrics) ? <AppH5MetricStrip items={metrics} /> : metrics

  return (
    <div className={`app-h5-surface ${className}`.trim()}>
      {(eyebrow || title || summary || actions || hasMetrics) ? (
        <header className="app-h5-surface__header">
          <div className="app-h5-surface__copy">
            {eyebrow ? <span className="app-h5-surface__eyebrow">{eyebrow}</span> : null}
            {title ? <h2 className="app-h5-surface__title">{title}</h2> : null}
            {summary ? <p className="app-h5-surface__summary">{summary}</p> : null}
          </div>
          {actions ? <div className="app-h5-surface__actions">{actions}</div> : null}
          {metricsNode}
        </header>
      ) : null}
      <div className="app-h5-surface__body">{children}</div>
    </div>
  )
}

export function AppH5Section({
  title,
  summary,
  actions,
  children,
  className = '',
}) {
  return (
    <section className={`app-h5-section ${className}`.trim()}>
      {(title || summary || actions) ? (
        <header className="app-h5-section__header">
          <div className="app-h5-section__copy">
            {title ? <h3 className="app-h5-section__title">{title}</h3> : null}
            {summary ? <p className="app-h5-section__summary">{summary}</p> : null}
          </div>
          {actions ? <div className="app-h5-section__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="app-h5-section__body">{children}</div>
    </section>
  )
}

export function AppH5Panel({
  title,
  summary,
  subtitle,
  actions,
  footer,
  children,
  className = '',
  tone = 'default',
}) {
  const resolvedSummary = summary || subtitle

  return (
    <section className={`app-h5-panel app-h5-panel--${tone} ${className}`.trim()}>
      {(title || resolvedSummary || actions) ? (
        <header className="app-h5-panel__header">
          <div className="app-h5-panel__copy">
            {title ? <h3 className="app-h5-panel__title">{title}</h3> : null}
            {resolvedSummary ? <p className="app-h5-panel__summary">{resolvedSummary}</p> : null}
          </div>
          {actions ? <div className="app-h5-panel__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="app-h5-panel__body">{children}</div>
      {footer ? <footer className="app-h5-panel__footer">{footer}</footer> : null}
    </section>
  )
}

export function AppH5Notice({ tone = 'info', children, className = '' }) {
  return (
    <div className={`app-h5-notice app-h5-notice--${tone} ${className}`.trim()}>
      {children}
    </div>
  )
}

export function AppH5Toolbar({ children, className = '' }) {
  return <section className={`app-h5-toolbar ${className}`.trim()}>{children}</section>
}

export function AppH5FilterBar({ children, className = '' }) {
  return <div className={`app-h5-filter-bar ${className}`.trim()}>{children}</div>
}

export function AppH5ContextState({ title, description, action = null }) {
  return (
    <AppH5Panel tone="warning" title={title} summary={description}>
      {action ? <div className="app-h5-context-state__action">{action}</div> : null}
    </AppH5Panel>
  )
}

export function AppH5EmptyState({ title, description, action, icon, className = '' }) {
  return (
    <div className={`app-h5-empty ${className}`.trim()}>
      {icon ? <span className="app-h5-empty__icon" aria-hidden="true">{icon}</span> : null}
      {title ? <h3 className="app-h5-empty__title">{title}</h3> : null}
      {description ? <p className="app-h5-empty__description">{description}</p> : null}
      {action ? <div className="app-h5-empty__action">{action}</div> : null}
    </div>
  )
}

export function AppH5DataTable({ children, mobileCards = null, className = '' }) {
  const hasMobileCards = Boolean(mobileCards)

  return (
    <div className={`app-h5-table-wrap ${hasMobileCards ? 'app-h5-table-wrap--with-mobile-cards' : ''} ${className}`.trim()}>
      <div className="app-h5-table-scroll">
        {children}
      </div>
      {hasMobileCards ? <div className="app-h5-table-cards">{mobileCards}</div> : null}
    </div>
  )
}

export function AppH5DataCard({
  eyebrow,
  title,
  meta,
  fields = [],
  actions,
  children,
  className = '',
}) {
  return (
    <article className={`app-h5-data-card ${className}`.trim()}>
      {(eyebrow || title || meta) ? (
        <header className="app-h5-data-card__header">
          <div className="app-h5-data-card__copy">
            {eyebrow ? <span className="app-h5-data-card__eyebrow">{eyebrow}</span> : null}
            {title ? <strong className="app-h5-data-card__title">{title}</strong> : null}
          </div>
          {meta ? <div className="app-h5-data-card__meta">{meta}</div> : null}
        </header>
      ) : null}
      {fields.length ? (
        <dl className="app-h5-data-card__fields">
          {fields.map((field) => (
            <div key={field.key || field.label} className="app-h5-data-card__field">
              <dt>{field.label}</dt>
              <dd>{field.value === undefined || field.value === null || field.value === '' ? '-' : field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children ? <div className="app-h5-data-card__body">{children}</div> : null}
      {actions ? <footer className="app-h5-data-card__actions">{actions}</footer> : null}
    </article>
  )
}

export function AppH5StatusTag({ children, tone = 'neutral', className = '' }) {
  return <span className={`app-h5-status-tag app-h5-status-tag--${tone} ${className}`.trim()}>{children}</span>
}

export function AppH5DetailPane({
  title,
  subtitle,
  actions,
  children,
  footer,
  className = '',
}) {
  return (
    <aside className={`app-h5-detail-pane ${className}`.trim()}>
      {(title || subtitle || actions) ? (
        <header className="app-h5-detail-pane__header">
          <div className="app-h5-detail-pane__copy">
            {renderSlot(title, 'app-h5-detail-pane__title', 'h3')}
            {renderSlot(subtitle, 'app-h5-detail-pane__subtitle', 'p')}
          </div>
          {actions ? <div className="app-h5-detail-pane__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="app-h5-detail-pane__body">{children}</div>
      {footer ? <footer className="app-h5-detail-pane__footer">{footer}</footer> : null}
    </aside>
  )
}

export function AppH5Tabs({
  items = [],
  className = '',
  ariaLabel = '应用视图',
}) {
  if (!items.length) return null

  return (
    <div className={`app-h5-tabs ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.key || item.label}
          type="button"
          role="tab"
          aria-selected={Boolean(item.active)}
          className={`app-h5-tabs__tab ${item.active ? 'is-active' : ''}`.trim()}
          disabled={item.disabled}
          onClick={item.onClick}
        >
          <MaterialIcon icon={item.icon} />
          <span className="app-h5-tabs__label">{item.label}</span>
          {item.badge !== undefined && item.badge !== null ? (
            <span className="app-h5-tabs__badge">{item.badge}</span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

export function AppH5ActionCard({
  to,
  icon,
  title,
  label,
  description,
  meta,
  badge,
  actionLabel = '进入',
  children,
  className = '',
}) {
  const resolvedTitle = title || label
  const resolvedMeta = meta || badge

  const content = (
    <>
      <div className="app-h5-action-card__header">
        <span className="app-h5-action-card__icon">
          <MaterialIcon icon={icon || 'apps'} />
        </span>
        <span className="app-h5-action-card__title">{resolvedTitle}</span>
      </div>
      {description ? <p className="app-h5-action-card__description">{description}</p> : null}
      {children}
      <span className="app-h5-action-card__footer">
        {resolvedMeta ? <span className="app-h5-action-card__meta">{resolvedMeta}</span> : null}
        <span className="app-h5-action-card__action">
          {actionLabel}
          <MaterialIcon icon="arrow_forward" />
        </span>
      </span>
    </>
  )

  if (to) {
    return (
      <Link to={to} className={`app-h5-action-card ${className}`.trim()}>
        {content}
      </Link>
    )
  }

  return (
    <article className={`app-h5-action-card ${className}`.trim()}>
      {content}
    </article>
  )
}

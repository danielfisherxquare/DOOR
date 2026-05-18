import './command-primitives.css'

function renderAction(action, index) {
  if (!action) return null
  if (typeof action === 'string') {
    return <span key={`${action}-${index}`}>{action}</span>
  }
  return <span key={index}>{action}</span>
}

function renderSlot(content, className, inlineTag, blockTag = 'div') {
  if (content === null || content === undefined) return null
  const isPlainText = typeof content === 'string' || typeof content === 'number'
  const Tag = isPlainText ? inlineTag : blockTag
  return <Tag className={className}>{content}</Tag>
}

export function CommandShell({
  eyebrow,
  title,
  summary,
  actions,
  badges = [],
  children,
  className = '',
}) {
  return (
    <section className={`command-shell ${className}`.trim()}>
      <header className="command-shell__header">
        <div className="command-shell__copy">
          <div className="command-shell__badge-row">
            {eyebrow ? <span className="command-shell__eyebrow">{eyebrow}</span> : null}
            {badges.map((badge, index) => renderAction(badge, index))}
          </div>
          {renderSlot(title, 'command-shell__title', 'h2')}
          {renderSlot(summary, 'command-shell__summary', 'p')}
        </div>
        {actions ? <div className="command-shell__actions">{actions}</div> : null}
      </header>
      <div className="command-shell__body">{children}</div>
    </section>
  )
}

/**
 * @param {Object} props
 * @param {React.ReactNode} [props.title]
 * @param {React.ReactNode} [props.subtitle]
 * @param {React.ReactNode} [props.actions]
 * @param {React.ReactNode} [props.children]
 * @param {React.ReactNode} [props.footer]
 * @param {string} [props.className]
 * @param {string} [props.tone]
 */
export function CommandPanel({
  title,
  subtitle,
  actions,
  children,
  footer,
  className = '',
  tone = 'default',
}) {
  return (
    <section className={`command-panel command-panel--${tone} ${className}`.trim()}>
      {(title || subtitle || actions) ? (
        <header className="command-panel__header">
          <div className="command-panel__copy">
            {renderSlot(title, 'command-panel__title', 'h3')}
            {renderSlot(subtitle, 'command-panel__subtitle', 'p')}
          </div>
          {actions ? <div className="command-panel__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="command-panel__body">{children}</div>
      {footer ? <footer className="command-panel__footer">{footer}</footer> : null}
    </section>
  )
}

export function CommandMetricGrid({ items = [], className = '' }) {
  if (!items.length) return null

  return (
    <section className={`command-metric-grid ${className}`.trim()}>
      {items.map((item) => (
        <article key={item.key || item.label} className="command-metric-card">
          <span className="command-metric-card__label">{item.label}</span>
          <span className="command-metric-card__value">{item.value}</span>
          {item.meta ? <span className="command-metric-card__meta">{item.meta}</span> : null}
          {item.pill ? <span className="command-metric-card__pill">{item.pill}</span> : null}
        </article>
      ))}
    </section>
  )
}

export function CommandStatStrip({ items = [], className = '' }) {
  if (!items.length) return null

  return (
    <section className={`command-stat-strip ${className}`.trim()}>
      {items.map((item) => (
        <article key={item.key || item.label} className="command-stat-strip__card">
          <span className="command-stat-strip__label">{item.label}</span>
          <span className="command-stat-strip__value">{item.value}</span>
          {item.meta ? <span className="command-stat-strip__meta">{item.meta}</span> : null}
        </article>
      ))}
    </section>
  )
}

/**
 * @param {Object} props
 * @param {React.ReactNode} [props.title]
 * @param {React.ReactNode} [props.description]
 * @param {React.ReactNode} [props.action]
 * @param {React.ReactNode} [props.icon]
 */
export function CommandEmptyState({ title, description, action, icon }) {
  return (
    <div className="command-empty">
      {icon ? <span className="command-empty__icon" aria-hidden="true">{icon}</span> : null}
      <h3 className="command-empty__title">{title}</h3>
      {description ? <p className="command-empty__description">{description}</p> : null}
      {action ? <div className="command-empty__action">{action}</div> : null}
    </div>
  )
}

export function CommandNotice({ tone = 'info', children }) {
  return <div className={`command-notice command-notice--${tone}`}>{children}</div>
}

export function CommandToolbar({ children, className = '' }) {
  return <section className={`command-toolbar ${className}`.trim()}>{children}</section>
}

export function CommandFilterBar({ children, className = '' }) {
  return <div className={`command-filter-bar ${className}`.trim()}>{children}</div>
}

export function ContextRequirementState({ title, description, action = null }) {
  return (
    <CommandPanel tone="warning" title={title} subtitle={description}>
      {action ? <div className="command-context-action">{action}</div> : null}
    </CommandPanel>
  )
}

export function CommandDataTable({ children, className = '', asTable = true }) {
  return (
    <div className={`command-table-wrap ${className}`.trim()}>
      <div className="command-table-scroll">
        {asTable ? (
          <table className="command-table">{children}</table>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

export function CommandStatusTag({ children, tone = 'neutral' }) {
  return <span className={`command-status-tag command-status-tag--${tone}`}>{children}</span>
}

/**
 * @param {Object} props
 * @param {Array<{key: string | number, label: string, icon?: React.ReactNode, completed?: boolean, disabled?: boolean, desc?: string}>} [props.steps]
 * @param {string | number} [props.activeKey]
 * @param {(key: string | number) => void} [props.onChange]
 * @param {string} [props.className]
 * @param {string} [props.ariaLabel]
 */
export function CommandStepRail({
  steps = [],
  activeKey,
  onChange,
  className = '',
  ariaLabel = '流程步骤',
}) {
  if (!steps.length) return null

  return (
    <section className={`command-step-rail ${className}`.trim()} aria-label={ariaLabel}>
      {steps.map((step, index) => {
        const isActive = step.key === activeKey
        const isCompleted = Boolean(step.completed)
        const isDisabled = Boolean(step.disabled)

        return (
          <button
            key={step.key || `${step.label}-${index}`}
            type="button"
            className={`command-step ${isActive ? 'is-active' : ''} ${isCompleted ? 'is-complete' : ''}`.trim()}
            disabled={isDisabled}
            onClick={() => {
              if (!isDisabled && onChange) {
                onChange(step.key)
              }
            }}
          >
            <span className="command-step__token">{step.icon || String(index + 1).padStart(2, '0')}</span>
            <span className="command-step__copy">
              <span className="command-step__label">{step.label}</span>
              {step.desc ? <span className="command-step__desc">{step.desc}</span> : null}
            </span>
          </button>
        )
      })}
    </section>
  )
}

/**
 * @param {Object} props
 * @param {React.ReactNode} [props.title]
 * @param {React.ReactNode} [props.subtitle]
 * @param {React.ReactNode} [props.actions]
 * @param {React.ReactNode} [props.children]
 * @param {React.ReactNode} [props.footer]
 * @param {string} [props.className]
 */
export function CommandDetailPane({
  title,
  subtitle,
  actions,
  children,
  footer,
  className = '',
}) {
  return (
    <aside className={`command-detail-pane ${className}`.trim()}>
      {(title || subtitle || actions) ? (
        <header className="command-detail-pane__header">
          <div className="command-detail-pane__copy">
            {renderSlot(title, 'command-detail-pane__title', 'h3')}
            {renderSlot(subtitle, 'command-detail-pane__subtitle', 'p')}
          </div>
          {actions ? <div className="command-detail-pane__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="command-detail-pane__body">{children}</div>
      {footer ? <footer className="command-detail-pane__footer">{footer}</footer> : null}
    </aside>
  )
}

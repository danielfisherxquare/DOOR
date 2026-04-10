import {
  CommandDataTable,
  CommandEmptyState,
  CommandNotice,
  CommandPanel,
  CommandShell,
  CommandStatusTag,
  CommandToolbar,
} from '../command/CommandPrimitives'

import './admin-workbench.css'

export function AdminSkeleton({ variant = 'text', width, height, style }) {
  return (
    <div
      className={`admin-skeleton admin-skeleton--${variant}`}
      style={{
        width: width || 'auto',
        height: height || undefined,
        ...style,
      }}
    />
  )
}

export function AdminSectionHeader({ eyebrow, title, description, actions, metrics = [] }) {
  const summary = description || undefined

  return (
    <CommandShell
      eyebrow={eyebrow}
      title={title}
      summary={summary}
      actions={actions || null}
      className="admin-workbench-compat__shell"
    >
      {metrics.length > 0 ? (
        <section className="command-stat-strip admin-workbench-compat__stats">
          {metrics.map((item) => (
            <article key={item.key || item.label} className="command-stat-strip__card">
              <span className="command-stat-strip__label">{item.label}</span>
              <span className="command-stat-strip__value">{item.value}</span>
              {item.meta ? <span className="command-stat-strip__meta">{item.meta}</span> : null}
            </article>
          ))}
        </section>
      ) : null}
    </CommandShell>
  )
}

export function AdminToolbar({ children }) {
  return <CommandToolbar className="admin-workbench-compat__toolbar">{children}</CommandToolbar>
}

export function AdminSurface({ title, subtitle, actions, children, footer }) {
  return (
    <CommandPanel
      title={title}
      subtitle={subtitle}
      actions={actions || null}
      footer={footer || null}
      className="admin-workbench-compat__panel"
    >
      {children}
    </CommandPanel>
  )
}

export function AdminNotice({ tone = 'info', children }) {
  return <CommandNotice tone={tone}>{children}</CommandNotice>
}

export function AdminDataTable({ children }) {
  return <CommandDataTable>{children}</CommandDataTable>
}

export function AdminEmptyState({ icon, title, description, action }) {
  return <CommandEmptyState icon={icon} title={title} description={description} action={action} />
}

export function AdminPagination({ page, totalPages, onPrev, onNext }) {
  if (totalPages <= 1) return null

  return (
    <div className="admin-workbench-compat__pagination">
      <button className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={onPrev}>上一页</button>
      <span className="admin-workbench-compat__pagination-status">{page} / {totalPages}</span>
      <button className="btn btn--ghost btn--sm" disabled={page >= totalPages} onClick={onNext}>下一页</button>
    </div>
  )
}

export function AdminStatusPill({ children, tone = 'neutral' }) {
  return <CommandStatusTag tone={tone}>{children}</CommandStatusTag>
}

import { NavLink } from 'react-router-dom'
import { useInterviewSurface } from './useInterviewSurface'
import './interview-workspace.css'

const MODULE_TABS = [
  { key: 'form', suffix: '', label: '面试面板', end: true },
  { key: 'records', suffix: '/records', label: '面试记录' },
  { key: 'compare', suffix: '/compare', label: '候选人对比' },
]

function joinClassNames(...values) {
  return values.filter(Boolean).join(' ')
}

export default function InterviewWorkspaceShell({
  eyebrow = '候选评估',
  title,
  summary,
  stats = [],
  actions,
  children,
}) {
  const { buildPath, isAppSurface } = useInterviewSurface()

  return (
    <div className="interview-shell">
      <section className="interview-shell__hero">
        <div className="interview-shell__hero-copy">
          <div className="interview-shell__eyebrow-row">
            <span className="interview-shell__eyebrow">{eyebrow}</span>
            <span className="interview-shell__surface-pill">{isAppSurface ? 'APP' : 'ADMIN'}</span>
          </div>
          <h2 className="interview-shell__title">{title}</h2>
          {summary ? <p className="interview-shell__summary">{summary}</p> : null}
        </div>

        {actions ? <div className="interview-shell__actions">{actions}</div> : null}
      </section>

      <nav className="interview-shell__tabs" aria-label="面试模块导航">
        {MODULE_TABS.map((tab) => (
          <NavLink
            key={tab.key}
            end={tab.end}
            to={buildPath(tab.suffix)}
            className={({ isActive }) => joinClassNames('interview-shell__tab', isActive && 'is-active')}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {stats.length ? (
        <section className="interview-stats-grid">
          {stats.map((stat) => (
            <article
              key={stat.label}
              className="interview-stat-card"
              data-tone={stat.tone || 'neutral'}
            >
              <span className="interview-stat-card__label">{stat.label}</span>
              <strong className="interview-stat-card__value">{stat.value}</strong>
              {stat.meta ? <span className="interview-stat-card__meta">{stat.meta}</span> : null}
            </article>
          ))}
        </section>
      ) : null}

      <div className="interview-shell__content">
        {children}
      </div>
    </div>
  )
}

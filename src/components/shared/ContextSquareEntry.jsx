import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

function getSourceLabel(sourceType) {
  if (sourceType === 'explicit') return '显式'
  if (sourceType === 'platform') return '平台'
  return '继承'
}

function getAccessLabel(accessLevel) {
  if (accessLevel === 'editor') return '可编辑'
  if (accessLevel === 'viewer') return '只读'
  return '未设置'
}

export default function ContextSquareEntry({
  roleName,
  contextOptions,
  selectedOrgId,
  selectedRaceId,
  onOrgChange,
  onRaceChange,
  shortcuts = [],
  loading = false,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  const organizations = contextOptions?.organizations || []
  const races = contextOptions?.races || []
  const canSwitchOrg = Boolean(contextOptions?.canSwitchOrg)
  const canSwitchRace = Boolean(contextOptions?.canSwitchRace)

  const selectedRace = useMemo(
    () => races.find((item) => String(item.id) === String(selectedRaceId)) || null,
    [races, selectedRaceId],
  )

  const selectedOrg = useMemo(
    () => organizations.find((item) => String(item.id) === String(selectedOrgId)) || null,
    [organizations, selectedOrgId],
  )

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!rootRef.current) return
      if (rootRef.current.contains(event.target)) return
      setOpen(false)
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  return (
    <div ref={rootRef} className="context-square-entry">
      <button
        type="button"
        className={`context-square-entry__trigger ${open ? 'context-square-entry__trigger--open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        title="上下文入口"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="material-symbols-outlined">tune</span>
      </button>

      {open && (
        <div className="context-square-entry__panel" role="dialog" aria-label="上下文入口">
          <div className="context-square-entry__header">
            <span className="context-square-entry__title">上下文入口</span>
            <span className="context-square-entry__role">{roleName}</span>
          </div>

          {loading ? (
            <div className="context-square-entry__loading">加载中…</div>
          ) : (
            <>
              <div className="context-square-entry__field">
                <span className="context-square-entry__label">机构</span>
                {canSwitchOrg ? (
                  <select
                    value={selectedOrgId || ''}
                    onChange={(event) => onOrgChange?.(event.target.value)}
                    className="context-square-entry__select"
                  >
                    <option value="">请选择机构</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="context-square-entry__readonly">{selectedOrg?.name || '已锁定'}</div>
                )}
              </div>

              <div className="context-square-entry__field">
                <span className="context-square-entry__label">赛事</span>
                <select
                  value={selectedRaceId || ''}
                  onChange={(event) => onRaceChange?.(event.target.value)}
                  className="context-square-entry__select"
                  disabled={!canSwitchRace || races.length === 0}
                >
                  <option value="">请选择赛事</option>
                  {races.map((race) => (
                    <option key={race.id} value={race.id}>{race.raceName || race.name || `赛事 #${race.id}`}</option>
                  ))}
                </select>
              </div>

              {selectedRace && (
                <div className="context-square-entry__race-meta">
                  <span className="context-square-entry__badge">{getSourceLabel(selectedRace.sourceType)}</span>
                  <span className="context-square-entry__badge context-square-entry__badge--accent">{getAccessLabel(selectedRace.accessLevel)}</span>
                  {selectedRace.inheritedAccessLevel && (
                    <span className="context-square-entry__hint">继承: {selectedRace.inheritedAccessLevel}</span>
                  )}
                  {selectedRace.explicitAccessLevel && (
                    <span className="context-square-entry__hint">显式: {selectedRace.explicitAccessLevel}</span>
                  )}
                </div>
              )}

              {shortcuts.length > 0 && (
                <div className="context-square-entry__shortcuts">
                  {shortcuts.map((item) => (
                    <Link key={item.label} to={item.path} className="context-square-entry__shortcut">
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

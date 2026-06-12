import { useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import useWorkspaceStore from '../../features/workspace/workspaceStore'
import { getAvailableWorkspaceSurfaces } from '../../features/workspace/workspaceSession'
import './workspace-entry.css'

export default function LauncherPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isBootstrapping, user, logout, refreshAuthzProfile } = useAuthStore()
  const session = useWorkspaceStore((state) => state.session)
  const setWorkspaceSession = useWorkspaceStore((state) => state.setWorkspaceSession)
  const clearWorkspaceSession = useWorkspaceStore((state) => state.clearWorkspaceSession)

  useEffect(() => {
    if (!isAuthenticated) return
    if (session?.scopeType === 'platform') {
      refreshAuthzProfile({ scopeType: 'platform' })
      return
    }
    if (session?.orgId) {
      refreshAuthzProfile({ orgId: session.orgId, raceId: session.raceId })
    }
  }, [isAuthenticated, refreshAuthzProfile, session?.orgId, session?.raceId, session?.scopeType])

  if (isBootstrapping) {
    return (
      <div className="workspace-entry layout--app">
        <div className="workspace-entry__state">
          <div className="workspace-entry__state-box">
            <div className="route-loader__spinner" aria-hidden="true" />
            <span>正在校验入口权限…</span>
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!session?.orgId && session?.scopeType !== 'platform') {
    return <Navigate to="/workspaces" replace />
  }

  const surfaces = getAvailableWorkspaceSurfaces(user)
  const isPlatformScope = session.scopeType === 'platform'
  const scopeLabel = isPlatformScope ? '平台控制台' : (session.raceName || session.raceId || '机构运营')

  const openSurface = (surface) => {
    if (isPlatformScope && surface.key !== 'admin') {
      navigate(`/workspaces/select?redirect=${encodeURIComponent(surface.defaultPath)}`)
      return
    }

    const path = session[surface.pathKey] || surface.defaultPath
    setWorkspaceSession({ ...session, surface: surface.key })
    navigate(path)
  }

  const handleLogout = async () => {
    clearWorkspaceSession()
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="workspace-entry layout--app">
      <header className="workspace-entry__topbar">
        <div className="workspace-entry__brand">
          <span className="workspace-entry__mark material-symbols-outlined" aria-hidden="true">event_available</span>
          <div className="workspace-entry__brand-text">
            <span className="workspace-entry__brand-name">中奥致远赛事管理系统</span>
            <span className="workspace-entry__brand-subtitle">入口启动器</span>
          </div>
        </div>
        <div className="workspace-entry__top-actions">
          <button type="button" className="workspace-entry__button" onClick={() => navigate('/workspaces/select')}>切换工作区</button>
          <button type="button" className="workspace-entry__button" onClick={handleLogout}>退出</button>
        </div>
      </header>

      <main className="workspace-entry__body">
        <div className="workspace-entry__header">
          <div>
            <p className="workspace-entry__eyebrow">Launcher</p>
            <h1 className="workspace-entry__title">选择入口</h1>
            <p className="workspace-entry__summary">当前工作区：{session.orgName || session.orgId || '系统平台'} / {scopeLabel}</p>
          </div>
          <div className="workspace-entry__meta-row">
            <span className="workspace-entry__chip">{isPlatformScope ? '平台：系统平台' : `机构：${session.orgName || session.orgId}`}</span>
            <span className="workspace-entry__chip">范围：{scopeLabel}</span>
          </div>
        </div>

        <section className="workspace-entry__panel" aria-label="入口选择">
          <div className="workspace-entry__panel-header">
            <div>
              <h2 className="workspace-entry__panel-title">可用入口</h2>
              <p className="workspace-entry__panel-note">这里只显示你能进入的入口。</p>
            </div>
            <span className="workspace-entry__chip">{surfaces.length} 个入口</span>
          </div>

          <div className="workspace-entry__surface-grid">
            {surfaces.map((surface) => (
              <button
                key={surface.key}
                type="button"
                className="workspace-entry__surface"
                onClick={() => openSurface(surface)}
              >
                <span className="workspace-entry__surface-icon material-symbols-outlined" aria-hidden="true">{surface.icon}</span>
                <span>
                  <span className="workspace-entry__surface-title">{surface.label}</span>
                  <span className="workspace-entry__surface-copy">{surface.description}</span>
                </span>
                <span className="workspace-entry__surface-action">进入<span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span></span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

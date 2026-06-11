import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import useWorkspaceStore from '../../features/workspace/workspaceStore'
import { createWorkspaceSession } from '../../features/workspace/workspaceSession'
import { fetchWorkspaceOptions } from '../../features/workspace/workspaceApi'
import { showError } from '../../utils/toast'
import './workspace-entry.css'

function WorkspaceState({ message }) {
  return (
    <div className="workspace-entry layout--app">
      <div className="workspace-entry__state">
        <div className="workspace-entry__state-box">
          <div className="route-loader__spinner" aria-hidden="true" />
          <span>{message}</span>
        </div>
      </div>
    </div>
  )
}

export default function WorkspaceSelectPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isAuthenticated, isBootstrapping, user, logout } = useAuthStore()
  const workspaceSession = useWorkspaceStore((state) => state.session)
  const setWorkspaceSession = useWorkspaceStore((state) => state.setWorkspaceSession)
  const clearWorkspaceSession = useWorkspaceStore((state) => state.clearWorkspaceSession)

  const [options, setOptions] = useState(null)
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [selectedRaceId, setSelectedRaceId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const applyOptions = useCallback((nextOptions, preferredOrgId = '', preferredRaceId = '') => {
    setOptions(nextOptions)
    const nextOrgId = preferredOrgId || nextOptions.current.orgId || nextOptions.organizations[0]?.id || ''
    const org = nextOptions.organizations.find((item) => item.id === nextOrgId) || nextOptions.organizations[0]
    const nextRaceId = preferredRaceId || nextOptions.current.raceId || org?.races[0]?.id || ''
    setSelectedOrgId(org?.id || '')
    setSelectedRaceId(nextRaceId)
  }, [])

  const loadOptions = useCallback(async (params = {}) => {
    setIsLoading(true)
    try {
      const nextOptions = await fetchWorkspaceOptions(params)
      applyOptions(nextOptions, params.orgId ? String(params.orgId) : '', params.raceId ? String(params.raceId) : '')
    } catch (error) {
      showError(error.message || '工作区选项加载失败')
    } finally {
      setIsLoading(false)
    }
  }, [applyOptions])

  useEffect(() => {
    if (!isAuthenticated) return
    loadOptions({
      orgId: workspaceSession?.orgId || '',
      raceId: workspaceSession?.raceId || '',
    })
  }, [isAuthenticated, loadOptions, workspaceSession?.orgId, workspaceSession?.raceId])

  const selectedOrg = useMemo(() => (
    options?.organizations.find((org) => org.id === selectedOrgId) || null
  ), [options, selectedOrgId])

  const selectedRace = useMemo(() => (
    selectedOrg?.races.find((race) => race.id === selectedRaceId) || null
  ), [selectedOrg, selectedRaceId])

  if (isBootstrapping) {
    return <WorkspaceState message="正在校验登录状态…" />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  const handleOrgChange = (event) => {
    const nextOrgId = event.target.value
    setSelectedOrgId(nextOrgId)
    setSelectedRaceId('')
    if (nextOrgId) {
      loadOptions({ orgId: nextOrgId })
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!selectedOrg) {
      showError('请选择机构')
      return
    }
    if (selectedOrg.races.length > 0 && !selectedRace) {
      showError('请选择赛事')
      return
    }

    setIsSubmitting(true)
    setWorkspaceSession(createWorkspaceSession({
      orgId: selectedOrg.id,
      orgName: selectedOrg.name,
      raceId: selectedRace?.id || '',
      raceName: selectedRace?.name || '',
      surface: 'app',
    }))

    const redirect = searchParams.get('redirect')
    const target = redirect && redirect.startsWith('/') && !redirect.startsWith('/login')
      ? redirect
      : '/launcher'
    navigate(target, { replace: true })
  }

  const handleLogout = async () => {
    clearWorkspaceSession()
    await logout()
    navigate('/login', { replace: true })
  }

  const canSubmit = Boolean(selectedOrg) && (!selectedOrg.races.length || Boolean(selectedRace))

  return (
    <div className="workspace-entry layout--app">
      <header className="workspace-entry__topbar">
        <div className="workspace-entry__brand">
          <span className="workspace-entry__mark material-symbols-outlined" aria-hidden="true">event_available</span>
          <div className="workspace-entry__brand-text">
            <span className="workspace-entry__brand-name">中奥致远赛事管理系统</span>
            <span className="workspace-entry__brand-subtitle">工作区选择</span>
          </div>
        </div>
        <div className="workspace-entry__top-actions">
          <span className="workspace-entry__chip">{user?.username || user?.name || '当前账号'}</span>
          <button type="button" className="workspace-entry__button" onClick={handleLogout}>退出</button>
        </div>
      </header>

      <main className="workspace-entry__body">
        <div className="workspace-entry__header">
          <div>
            <p className="workspace-entry__eyebrow">Workspace</p>
            <h1 className="workspace-entry__title">选择机构和赛事</h1>
            <p className="workspace-entry__summary">先选机构和赛事。进入应用层、执行层或管理层后，系统会沿用这个工作区。</p>
          </div>
        </div>

        <section className="workspace-entry__panel" aria-label="工作区选择">
          <div className="workspace-entry__panel-header">
            <div>
              <h2 className="workspace-entry__panel-title">当前工作区</h2>
              <p className="workspace-entry__panel-note">这里只显示你有权限访问的机构和赛事。</p>
            </div>
            {isLoading ? <span className="workspace-entry__chip">加载中</span> : null}
          </div>

          <form className="workspace-entry__form" onSubmit={handleSubmit}>
            <label className="workspace-entry__field">
              <span className="workspace-entry__label">机构</span>
              <select
                className="workspace-entry__select"
                value={selectedOrgId}
                onChange={handleOrgChange}
                disabled={isLoading || isSubmitting}
              >
                <option value="">请选择机构</option>
                {(options?.organizations || []).map((org) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </label>

            <label className="workspace-entry__field">
              <span className="workspace-entry__label">赛事</span>
              <select
                className="workspace-entry__select"
                value={selectedRaceId}
                onChange={(event) => setSelectedRaceId(event.target.value)}
                disabled={isLoading || isSubmitting || !selectedOrg}
              >
                <option value="">{selectedOrg?.races.length ? '请选择赛事' : '当前机构暂无可选赛事'}</option>
                {(selectedOrg?.races || []).map((race) => (
                  <option key={race.id} value={race.id}>{race.name}</option>
                ))}
              </select>
            </label>

            <div className="workspace-entry__meta-row">
              {selectedOrg ? <span className="workspace-entry__chip">机构：{selectedOrg.name}</span> : null}
              {selectedRace ? <span className="workspace-entry__chip">赛事：{selectedRace.name}</span> : null}
            </div>

            <div className="workspace-entry__actions">
              <button
                type="submit"
                className="workspace-entry__button workspace-entry__button--primary"
                disabled={!canSubmit || isLoading || isSubmitting}
              >
                <span>{isSubmitting ? '正在进入' : '进入工作区'}</span>
                <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  )
}

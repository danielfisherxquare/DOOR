import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import useWorkspaceStore from '../../features/workspace/workspaceStore'
import { createWorkspaceSession, ORG_OPERATION_SCOPE_VALUE } from '../../features/workspace/workspaceSession'
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
  const { isAuthenticated, isBootstrapping, user, logout, refreshAuthzProfile } = useAuthStore()
  const workspaceSession = useWorkspaceStore((state) => state.session)
  const setWorkspaceSession = useWorkspaceStore((state) => state.setWorkspaceSession)
  const clearWorkspaceSession = useWorkspaceStore((state) => state.clearWorkspaceSession)

  const [options, setOptions] = useState(null)
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [selectedScopeId, setSelectedScopeId] = useState(ORG_OPERATION_SCOPE_VALUE)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const applyOptions = useCallback((nextOptions, preferredOrgId = '', preferredRaceId = '') => {
    setOptions(nextOptions)
    const nextOrgId = preferredOrgId || nextOptions.current.orgId || nextOptions.organizations[0]?.id || ''
    const org = nextOptions.organizations.find((item) => item.id === nextOrgId) || nextOptions.organizations[0]
    const nextRaceId = preferredRaceId || nextOptions.current.raceId || ''
    const nextScopeId = org?.scopes.some((scope) => scope.id === nextRaceId)
      ? nextRaceId
      : ORG_OPERATION_SCOPE_VALUE
    setSelectedOrgId(org?.id || '')
    setSelectedScopeId(nextScopeId)
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

  const selectedScope = useMemo(() => (
    selectedOrg?.scopes.find((scope) => scope.id === selectedScopeId) || selectedOrg?.scopes[0] || null
  ), [selectedOrg, selectedScopeId])

  const selectedRaceId = selectedScope?.scopeType === 'race' ? selectedScope.raceId || selectedScope.id : ''
  const selectedRace = selectedScope?.scopeType === 'race' ? selectedScope : null

  if (isBootstrapping) {
    return <WorkspaceState message="正在校验登录状态…" />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  const handleOrgChange = (event) => {
    const nextOrgId = event.target.value
    setSelectedOrgId(nextOrgId)
    setSelectedScopeId(ORG_OPERATION_SCOPE_VALUE)
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
    if (!selectedScope) {
      showError('请选择工作范围')
      return
    }

    setIsSubmitting(true)
    setWorkspaceSession(createWorkspaceSession({
      orgId: selectedOrg.id,
      orgName: selectedOrg.name,
      raceId: selectedRaceId,
      raceName: selectedRace?.name || '',
      scopeType: selectedScope.scopeType,
      surface: 'app',
    }))
    await refreshAuthzProfile({ orgId: selectedOrg.id, raceId: selectedRaceId })

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

  const canSubmit = Boolean(selectedOrg && selectedScope)

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
	            <h1 className="workspace-entry__title">选择工作区</h1>
            <p className="workspace-entry__summary">先选机构，再选择机构运营或具体赛事。进入应用层、执行层或管理层后，系统会沿用这个工作区。</p>
          </div>
        </div>

        <section className="workspace-entry__panel" aria-label="工作区选择">
          <div className="workspace-entry__panel-header">
            <div>
              <h2 className="workspace-entry__panel-title">当前工作区</h2>
	              <p className="workspace-entry__panel-note">机构运营用于设计、协同和组织级应用；具体赛事用于名单、证件和现场执行。</p>
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
              <span className="workspace-entry__label">工作范围</span>
              <select
                className="workspace-entry__select"
                value={selectedScopeId}
                onChange={(event) => setSelectedScopeId(event.target.value)}
                disabled={isLoading || isSubmitting || !selectedOrg}
              >
                {(selectedOrg?.scopes || []).map((scope) => (
                  <option key={scope.id} value={scope.id}>
                    {scope.scopeType === 'org' ? '机构运营（不限定赛事）' : scope.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="workspace-entry__meta-row">
              {selectedOrg ? <span className="workspace-entry__chip">机构：{selectedOrg.name}</span> : null}
              {selectedScope ? <span className="workspace-entry__chip">范围：{selectedScope.scopeType === 'org' ? '机构运营' : selectedScope.name}</span> : null}
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

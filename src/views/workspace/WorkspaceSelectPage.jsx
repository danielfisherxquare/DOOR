import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import useWorkspaceStore from '../../features/workspace/workspaceStore'
import {
  canCommitWorkspaceProfile,
  createWorkspaceSession,
  ORG_OPERATION_SCOPE_VALUE,
  PLATFORM_SCOPE_VALUE,
  PLATFORM_WORKSPACE_ID,
} from '../../features/workspace/workspaceSession'
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
  const redirect = searchParams.get('redirect') || ''
  const redirectSurface = redirect.startsWith('/ops')
    ? 'ops'
    : redirect.startsWith('/app')
      ? 'app'
      : redirect.startsWith('/admin')
        ? 'admin'
        : ''
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
    const wantsOperationalSurface = redirectSurface === 'app' || redirectSurface === 'ops'
    const usesPlatformScope = nextOptions.current.scopeType === 'platform' && !preferredOrgId && !wantsOperationalSurface
    const firstBusinessOrgId = nextOptions.organizations.find((item) => item.id !== PLATFORM_WORKSPACE_ID)?.id || ''
    const nextOrgId = usesPlatformScope
      ? PLATFORM_WORKSPACE_ID
      : (preferredOrgId || (wantsOperationalSurface && nextOptions.current.scopeType === 'platform' ? firstBusinessOrgId : nextOptions.current.orgId) || nextOptions.organizations[0]?.id || '')
    const org = nextOptions.organizations.find((item) => item.id === nextOrgId) || nextOptions.organizations[0]
    const nextRaceId = usesPlatformScope ? '' : (preferredRaceId || nextOptions.current.raceId || '')
    const raceScope = org?.scopes.find((scope) => scope.scopeType === 'race')
    const nextScopeId = usesPlatformScope
      ? PLATFORM_SCOPE_VALUE
      : (redirectSurface === 'ops' && !nextRaceId && raceScope
          ? raceScope.id
          : org?.scopes.some((scope) => scope.id === nextRaceId)
          ? nextRaceId
          : (org?.scopes[0]?.id || ORG_OPERATION_SCOPE_VALUE))
    setSelectedOrgId(org?.id || '')
    setSelectedScopeId(nextScopeId)
  }, [redirectSurface])

  const loadOptions = useCallback(async (params = {}) => {
    setIsLoading(true)
    try {
      const nextOptions = await fetchWorkspaceOptions(params)
      const firstBusinessOrgId = nextOptions.organizations.find((item) => item.id !== PLATFORM_WORKSPACE_ID)?.id || ''
      if (
        (redirectSurface === 'app' || redirectSurface === 'ops')
        && !params.orgId
        && nextOptions.current.scopeType === 'platform'
        && firstBusinessOrgId
      ) {
        const scopedOptions = await fetchWorkspaceOptions({ orgId: firstBusinessOrgId })
        applyOptions(scopedOptions, firstBusinessOrgId, params.raceId ? String(params.raceId) : '')
        return
      }
      applyOptions(nextOptions, params.orgId ? String(params.orgId) : '', params.raceId ? String(params.raceId) : '')
    } catch (error) {
      showError(error.message || '工作区选项加载失败')
    } finally {
      setIsLoading(false)
    }
  }, [applyOptions, redirectSurface])

  useEffect(() => {
    if (!isAuthenticated) return
    const defaultToPlatform = user?.role === 'super_admin'
      && user?.authzProfile?.scopeType === 'platform'
      && redirectSurface !== 'app'
      && redirectSurface !== 'ops'
    loadOptions({
      orgId: defaultToPlatform ? '' : (workspaceSession?.orgId || ''),
      raceId: defaultToPlatform ? '' : (workspaceSession?.raceId || ''),
    })
  }, [isAuthenticated, loadOptions, redirectSurface, user, workspaceSession?.orgId, workspaceSession?.raceId, workspaceSession?.scopeType])

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
    if (nextOrgId === PLATFORM_WORKSPACE_ID) {
      setSelectedScopeId(PLATFORM_SCOPE_VALUE)
      return
    }
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
    if (selectedScope.scopeType === 'platform') {
      const profile = await refreshAuthzProfile({ scopeType: 'platform' })
      if (!canCommitWorkspaceProfile(profile, { scopeType: 'platform' })) {
        showError('当前账号无法进入该工作区')
        setIsSubmitting(false)
        return
      }
      setWorkspaceSession(createWorkspaceSession({
        scopeType: 'platform',
        surface: 'admin',
      }))

      const redirect = searchParams.get('redirect')
      const target = redirect && redirect.startsWith('/admin') && !redirect.startsWith('/login')
        ? redirect
        : '/admin'
      navigate(target, { replace: true })
      return
    }

    const profile = await refreshAuthzProfile({ orgId: selectedOrg.id, raceId: selectedRaceId })
    if (!canCommitWorkspaceProfile(profile, {
      scopeType: selectedScope.scopeType,
      orgId: selectedOrg.id,
      raceId: selectedRaceId,
    })) {
      showError('当前账号无法进入该工作区')
      setIsSubmitting(false)
      return
    }

    setWorkspaceSession(createWorkspaceSession({
      orgId: selectedOrg.id,
      orgName: selectedOrg.name,
      raceId: selectedRaceId,
      raceName: selectedRace?.name || '',
      scopeType: selectedScope.scopeType,
      surface: redirectSurface || 'app',
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
            <p className="workspace-entry__summary">系统管理员可直接进入平台控制台；机构和赛事工作区用于限定应用层、执行层和管理层的数据范围。</p>
          </div>
        </div>

        <section className="workspace-entry__panel" aria-label="工作区选择">
          <div className="workspace-entry__panel-header">
            <div>
              <h2 className="workspace-entry__panel-title">当前工作区</h2>
              <p className="workspace-entry__panel-note">系统平台用于全局治理；机构运营用于组织级应用；具体赛事用于名单、证件和现场执行。</p>
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
                    {scope.scopeType === 'platform' ? '平台控制台' : (scope.scopeType === 'org' ? '机构运营（不限定赛事）' : scope.name)}
                  </option>
                ))}
              </select>
            </label>

            <div className="workspace-entry__meta-row">
              {selectedOrg ? <span className="workspace-entry__chip">机构：{selectedOrg.name}</span> : null}
              {selectedScope ? <span className="workspace-entry__chip">范围：{selectedScope.scopeType === 'platform' ? '平台控制台' : (selectedScope.scopeType === 'org' ? '机构运营' : selectedScope.name)}</span> : null}
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

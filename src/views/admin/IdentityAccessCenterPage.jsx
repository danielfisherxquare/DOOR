import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import identityCenterApi from '../../api/identityCenter'
import useAuthStore from '../../stores/authStore'
import { buildAdminHref, buildIdentityCenterHref } from '../../components/admin/adminConfig'
import {
  AdminEmptyState,
  AdminNotice,
  AdminSectionHeader,
  AdminStatusPill,
  AdminSurface,
} from '../../components/admin/AdminWorkbench'
import IdentityAccountsPanel from './identity-center/IdentityAccountsPanel'
import IdentityModuleMatrixPanel from './identity-center/IdentityModuleMatrixPanel'
import IdentityOrgRacePanel from './identity-center/IdentityOrgRacePanel'
import IdentityUserRacePanel from './identity-center/IdentityUserRacePanel'
import { ROLE_LABELS, VIEW_OPTIONS, formatNumber } from './identity-center/shared'
import './identity-access-center-page.css'

export default function IdentityAccessCenterPage() {
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'super_admin'
  const [searchParams, setSearchParams] = useSearchParams()
  const orgId = searchParams.get('orgId') || ''
  const context = useMemo(() => ({ selectedOrgId: orgId }), [orgId])
  const hasScopedOrg = !isSuperAdmin || Boolean(orgId)

  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [flash, setFlash] = useState(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [dirtyViews, setDirtyViews] = useState({
    moduleMatrix: false,
    orgRace: false,
    userRace: false,
  })

  const viewOptions = useMemo(
    () => VIEW_OPTIONS.filter((item) => !item.superAdminOnly || isSuperAdmin),
    [isSuperAdmin],
  )

  const defaultView = viewOptions[0]?.key || 'accounts'
  const requestedView = searchParams.get('view') || ''
  const activeView = viewOptions.some((item) => item.key === requestedView) ? requestedView : defaultView

  useEffect(() => {
    if (requestedView === activeView) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('view', activeView)
    setSearchParams(nextParams, { replace: true })
  }, [activeView, requestedView, searchParams, setSearchParams])

  useEffect(() => {
    let active = true
    setSummaryLoading(true)
    identityCenterApi.getSummary(orgId ? { orgId } : undefined)
      .then((res) => {
        if (!active || !res?.success) return
        setSummary(res.data)
      })
      .catch((error) => {
        if (active) setFlash({ tone: 'danger', text: error.message })
      })
      .finally(() => {
        if (active) setSummaryLoading(false)
      })

    return () => {
      active = false
    }
  }, [orgId, refreshToken])

  const metrics = useMemo(() => {
    const values = summary?.metrics || {}
    return [
      { label: '账号规模', value: summaryLoading ? '...' : formatNumber(values.userCount), meta: '账号状态、改密、成员绑定。' },
      { label: '成员档案', value: summaryLoading ? '...' : formatNumber(values.teamMemberCount), meta: '账号绑定从成员档案开始。' },
      { label: '待处理账号', value: summaryLoading ? '...' : formatNumber(values.pendingCount), meta: '禁用、待改密、未绑定成员。' },
      { label: '外援成员', value: summaryLoading ? '...' : formatNumber(values.externalCount), meta: '外援账号与成员档案。' },
    ]
  }, [summary, summaryLoading])

  const hasMatrixChanges = useMemo(
    () => Object.values(dirtyViews).some(Boolean),
    [dirtyViews],
  )

  useEffect(() => {
    window.__ARCSPRO_IDENTITY_CENTER_DIRTY__ = hasMatrixChanges
    return () => {
      window.__ARCSPRO_IDENTITY_CENTER_DIRTY__ = false
    }
  }, [hasMatrixChanges])

  const updateDirty = useCallback((key, value) => {
    setDirtyViews((current) => (current[key] === value ? current : { ...current, [key]: value }))
  }, [])

  const refreshWorkspace = useCallback(() => {
    setRefreshToken((current) => current + 1)
  }, [])

  const showFlash = useCallback((tone, text) => {
    setFlash({ tone, text })
  }, [])

  const handleViewChange = useCallback((nextView) => {
    if (nextView === activeView) return
    if (hasMatrixChanges && !window.confirm('当前矩阵存在未保存改动，切换视图会丢失这些改动，是否继续？')) {
      return
    }
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('view', nextView)
    setSearchParams(nextParams)
  }, [activeView, hasMatrixChanges, searchParams, setSearchParams])

  return (
    <div className="identity-access-center-page">
      <AdminSectionHeader
        eyebrow="身份控制台"
        title="身份与授权中心"
        description="先维护成员，再开账号；机构、赛事和应用入口在这里分配。"
        metrics={metrics}
        actions={hasScopedOrg ? (
          <Link to={buildAdminHref('/team', context)} className="btn btn--primary">进入成员档案</Link>
        ) : (
          <Link to="/admin/orgs" className="btn btn--primary">先锁定机构</Link>
        )}
      />

      {flash ? <AdminNotice tone={flash.tone}>{flash.text}</AdminNotice> : null}
      {hasMatrixChanges ? <AdminNotice tone="warning">当前矩阵存在未保存改动。请先保存或重置，再切换机构、角色或视图。</AdminNotice> : null}

      <IdentitySummaryStrip
        summary={summary}
        summaryLoading={summaryLoading}
        isSuperAdmin={isSuperAdmin}
        hasScopedOrg={hasScopedOrg}
        context={context}
      />

      {!hasScopedOrg ? (
        <AdminSurface title="先锁定机构" subtitle="先选机构，才能编辑账号和授权。">
          <AdminEmptyState
            title="当前还没有机构上下文"
            description="统计可以先看，批量编辑必须选机构。请在右上角切换工作区。"
            action={<Link to="/admin/orgs" className="btn btn--primary">去看机构列表</Link>}
          />
        </AdminSurface>
      ) : (
        <>
          <AdminSurface title="授权视图" subtitle="按账号、机构赛事、应用入口、用户赛事分开编辑。">
            <div className="identity-access-center-page__tab-bar">
              {viewOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`identity-access-center-page__tab ${activeView === option.key ? 'is-active' : ''}`}
                  onClick={() => handleViewChange(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </AdminSurface>

          {activeView === 'accounts' ? (
            <IdentityAccountsPanel
              orgId={orgId}
              isSuperAdmin={isSuperAdmin}
              refreshToken={refreshToken}
              hasPendingMatrixChanges={hasMatrixChanges}
              onRefresh={refreshWorkspace}
              onMessage={showFlash}
            />
          ) : null}

          {activeView === 'org-race' ? (
            <IdentityOrgRacePanel
              orgId={orgId}
              refreshToken={refreshToken}
              onDirtyChange={(value) => updateDirty('orgRace', value)}
              onMessage={showFlash}
              onRefresh={refreshWorkspace}
            />
          ) : null}

          {activeView === 'module-matrix' ? (
            <IdentityModuleMatrixPanel
              orgId={orgId}
              refreshToken={refreshToken}
              onDirtyChange={(value) => updateDirty('moduleMatrix', value)}
              onMessage={showFlash}
            />
          ) : null}

          {activeView === 'user-race' ? (
            <IdentityUserRacePanel
              orgId={orgId}
              refreshToken={refreshToken}
              onDirtyChange={(value) => updateDirty('userRace', value)}
              onMessage={showFlash}
            />
          ) : null}

          {activeView === 'capabilities' ? (
            <ActionAuthorizationPanel user={user} />
          ) : null}
        </>
      )}
    </div>
  )
}

function IdentitySummaryStrip({ summary, summaryLoading, isSuperAdmin, hasScopedOrg, context }) {
  const pendingItems = summary?.pendingItems || []

  return (
    <div className="identity-access-center-page__summary-grid">
      <AdminSurface
        title="待处理信号"
        subtitle="先处理未绑定、禁用、待改密账号。"
      >
        {summaryLoading ? (
          <div className="identity-access-center-page__loading-copy">正在汇总待处理信号…</div>
        ) : pendingItems.length === 0 ? (
          <AdminNotice tone="success">当前没有明显的账号风险或绑定缺口。</AdminNotice>
        ) : (
          <div className="identity-access-center-page__signal-list">
            {pendingItems.map((item) => (
              <div key={item} className="identity-access-center-page__signal-item">
                <AdminStatusPill tone="warning">待处理</AdminStatusPill>
                <span>{item}</span>
              </div>
            ))}
          </div>
        )}
      </AdminSurface>

      <AdminSurface
        title="常用入口"
        subtitle="直接进入成员、角色包和授权矩阵。"
      >
        <div className="identity-access-center-page__shortcut-grid">
          <Link to={buildAdminHref('/team', context)} className="btn btn--ghost">团队档案</Link>
          <Link to={buildIdentityCenterHref('accounts', context)} className="btn btn--ghost">角色包</Link>
          <Link to={buildIdentityCenterHref('user-race', context)} className="btn btn--ghost">工作区授权</Link>
          <Link to={buildIdentityCenterHref('module-matrix', context)} className="btn btn--ghost">应用授权</Link>
          <Link to={buildIdentityCenterHref('capabilities', context)} className="btn btn--ghost">动作授权</Link>
          {isSuperAdmin && hasScopedOrg ? (
            <Link to={buildIdentityCenterHref('org-race', context)} className="btn btn--ghost">机构范围</Link>
          ) : null}
        </div>
      </AdminSurface>
    </div>
  )
}

function ActionAuthorizationPanel({ user }) {
  const scopedCapabilities = user?.scopedCapabilities || {}
  const surfaceAccess = user?.surfaceAccess || {}
  const roleLabel = ROLE_LABELS[user?.role] || user?.role || '-'
  const surfaceLabels = {
    public: '公开',
    app: '应用层',
    ops: '执行层',
    admin: '管理层',
  }
  const scopeLabels = {
    self: '个人',
    race: '赛事',
    org: '机构',
    platform: '平台',
    inventory: '库存',
  }

  return (
    <AdminSurface
      title="动作授权"
      subtitle="应用入口决定能看见哪里，动作授权决定能做什么。"
    >
      <div className="identity-access-center-page__capability-grid">
        <div className="identity-access-center-page__capability-block">
          <div className="identity-access-center-page__capability-title">当前角色包</div>
          <div className="identity-access-center-page__capability-value">{roleLabel}</div>
        </div>
        <div className="identity-access-center-page__capability-block">
          <div className="identity-access-center-page__capability-title">入口授权</div>
          <div className="identity-access-center-page__pill-row">
            {Object.entries(surfaceLabels).map(([surface, label]) => (
              <AdminStatusPill key={surface} tone={surfaceAccess[surface] ? 'success' : 'neutral'}>
                {label}
              </AdminStatusPill>
            ))}
          </div>
        </div>
      </div>

      <div className="identity-access-center-page__capability-list">
        {Object.entries(scopeLabels).map(([scope, label]) => {
          const actions = scopedCapabilities[scope] || []
          return (
            <div key={scope} className="identity-access-center-page__capability-row">
              <div className="identity-access-center-page__capability-scope">{label}</div>
              <div className="identity-access-center-page__pill-row">
                {actions.length > 0 ? actions.map((action) => (
                  <AdminStatusPill key={action} tone="success">{action}</AdminStatusPill>
                )) : (
                  <AdminStatusPill tone="neutral">未授权</AdminStatusPill>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </AdminSurface>
  )
}

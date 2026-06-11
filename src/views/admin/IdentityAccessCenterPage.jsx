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
import { VIEW_OPTIONS, formatNumber } from './identity-center/shared'
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
      { label: '账号规模', value: summaryLoading ? '...' : formatNumber(values.userCount), meta: '账号状态、改密和成员绑定都在这里统一治理。' },
      { label: '成员档案', value: summaryLoading ? '...' : formatNumber(values.teamMemberCount), meta: '成员档案是身份链的源头。' },
      { label: '待处理账号', value: summaryLoading ? '...' : formatNumber(values.pendingCount), meta: '禁用、待改密、未绑定成员都属于同一待办池。' },
      { label: '外援成员', value: summaryLoading ? '...' : formatNumber(values.externalCount), meta: '外援与账号开通最适合在中心页联动处理。' },
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
        description="这里不再只是入口汇总，而是组织作用域下的 IAM 工作台。账号状态、机构赛事范围、模块访问和用户赛事授权在同一条工作流里连续治理。"
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
        <AdminSurface title="先锁定机构" subtitle="超级管理员需要先选定机构，矩阵治理才能进入有效上下文。">
          <AdminEmptyState
            title="当前还没有机构上下文"
            description="已保留全平台统计与待处理信号，但批量编辑矩阵必须依赖具体机构作用域。先在右上角锁定机构，再回到这里继续处理。"
            action={<Link to="/admin/orgs" className="btn btn--primary">去看机构列表</Link>}
          />
        </AdminSurface>
      ) : (
        <>
          <AdminSurface title="治理视图" subtitle="按对象属性、机构范围和个人授权分层治理，避免一张表混在一起。">
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
        subtitle="先处理真正影响身份链稳定性的事项，再进入矩阵批量治理会更稳。"
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
        title="操作近路"
        subtitle="复杂细节仍保留到原页面，身份中心负责统一筛查和批量治理。"
      >
        <div className="identity-access-center-page__shortcut-grid">
          <Link to={buildAdminHref('/team', context)} className="btn btn--ghost">团队档案</Link>
          <Link to={buildIdentityCenterHref('accounts', context)} className="btn btn--ghost">账号状态</Link>
          <Link to={buildIdentityCenterHref('module-matrix', context)} className="btn btn--ghost">模块权限</Link>
          <Link to={buildIdentityCenterHref('user-race', context)} className="btn btn--ghost">用户赛事授权</Link>
          {isSuperAdmin && hasScopedOrg ? (
            <Link to={buildIdentityCenterHref('org-race', context)} className="btn btn--ghost">机构赛事范围</Link>
          ) : null}
        </div>
      </AdminSurface>
    </div>
  )
}

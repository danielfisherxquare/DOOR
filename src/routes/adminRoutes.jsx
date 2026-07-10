import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminEmptyState, AdminSurface } from '../components/admin/AdminWorkbench'
import { buildAdminHref } from '../components/admin/adminConfig'
import ModuleProtectedRoute from '../components/ModuleProtectedRoute'
import { listAdminComponentRoutes } from './adminRouteRegistry.js'

const AdminDashboard = lazy(() => import('../views/admin/AdminDashboard'))
const BibTrackingPage = lazy(() => import('../views/admin/BibTrackingPage'))
const DatabaseBackupPage = lazy(() => import('../views/admin/DatabaseBackupPage'))
const OrgCreatePage = lazy(() => import('../views/admin/OrgCreatePage'))
const OrgDetailPage = lazy(() => import('../views/admin/OrgDetailPage'))
const OrgListPage = lazy(() => import('../views/admin/OrgListPage'))
const RaceManagementPage = lazy(() => import('../views/admin/RaceManagementPage'))
const TeamListPage = lazy(() => import('../views/admin/TeamListPage'))
const IdentityAccessCenterPage = lazy(() => import('../views/admin/IdentityAccessCenterPage'))
const AdminReimbursementPage = lazy(() => import('../views/admin/finance/AdminReimbursementPage'))
const ColorSchemePage = lazy(() => import('../views/admin/branding/ColorSchemePage'))
const InterviewList = lazy(() => import('../views/interview/InterviewList'))
const InterviewCompare = lazy(() => import('../views/interview/InterviewCompare'))
const InterviewForm = lazy(() => import('../views/interview/InterviewForm'))
const DesignRequestWorkspace = lazy(() => import('../views/design-requests/DesignRequestWorkspace'))
const CredentialCenterPage = lazy(() => import('../views/admin/credential/CredentialCenterPage'))
const CredentialSelectRacePage = lazy(() => import('../views/admin/credential/CredentialSelectRacePage'))
const CredentialZonePage = lazy(() => import('../views/admin/credential/CredentialZonePage'))
const CredentialRolePage = lazy(() => import('../views/admin/credential/CredentialRolePage'))
const CredentialStylePage = lazy(() => import('../views/admin/credential/CredentialStylePage'))
const CredentialApplicationPage = lazy(() => import('../views/admin/credential/CredentialApplicationPage'))
const CredentialReviewPage = lazy(() => import('../views/admin/credential/CredentialReviewPage'))
const CredentialIssuePage = lazy(() => import('../views/admin/credential/CredentialIssuePage'))

const simpleComponents = {
  dashboard: AdminDashboard,
  'bib-tracking': BibTrackingPage,
  'database-backup': DatabaseBackupPage,
  'org-create': OrgCreatePage,
  'org-detail': OrgDetailPage,
  'org-list': OrgListPage,
  'race-management': RaceManagementPage,
  team: TeamListPage,
  'identity-center': IdentityAccessCenterPage,
  reimbursements: AdminReimbursementPage,
  'color-scheme': ColorSchemePage,
  'interview-list': InterviewList,
  'interview-compare': InterviewCompare,
  'interview-form': InterviewForm,
  'credential-center': CredentialCenterPage,
  'credential-select-race': CredentialSelectRacePage,
  'credential-zones': CredentialZonePage,
  'credential-roles': CredentialRolePage,
  'credential-styles': CredentialStylePage,
  'credential-requests': CredentialApplicationPage,
  'credential-review': CredentialReviewPage,
  'credential-issue': CredentialIssuePage,
}

function AdminRouteLoader() {
  return (
    <div className="workspace-main__route-loader">
      <div className="route-loader__content">
        <div className="route-loader__spinner" aria-hidden="true" />
        <span>载入当前工作区…</span>
      </div>
    </div>
  )
}

function AdminDeprecatedRoute({
  title = '入口已下线',
  description = '该页面不再作为管理层独立工作台。请从当前入口导航或启动台进入新的归属入口。',
} = {}) {
  return (
    <AdminSurface title="入口已下线" subtitle={description}>
      <AdminEmptyState title={title} description={description} />
    </AdminSurface>
  )
}

function renderComponent(route, currentContext, locationSearch) {
  const Component = simpleComponents[route.componentKey]
  if (Component) return <Component />
  if (route.componentKey === 'design-requests') {
    return <DesignRequestWorkspace surface="admin" mode="manager" />
  }
  if (route.componentKey === 'deprecated') {
    return <AdminDeprecatedRoute description={route.deprecatedDescription} />
  }
  if (route.componentKey === 'legacy-identity') {
    return (
      <AdminDeprecatedRoute
        title="请改用身份中心"
        description="组织与授权相关能力已经统一收敛到身份中心。请从侧边栏进入身份中心，再切换到对应治理视图。"
      />
    )
  }
  if (route.componentKey === 'redirect-home') {
    return <Navigate to={buildAdminHref('', currentContext)} replace />
  }
  if (route.componentKey === 'redirect-team') {
    return <Navigate to={buildAdminHref('/team', currentContext)} replace />
  }
  if (route.componentKey === 'redirect-credential-center') {
    return <Navigate to={buildAdminHref('/credential-center', currentContext)} replace />
  }
  if (route.componentKey === 'redirect-credential-zones') {
    return <Navigate to={buildAdminHref('/credential/access-areas', currentContext)} replace />
  }
  if (route.componentKey === 'redirect-credential-roles') {
    return <Navigate to={buildAdminHref('/credential/categories', currentContext)} replace />
  }
  if (route.componentKey === 'redirect-credential-requests') {
    return <Navigate to={buildAdminHref('/credential/requests', currentContext)} replace />
  }
  if (route.componentKey === 'asset-designer-redirect') {
    return <Navigate to={`/asset-designer${locationSearch}`} replace />
  }
  throw new Error(`Unknown admin route component: ${route.componentKey}`)
}

function routeElement(route, currentContext, locationSearch) {
  const element = renderComponent(route, currentContext, locationSearch)
  if (!route.moduleId) return element
  return (
    <ModuleProtectedRoute surface="admin" moduleId={route.moduleId}>
      {element}
    </ModuleProtectedRoute>
  )
}

export default function AdminSurfaceRoutes({ currentContext, locationSearch }) {
  return (
    <Suspense fallback={<AdminRouteLoader />}>
      <Routes>
        {listAdminComponentRoutes().map((route) => (
          route.routePath === ''
            ? <Route key={route.key} index element={routeElement(route, currentContext, locationSearch)} />
            : <Route key={route.key} path={route.routePath} element={routeElement(route, currentContext, locationSearch)} />
        ))}
        <Route path="*" element={<AdminDeprecatedRoute />} />
      </Routes>
    </Suspense>
  )
}

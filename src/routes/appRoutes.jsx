import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import CapabilityProtectedRoute from '../components/CapabilityProtectedRoute'
import { buildAppHref } from '../components/app/appConfig'
import ModuleProtectedRoute from '../components/ModuleProtectedRoute'
import { APP_ROUTE_REGISTRY, findAppRoute } from './appRouteRegistry.js'

const Home = lazy(() => import('../views/Home'))
const ReimbursementTool = lazy(() => import('../views/reimbursement/ReimbursementTool'))
const ChangePassword = lazy(() => import('../views/ChangePassword'))
const StudioProjectsPage = lazy(() => import('../views/app/StudioProjectsPage'))
const TerrainModelPage = lazy(() => import('../views/app/terrain-model/TerrainModelPage'))
const ProfilePage = lazy(() => import('../views/profile/ProfilePage'))
const ImportPage = lazy(() => import('../views/app/events/import/ImportPage'))
const ProcessingCenterPage = lazy(() => import('../views/app/events/processing/ProcessingCenterPage'))
const RecordsPage = lazy(() => import('../views/app/events/records/RecordsPage'))
const LotteryPage = lazy(() => import('../views/app/events/lottery/LotteryPage'))
const BibPage = lazy(() => import('../views/app/events/bib/BibPage'))
const ClothingPage = lazy(() => import('../views/app/events/clothing/ClothingPage'))
const WmsDashboard = lazy(() => import('../views/inventory/WmsDashboard'))
const InboundCenter = lazy(() => import('../views/inventory/InboundCenter'))
const OutboundCenter = lazy(() => import('../views/inventory/OutboundCenter'))
const SpaceCenter = lazy(() => import('../views/inventory/SpaceCenter'))
const ControlCenter = lazy(() => import('../views/inventory/ControlCenter'))
const Reports = lazy(() => import('../views/inventory/Reports'))
const CredentialCenterPage = lazy(() => import('../features/credential/app/CredentialCenterPage'))
const CredentialApplicationPage = lazy(() => import('../features/credential/app/CredentialApplicationPage'))
const CredentialReviewPage = lazy(() => import('../features/credential/app/CredentialReviewPage'))
const InterviewList = lazy(() => import('../views/interview/InterviewList'))
const InterviewCompare = lazy(() => import('../views/interview/InterviewCompare'))
const InterviewForm = lazy(() => import('../views/interview/InterviewForm'))
const ProjectListPage = lazy(() => import('../views/app/projects/ProjectListPage'))
const ProjectDetailPage = lazy(() => import('../views/app/projects/ProjectDetailPage'))
const AssessmentCampaignListPage = lazy(() => import('../views/app/assessment/AssessmentCampaignListPage'))
const AssessmentCampaignDetailPage = lazy(() => import('../views/app/assessment/AssessmentCampaignDetailPage'))
const BibTrackingPage = lazy(() => import('../views/app/events/bib-tracking/BibTrackingPage'))
const RaceDashboardPage = lazy(() => import('../views/app/race-dashboard/RaceDashboardPage'))
const DesignRequestWorkspace = lazy(() => import('../views/design-requests/DesignRequestWorkspace'))

const simpleComponents = {
  home: Home,
  reimbursement: ReimbursementTool,
  settings: ChangePassword,
  'studio-projects': StudioProjectsPage,
  'terrain-model': TerrainModelPage,
  profile: ProfilePage,
  import: ImportPage,
  processing: ProcessingCenterPage,
  records: RecordsPage,
  lottery: LotteryPage,
  bib: BibPage,
  clothing: ClothingPage,
  'inventory-workbench': WmsDashboard,
  'inventory-inbound': InboundCenter,
  'inventory-outbound': OutboundCenter,
  'inventory-space': SpaceCenter,
  'inventory-control': ControlCenter,
  'inventory-analytics': Reports,
  'credential-center': CredentialCenterPage,
  'credential-requests': CredentialApplicationPage,
  'credential-review': CredentialReviewPage,
  'interview-list': InterviewList,
  'interview-compare': InterviewCompare,
  'interview-form': InterviewForm,
  projects: ProjectListPage,
  'project-detail': ProjectDetailPage,
  assessment: AssessmentCampaignListPage,
  'assessment-detail': AssessmentCampaignDetailPage,
  'bib-tracking': BibTrackingPage,
  'race-dashboard': RaceDashboardPage,
}

function AppRouteLoader() {
  return (
    <div className="workspace-main__route-loader">
      <div className="route-loader__content">
        <div className="route-loader__spinner" aria-hidden="true" />
        <span>载入当前工作区…</span>
      </div>
    </div>
  )
}

export function AppRouteGuard({ routeKey, selectedRaceId, currentRequestPath, children }) {
  const route = findAppRoute(routeKey)
  if (!route) throw new Error(`Unknown app route: ${routeKey}`)
  if (route.needsRace && !selectedRaceId) {
    return <Navigate to={`/workspaces?redirect=${encodeURIComponent(currentRequestPath)}`} replace />
  }

  let element = children
  if (route.requiredCapability) {
    element = (
      <CapabilityProtectedRoute
        scope={route.requiredCapability.scope}
        capability={route.requiredCapability.capability}
      >
        {element}
      </CapabilityProtectedRoute>
    )
  }
  if (route.moduleId) {
    element = (
      <ModuleProtectedRoute surface="app" moduleId={route.moduleId}>
        {element}
      </ModuleProtectedRoute>
    )
  }
  return element
}

function renderComponent(route, currentContext, locationSearch) {
  const Component = simpleComponents[route.componentKey]
  if (Component) return <Component />
  if (route.componentKey === 'design-requests') {
    return <DesignRequestWorkspace surface="app" mode="designer" />
  }
  if (route.componentKey === 'redirect-home') {
    return <Navigate to={buildAppHref('', currentContext)} replace />
  }
  if (route.componentKey === 'redirect-credential-center') {
    return <Navigate to={buildAppHref('/credential-center', currentContext)} replace />
  }
  if (route.componentKey === 'redirect-credential-requests') {
    return <Navigate to={buildAppHref('/credential/requests', currentContext)} replace />
  }
  if (route.componentKey === 'asset-designer-redirect') {
    return <Navigate to={`/asset-designer${locationSearch}`} replace />
  }
  throw new Error(`Unknown app route component: ${route.componentKey}`)
}

export default function AppSurfaceRoutes({
  selectedRaceId,
  currentRequestPath,
  currentContext,
  locationSearch,
}) {
  const routes = APP_ROUTE_REGISTRY.filter((route) => route.renderMode === 'standard')
  return (
    <Suspense fallback={<AppRouteLoader />}>
      <Routes>
        {routes.map((route) => {
          const element = (
            <AppRouteGuard
              routeKey={route.key}
              selectedRaceId={selectedRaceId}
              currentRequestPath={currentRequestPath}
            >
              {renderComponent(route, currentContext, locationSearch)}
            </AppRouteGuard>
          )
          return route.routePath === ''
            ? <Route key={route.key} index element={element} />
            : <Route key={route.key} path={route.routePath} element={element} />
        })}
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Suspense>
  )
}

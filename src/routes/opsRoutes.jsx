import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ModuleProtectedRoute from '../components/ModuleProtectedRoute'
import { listOpsComponentRoutes } from './opsRouteRegistry.js'

const OpsHome = lazy(() => import('../views/ops/OpsHome'))
const ScanHome = lazy(() => import('../views/scan/ScanHome'))
const ScanResult = lazy(() => import('../views/scan/ScanResult'))
const BibPickupPage = lazy(() => import('../views/ops/BibPickupPage'))
const CredentialIssuePage = lazy(() => import('../features/credential/execute/CredentialIssuePage'))
const WarehouseWorkbench = lazy(() => import('../views/ops/WarehouseWorkbench'))
const DesignRequestWorkspace = lazy(() => import('../views/design-requests/DesignRequestWorkspace'))

function renderComponent(componentKey) {
  if (componentKey === 'home') return <OpsHome />
  if (componentKey === 'scan') return <ScanHome />
  if (componentKey === 'scan-result') return <ScanResult />
  if (componentKey === 'bib-pickup') return <BibPickupPage />
  if (componentKey === 'credential-issue') return <CredentialIssuePage />
  if (componentKey === 'warehouse') return <WarehouseWorkbench />
  if (componentKey === 'design-requests') {
    return <DesignRequestWorkspace surface="ops" mode="requester" />
  }
  throw new Error(`Unknown OPS route component: ${componentKey}`)
}

function protectedElement(route) {
  return (
    <ModuleProtectedRoute surface="ops" moduleId={route.moduleId}>
      {renderComponent(route.componentKey)}
    </ModuleProtectedRoute>
  )
}

export default function OpsSurfaceRoutes({ fallbackHref }) {
  return (
    <Routes>
      {listOpsComponentRoutes().map((route) => (
        route.routePath === ''
          ? <Route key={route.key} index element={protectedElement(route)} />
          : <Route key={route.key} path={route.routePath} element={protectedElement(route)} />
      ))}
      <Route path="*" element={<Navigate to={fallbackHref} replace />} />
    </Routes>
  )
}

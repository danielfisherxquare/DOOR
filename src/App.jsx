import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import AdminProtectedRoute from './components/AdminProtectedRoute'
import ScanProtectedRoute from './components/ScanProtectedRoute'
import useAuthStore from './stores/authStore'

const Home = lazy(() => import('./views/Home'))
const Login = lazy(() => import('./views/Login'))
const ForgotPassword = lazy(() => import('./views/ForgotPassword'))
const ResetPassword = lazy(() => import('./views/ResetPassword'))
const ToolDetail = lazy(() => import('./views/ToolDetail'))
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'))
const ScanLayout = lazy(() => import('./components/scan/ScanLayout'))
const ScanLogin = lazy(() => import('./views/scan/ScanLogin'))
const ScanHome = lazy(() => import('./views/scan/ScanHome'))
const ScanResult = lazy(() => import('./views/scan/ScanResult'))
const InterviewForm = lazy(() => import('./views/interview/InterviewForm'))
const InterviewList = lazy(() => import('./views/interview/InterviewList'))
const InterviewCompare = lazy(() => import('./views/interview/InterviewCompare'))
const AssessmentPublicPage = lazy(() => import('./views/assessment/AssessmentPublicPage'))

function RouteLoader({ compact = false }) {
  return (
    <div className={compact ? 'route-loader route-loader--compact' : 'route-loader'}>
      <div className="route-loader__spinner" aria-hidden="true" />
      <span>加载中...</span>
    </div>
  )
}

function withSuspense(element, options = {}) {
  return (
    <Suspense fallback={<RouteLoader compact={options.compact} />}>
      {element}
    </Suspense>
  )
}

function PortalLayout() {
  return (
    <>
      <Navbar />
      <main className="main-content">
        <Suspense fallback={<RouteLoader compact />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/tool/:id" element={<ToolDetail />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </>
  )
}

function App() {
  const bootstrapAuth = useAuthStore((state) => state.bootstrapAuth)

  useEffect(() => {
    bootstrapAuth()
  }, [bootstrapAuth])

  return (
    <div className="app">
      <Routes>
        <Route
          path="/admin/*"
          element={(
            <AdminProtectedRoute>
              {withSuspense(<AdminLayout />)}
            </AdminProtectedRoute>
          )}
        />

        <Route
          path="/scan/login"
          element={withSuspense(
            <ScanLayout>
              <ScanLogin />
            </ScanLayout>,
          )}
        />

        <Route
          path="/scan/*"
          element={(
            <ScanProtectedRoute>
              {withSuspense(<ScanLayout />)}
            </ScanProtectedRoute>
          )}
        >
          <Route index element={withSuspense(<ScanHome />, { compact: true })} />
          <Route path="result" element={withSuspense(<ScanResult />, { compact: true })} />
        </Route>

        <Route path="/interview" element={withSuspense(<InterviewForm />)} />
        <Route path="/interview/records" element={withSuspense(<InterviewList />)} />
        <Route path="/interview/compare" element={withSuspense(<InterviewCompare />)} />
        <Route path="/assessment/:campaignId" element={withSuspense(<AssessmentPublicPage />)} />

        <Route path="*" element={<PortalLayout />} />
      </Routes>
    </div>
  )
}

export default App

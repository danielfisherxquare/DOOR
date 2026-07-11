import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import Navbar from './components/Navbar'
import AuthRoute from './components/AuthRoute'
import SurfaceProtectedRoute from './components/SurfaceProtectedRoute'
import CapabilityProtectedRoute from './components/CapabilityProtectedRoute'
import useAuthStore from './stores/authStore'
import useWorkspaceStore from './features/workspace/workspaceStore'

const Login = lazy(() => import('./views/Login'))
const ForgotPassword = lazy(() => import('./views/ForgotPassword'))
const ResetPassword = lazy(() => import('./views/ResetPassword'))
const ChangePassword = lazy(() => import('./views/ChangePassword'))
const AssessmentPublicPage = lazy(() => import('./views/assessment/AssessmentPublicPage'))
const ToolDetail = lazy(() => import('./views/ToolDetail'))
const WorkspaceSelectPage = lazy(() => import('./views/workspace/WorkspaceSelectPage'))
const LauncherPage = lazy(() => import('./views/workspace/LauncherPage'))

const AppLayout = lazy(() => import('./components/app/AppLayout'))
const OpsLayout = lazy(() => import('./components/ops/OpsLayout'))
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'))
const AssetDesigner = lazy(() => import('./views/asset-designer/AssetDesigner'))

function RouteLoader({ compact = false }) {
  return (
    <div className={compact ? 'route-loader route-loader--compact' : 'route-loader'}>
      <div className="route-loader__content">
        <div className="route-loader__spinner" aria-hidden="true" />
        <span>加载中...</span>
      </div>
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

function RootRedirect() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping)
  const user = useAuthStore((state) => state.user)
  const getDefaultLandingPath = useAuthStore((state) => state.getDefaultLandingPath)
  const workspaceSession = useWorkspaceStore((state) => state.session)

  if (isBootstrapping) {
    return <RouteLoader compact />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user?.mustChangePassword) {
    return <Navigate to="/change-password" replace />
  }

  const hasPlatformScope = workspaceSession?.scopeType === 'platform'
    || (user?.role === 'super_admin' && user?.authzProfile?.scopeType === 'platform')

  if (!workspaceSession?.orgId && !hasPlatformScope) {
    return <Navigate to="/workspaces" replace />
  }

  if (window.location.pathname === '/') {
    return <Navigate to={hasPlatformScope ? getDefaultLandingPath() : '/launcher'} replace />
  }

  return <Navigate to={getDefaultLandingPath()} replace />
}

/**
 * 公开页布局 — 仅顶部 Navbar + 内容
 */
function PublicPageLayout({ children }) {
  return (
    <>
      <Navbar />
      <main className="main-content">
        <Suspense fallback={<RouteLoader compact />}>
          {children}
        </Suspense>
      </main>
    </>
  )
}

function App() {
  const bootstrapAuth = useAuthStore((state) => state.bootstrapAuth)

  useEffect(() => {
    // Wait for zustand persist hydration to complete before bootstrapAuth
    // This fixes the race condition where bootstrapAuth runs before localStorage state is restored
    const unsubscribe = useAuthStore.persist.onFinishHydration(() => {
      bootstrapAuth()
    })

    // If hydration already finished (e.g., on subsequent mounts), run bootstrapAuth immediately
    if (useAuthStore.persist.hasHydrated()) {
      bootstrapAuth()
    }

    return unsubscribe
  }, [bootstrapAuth])

  return (
    <div className="app">
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        theme="light"
        toastStyle={{
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-family)',
          fontSize: 'var(--font-size-sm)',
        }}
      />
      <Routes>
        {/* ============================================
            🔓 公开页 — 无需登录
            ============================================ */}
        {/* 认证页 — 独立全屏布局，不含 Navbar */}
        <Route path="/login" element={withSuspense(<Login />)} />
        <Route path="/forgot-password" element={withSuspense(<ForgotPassword />)} />
        <Route path="/reset-password/:token" element={withSuspense(<ResetPassword />)} />
        <Route
          path="/change-password"
          element={(
            <AuthRoute>
              {withSuspense(<ChangePassword />)}
            </AuthRoute>
          )}
        />
        <Route
          path="/app/assessment/public/:campaignId"
          element={withSuspense(<AssessmentPublicPage />)}
        />
        {/* 公开工具 */}
        <Route
          path="/tool/:id"
          element={withSuspense(<ToolDetail />)}
        />

        <Route path="/workspaces" element={withSuspense(<WorkspaceSelectPage />)} />
        <Route path="/workspaces/select" element={withSuspense(<WorkspaceSelectPage />)} />
        <Route path="/launcher" element={withSuspense(<LauncherPage />)} />

        {/* ============================================
            🏠 应用层 — 需登录且具备 app 入口权限
            ============================================ */}
        <Route
          path="/app/*"
          element={(
            <SurfaceProtectedRoute surface="app">
              {withSuspense(<AppLayout />)}
            </SurfaceProtectedRoute>
          )}
        />

        {/* ============================================
            🧭 执行端 — 需登录且具备 ops 入口权限
            ============================================ */}
        <Route
          path="/ops/*"
          element={(
            <SurfaceProtectedRoute surface="ops">
              {withSuspense(<OpsLayout />)}
            </SurfaceProtectedRoute>
          )}
        />

        {/* ============================================
            ⚙️ 管理后台 — 需具备 admin 入口权限
            ============================================ */}
        <Route
          path="/admin/*"
          element={(
            <SurfaceProtectedRoute surface="admin">
              {withSuspense(<AdminLayout />)}
            </SurfaceProtectedRoute>
          )}
        />

        {/* ============================================
            🎨 沉浸式工具 — 需管理员
            ============================================ */}
        <Route
          path="/asset-designer"
          element={(
            <SurfaceProtectedRoute surface="app">
              <CapabilityProtectedRoute scope="inventory" capability="3d_studio">
                {withSuspense(<AssetDesigner />)}
              </CapabilityProtectedRoute>
            </SurfaceProtectedRoute>
          )}
        />



        {/* ============================================
            ↪️ 兼容重定向
            ============================================ */}
        <Route path="/map" element={<Navigate to="/app/map" replace />} />

        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </div>
  )
}

export default App

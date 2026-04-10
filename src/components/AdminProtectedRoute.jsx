import { Navigate, useLocation } from 'react-router-dom'
import useAuthStore from '../stores/authStore'

function AdminProtectedRoute({ children }) {
  const { isAuthenticated, isBootstrapping, user } = useAuthStore()
  const canAccessAdmin = useAuthStore((state) => state.canAccessAdmin)
  const location = useLocation()

  if (isBootstrapping) {
    return (
      <div className="layout--admin tectonic-access-state">
        <div className="tectonic-access-state__content">
          <div className="tectonic-access-state__spinner" aria-hidden="true" />
          <p className="tectonic-access-state__copy">正在校验管理后台权限…</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (user?.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  if (!canAccessAdmin()) {
    return (
      <div className="layout--admin tectonic-access-state">
        <div className="tectonic-access-state__content">
          <div className="tectonic-access-state__icon">!</div>
          <h2 className="tectonic-access-state__title">权限不足</h2>
          <p className="tectonic-access-state__copy">当前账号没有访问管理后台的权限。</p>
          <a href="/" className="btn btn--primary">返回首页</a>
        </div>
      </div>
    )
  }

  return children
}

export default AdminProtectedRoute

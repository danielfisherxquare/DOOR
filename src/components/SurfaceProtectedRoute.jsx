import { Navigate, useLocation } from 'react-router-dom'
import useAuthStore from '../stores/authStore'

function SurfaceProtectedRoute({ surface, children }) {
  const { isAuthenticated, isBootstrapping, user } = useAuthStore()
  const canAccessSurface = useAuthStore((state) => state.canAccessSurface)
  const location = useLocation()

  if (isBootstrapping) {
    return (
      <div className={`layout--${surface} tectonic-access-state`}>
        <div className="tectonic-access-state__content">
          <div className="tectonic-access-state__spinner" aria-hidden="true" />
          <p className="tectonic-access-state__copy">正在校验当前入口权限…</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (user?.mustChangePassword && location.pathname !== '/app/settings') {
    return <Navigate to="/app/settings" replace />
  }

  if (!canAccessSurface(surface)) {
    return (
      <div className={`layout--${surface} tectonic-access-state`}>
        <div className="tectonic-access-state__content">
          <div className="tectonic-access-state__icon">!</div>
          <h2 className="tectonic-access-state__title">权限不足</h2>
          <p className="tectonic-access-state__copy">当前账号没有访问该入口的权限。</p>
          <a href={user?.defaultSurface === 'admin' ? '/admin' : user?.defaultSurface === 'ops' ? '/ops' : '/app'} className="btn btn--primary">返回首页</a>
        </div>
      </div>
    )
  }

  return children
}

export default SurfaceProtectedRoute

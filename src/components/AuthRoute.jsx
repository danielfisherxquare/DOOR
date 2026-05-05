import { Navigate, useLocation } from 'react-router-dom'
import useAuthStore from '../stores/authStore'

/**
 * 通用已登录守卫（不限角色）
 * 用于应用层页面——只要已登录即可访问
 */
function AuthRoute({ children }) {
  const { isAuthenticated, isBootstrapping, user } = useAuthStore()
  const location = useLocation()

  if (isBootstrapping) {
    return (
      <div className="surface-public tectonic-access-state">
        <div className="tectonic-access-state__content">
          <div className="tectonic-access-state__spinner" aria-hidden="true" />
          <p className="tectonic-access-state__copy">正在校验账号状态…</p>
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

  return children
}

export default AuthRoute

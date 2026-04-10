import { Navigate, useSearchParams } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'

/**
 * 机构上下文守卫
 * 用于包裹需要机构上下文的路由组件
 * 如果超级管理员没有选择机构，重定向到管理后台首页
 */
export default function RequireOrg({ children }) {
  const [searchParams] = useSearchParams()
  const orgId = searchParams.get('orgId')
  const isSuperAdmin = useAuthStore((state) => state.user?.role === 'super_admin')

  // 超级管理员必须选择机构才能访问
  if (isSuperAdmin && !orgId) {
    return <Navigate to="/admin?needContext=org" replace />
  }

  return children
}
import useAuthStore from '../stores/authStore';
import { hasModuleAccess as checkModuleAccess } from '../utils/moduleAccess';
import { Navigate } from 'react-router-dom';

/**
 * 模块路由保护组件
 * @param {Object} props
 * @param {string} props.surface - 入口层（app/ops/admin）
 * @param {string} props.moduleId - 模块ID（不含 surface 前缀）
 * @param {React.ReactNode} props.children - 子组件
 */
export default function ModuleProtectedRoute({ surface, moduleId, children }) {
  const user = useAuthStore((state) => state.user);

  // 未登录时不渲染（由 AuthRoute 处理）
  if (!user) {
    return null;
  }

  if (!checkModuleAccess(user, surface, moduleId)) {
    return <Navigate to={`/${surface}`} replace />;
  }

  return children;
}

/**
 * 检查用户是否有模块访问权限（用于条件渲染）
 * @param {Object} user - 用户对象
 * @param {string} surface - 入口层
 * @param {string} moduleId - 模块ID
 * @returns {boolean}
 */
export function hasModuleAccess(user, surface, moduleId) {
  return checkModuleAccess(user, surface, moduleId);
}

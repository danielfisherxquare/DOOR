import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import { buildAdminHref, getAdminNavGroups } from '../../components/admin/adminConfig'
import { resolveSurfaceOrgId, resolveSurfaceRaceId } from '../../utils/surfaceContext'

function AdminDashboard() {
  const user = useAuthStore((state) => state.user)
  const [searchParams] = useSearchParams()
  const isSuperAdmin = user?.role === 'super_admin'
  const selectedOrgId = resolveSurfaceOrgId(searchParams, user)
  const selectedRaceId = resolveSurfaceRaceId(searchParams, user)
  const needContext = searchParams.get('needContext')

  const currentContext = useMemo(
    () => ({ selectedOrgId, selectedRaceId }),
    [selectedOrgId, selectedRaceId],
  )

  const portalGroups = useMemo(
    () => getAdminNavGroups({ isSuperAdmin })
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.key !== 'dashboard'),
      }))
      .filter((group) => group.items.length > 0),
    [isSuperAdmin],
  )
  return (
    <div>
      {needContext === 'org' && isSuperAdmin && (
        <div className="admin-state-banner admin-state-banner--warning">
          当前操作需要先选择机构。请先在右上角方形上下文入口中锁定机构。
        </div>
      )}

      {needContext === 'race' && (
        <div className="admin-state-banner admin-state-banner--warning">
          当前操作需要先选择赛事。请先在右上角方形上下文入口中锁定赛事。
        </div>
      )}
      <h3 className="app-portal-section-title">COMMAND_MODULES</h3>
      {portalGroups.map((group) => (
        <section key={group.key} className="app-portal-group">
          <div className="app-portal-group__header">
            <h4 className="app-portal-group__title">{group.label}</h4>
          </div>
          <div className="app-portal-grid">
            {group.items.map((item) => (
              <Link key={item.key} to={buildAdminHref(item.path, currentContext)} className="app-portal-card">
                <div className="app-portal-card__header">
                  <div className="app-portal-card__icon-box">
                    <span className="material-symbols-outlined">{item.icon || 'apps'}</span>
                  </div>
                  <span className="app-portal-card__title">{item.label}</span>
                </div>
                <span className="app-portal-card__description">{item.cardDescription || item.description}</span>
                <span className="app-portal-card__action">
                  ENTER <span className="material-symbols-outlined">arrow_forward</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export default AdminDashboard

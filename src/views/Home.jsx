import { Link, useSearchParams } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import { getAppNavGroups, buildAppHref } from '../components/app/appConfig'
import { resolveSurfaceOrgId, resolveSurfaceRaceId } from '../utils/surfaceContext'

function Home() {
  const user = useAuthStore((state) => state.user)
  const hasCapability = useAuthStore((state) => state.hasCapability)
  const [searchParams] = useSearchParams()
  const currentContext = {
    orgId: resolveSurfaceOrgId(searchParams, user),
    raceId: resolveSurfaceRaceId(searchParams, user),
  }
  const portalGroups = getAppNavGroups(hasCapability)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.key !== 'dashboard'),
    }))
    .filter((group) => group.items.length > 0)
  return (
    <div>
      {/* 应用入口卡片网格 */}
      <h3 className="app-portal-section-title">FUNCTIONAL_MODULES</h3>
      {portalGroups.map((group) => (
        <section key={group.key} className="app-portal-group">
          <div className="app-portal-group__header">
            <h4 className="app-portal-group__title">{group.label}</h4>
          </div>
          <div className="app-portal-grid">
            {group.items.map((item) => (
              <Link key={item.key} to={buildAppHref(item.path, currentContext)} className="app-portal-card">
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

export default Home

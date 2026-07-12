import { Link } from 'react-router-dom'

export default function SurfaceMobileMenu({
  eyebrow,
  title,
  menuLabel,
  onClose,
  beforeNavigation,
  navGroups,
  getHref,
  isActive,
  user,
  userFallback,
  roleName,
  onLogout,
}) {
  return (
    <div className="workspace-mobile-menu" role="presentation">
      <button
        type="button"
        className="workspace-mobile-menu__backdrop"
        onClick={onClose}
        aria-label={`关闭${menuLabel}`}
      />
      <aside className="workspace-mobile-menu__panel" aria-label={menuLabel}>
        <div className="workspace-mobile-menu__header">
          <div>
            <span className="workspace-mobile-menu__eyebrow">{eyebrow}</span>
            <h2 className="workspace-mobile-menu__title">{title}</h2>
          </div>
          <button type="button" className="workspace-mobile-menu__close" onClick={onClose} aria-label={`关闭${menuLabel}`}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {beforeNavigation}
        <nav className="workspace-mobile-menu__nav">
          {navGroups.map((group) => (
            <section key={group.key} className="workspace-mobile-menu__section">
              <span className="workspace-mobile-menu__section-title">{group.label}</span>
              <div className="workspace-mobile-menu__links">
                {group.items.map((item) => (
                  <Link
                    key={item.key}
                    to={getHref(item)}
                    className={`workspace-mobile-menu__link ${isActive(item) ? 'workspace-mobile-menu__link--active' : ''}`}
                  >
                    <span className="material-symbols-outlined">{item.icon || 'circle'}</span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </nav>
        <div className="workspace-mobile-menu__footer">
          <span>{user?.username || userFallback} · {roleName}</span>
          <div className="workspace-mobile-menu__footer-actions">
            <Link to="/launcher" onClick={onClose}>切换入口</Link>
            <button type="button" onClick={onLogout}>退出登录</button>
          </div>
        </div>
      </aside>
    </div>
  )
}

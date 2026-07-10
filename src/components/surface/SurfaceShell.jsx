import SurfaceMobileMenu from './SurfaceMobileMenu'
import SurfaceSidebar from './SurfaceSidebar'

export default function SurfaceShell({
  surface,
  sidebarCollapsed,
  sidebarMotionClass,
  sidebarProps,
  mobileMenuOpen,
  mobileMenuProps,
  onOpenMobileMenu,
  topbarTitle,
  topbarActions,
  contextControl,
  user,
  userFallback,
  pageKickers,
  roleName,
  pageTitle,
  pageSummary,
  notice,
  children,
  footerOverlay,
}) {
  const initials = user?.username?.slice(0, 2)?.toUpperCase() || userFallback.slice(0, 2).toUpperCase()
  return (
    <div className={`layout--${surface} workspace-layout ${sidebarCollapsed ? 'workspace-layout--collapsed' : ''} ${sidebarMotionClass}`.trim()}>
      <SurfaceSidebar
        {...sidebarProps}
        sidebarCollapsed={sidebarCollapsed}
        user={user}
        userFallback={userFallback}
        roleName={roleName}
      />
      <main className="workspace-main">
        <header className="workspace-main__topbar">
          <div className="workspace-main__topbar-left">
            <button
              type="button"
              className="workspace-main__mobile-menu-btn"
              onClick={onOpenMobileMenu}
              aria-label={`打开${mobileMenuProps.menuLabel}`}
              aria-expanded={mobileMenuOpen}
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span className="workspace-main__topbar-title">{topbarTitle}</span>
          </div>
          <div className="workspace-main__topbar-right">
            <div className="workspace-main__topbar-search">
              <input type="text" placeholder="搜索..." />
              <span className="material-symbols-outlined">search</span>
            </div>
            {topbarActions}
            <button type="button" className="workspace-main__topbar-btn" title="通知">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            {contextControl}
            <div className="workspace-main__topbar-user">
              <span className="workspace-main__topbar-avatar">{initials}</span>
            </div>
          </div>
        </header>
        <section className="workspace-main__page-header">
          <div className="workspace-main__page-header-inner">
            <div className="workspace-main__eyebrow-row">
              <span className="workspace-kicker">{pageKickers[0]}</span>
              <span className="workspace-role-pill">{roleName}</span>
              <span className="workspace-kicker">{pageKickers[1]}</span>
            </div>
            <h1 className="workspace-main__title">{pageTitle}</h1>
            {pageSummary ? <p className="workspace-main__summary">{pageSummary}</p> : null}
          </div>
        </section>
        {notice}
        <section className="workspace-main__content">{children}</section>
      </main>
      {mobileMenuOpen ? (
        <SurfaceMobileMenu
          {...mobileMenuProps}
          user={user}
          userFallback={userFallback}
          roleName={roleName}
        />
      ) : null}
      {footerOverlay}
    </div>
  )
}

import './PageHeader.css'

export default function PageHeader({ groupLabel, routeMeta, user }) {
  const getRoleName = (user) => {
    if (!user) return '用户'
    if (user.role === 'super_admin') return '超级管理员'
    if (user.role === 'org_admin') return '机构管理员'
    if (user.role === 'race_admin') return '赛事管理员'
    if (user.role === 'user') return '普通用户'
    return '普通用户'
  }

  return (
    <section className="page-header">
      <div className="page-header__main">
        <div className="page-header__eyebrow-row">
          <span className="page-header__kicker">{routeMeta?.sectionLabel || groupLabel || '工作区'}</span>
          <span className="page-header__role-pill">{getRoleName(user)}</span>
          <span className="page-header__kicker">{routeMeta?.surfaceCode || 'APP'}</span>
        </div>
        <h1 className="page-header__title">{routeMeta?.title || '页面'}</h1>
        {routeMeta?.summary && (
          <p className="page-header__summary">{routeMeta.summary}</p>
        )}
      </div>
    </section>
  )
}

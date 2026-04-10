import './UserCard.css'

export default function UserCard({ user, onLogout }) {
  const getRoleName = (user) => {
    if (!user) return '用户'
    if (user.role === 'super_admin') return '超级管理员'
    if (user.role === 'org_admin') return '机构管理员'
    if (user.role === 'race_admin') return '赛事管理员'
    if (user.role === 'user') return '普通用户'
    return '普通用户'
  }

  return (
    <div className="user-card">
      <div className="user-card__avatar">
        {user?.username?.slice(0, 2)?.toUpperCase() || 'U'}
      </div>
      <div className="user-card__info">
        <span className="user-card__name">{user?.username || '用户'}</span>
        <span className="user-card__role">{getRoleName(user)}</span>
      </div>
      {onLogout && (
        <button type="button" className="btn btn--ghost btn--sm user-card__logout" onClick={onLogout}>
          退出
        </button>
      )}
    </div>
  )
}

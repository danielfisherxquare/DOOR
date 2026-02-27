import { Link } from 'react-router-dom'

function ToolCard({ tool }) {
  const { id, name, description, icon, status } = tool

  const statusText = {
    online: '在线',
    offline: '离线',
    maintenance: '维护中'
  }

  return (
    <Link to={`/tool/${id}`} className="tool-card">
      <div className="tool-card__icon">
        {icon || '🔧'}
      </div>
      <h3 className="tool-card__name">{name}</h3>
      <p className="tool-card__desc">{description}</p>
      <div className={`tool-card__status tool-card__status--${status}`}>
        <span className={`status-dot status-dot--${status}`}></span>
        {statusText[status] || '未知'}
      </div>
    </Link>
  )
}

export default ToolCard
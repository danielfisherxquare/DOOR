import { Link } from 'react-router-dom'

// 工具类型到图标颜色的映射
const TOOL_ICON_THEMES = {
  // 默认深灰
  default: '',
  // 运动相关 - 绿色
  sports: 'tool-card__icon--success',
  // 数据分析 - 紫色
  analytics: 'tool-card__icon--purple',
  // 创意工具 - 强调色
  creative: 'tool-card__icon--accent',
  // 系统工具 - 默认
  system: '',
}

// 根据工具名称或类型推断图标主题
function getIconTheme(tool) {
  const name = (tool.name || '').toLowerCase()
  const type = tool.type || ''

  // 运动相关工具
  if (name.includes('赛事') || name.includes('比赛') || name.includes('运动') || type === 'sports') {
    return TOOL_ICON_THEMES.sports
  }
  // 数据分析工具
  if (name.includes('统计') || name.includes('分析') || name.includes('报表') || type === 'analytics') {
    return TOOL_ICON_THEMES.analytics
  }
  // 创意工具
  if (name.includes('设计') || name.includes('编辑') || name.includes('生成') || type === 'creative') {
    return TOOL_ICON_THEMES.creative
  }

  return TOOL_ICON_THEMES.default
}

function ToolCard({ tool }) {
  const { id, name, description, icon, status } = tool
  const iconTheme = getIconTheme(tool)

  const statusText = {
    online: '在线',
    offline: '离线',
    maintenance: '维护中'
  }

  return (
    <Link to={tool.path || `/tool/${id}`} className="tool-card">
      <div className={`tool-card__icon ${iconTheme}`}>
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

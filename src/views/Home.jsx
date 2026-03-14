import { useEffect } from 'react'
import ToolCard from '../components/ToolCard'
import useToolsStore from '../stores/toolsStore'

// 骨架屏卡片组件
function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton--icon"></div>
      <div className="skeleton skeleton--text" style={{ width: '60%' }}></div>
      <div className="skeleton skeleton--text-sm"></div>
      <div className="skeleton skeleton--text" style={{ width: '40%', height: '24px', borderRadius: '9999px' }}></div>
    </div>
  )
}

function Home() {
  const { tools, isLoading, error, fetchTools } = useToolsStore()

  useEffect(() => {
    fetchTools()
  }, [fetchTools])

  // 统计在线工具数量
  const onlineCount = tools.filter(t => t.status === 'online').length

  return (
    <div className="home">
      {/* 页面标题 */}
      <header className="home__header">
        <h1 className="home__title">
          欢迎使用工具门户
        </h1>
        <p className="home__subtitle">
          选择您需要使用的工具
        </p>

        {/* 统计徽章 */}
        {!isLoading && !error && tools.length > 0 && (
          <div className="home__stats">
            <span className="pill pill--purple">{tools.length} 个工具</span>
            <span className="pill pill--green">{onlineCount} 个在线</span>
          </div>
        )}
      </header>

      {/* 骨架屏加载状态 */}
      {isLoading && (
        <div className="skeleton-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* 错误状态 */}
      {error && (
        <div className="error-card">
          <p className="error-card__message">加载失败：{error}</p>
          <button
            className="btn btn--secondary"
            onClick={fetchTools}
          >
            重试
          </button>
        </div>
      )}

      {/* 工具网格 */}
      {!isLoading && !error && tools.length > 0 && (
        <div className="grid grid--tools">
          {tools.map(tool => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      )}

      {/* 空状态 */}
      {!isLoading && !error && tools.length === 0 && (
        <div className="empty-state">
          <p className="empty-state__message">
            暂无可用工具
          </p>
        </div>
      )}

    </div>
  )
}

export default Home
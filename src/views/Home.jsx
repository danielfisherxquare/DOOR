import { useEffect } from 'react'
import ToolCard from '../components/ToolCard'
import useToolsStore from '../stores/toolsStore'

function Home() {
  const { tools, isLoading, error, fetchTools } = useToolsStore()

  useEffect(() => {
    fetchTools()
  }, [fetchTools])

  return (
    <div className="home">
      {/* 页面标题 */}
      <div style={{
        textAlign: 'center',
        marginBottom: 'var(--spacing-xl)',
        paddingTop: 'var(--spacing-md)'
      }}>
        <h1 style={{
          fontSize: 'var(--font-size-3xl)',
          fontWeight: 700,
          color: 'var(--color-text-primary)',
          marginBottom: 'var(--spacing-sm)'
        }}>
          欢迎使用工具门户
        </h1>
        <p style={{
          fontSize: 'var(--font-size-md)',
          color: 'var(--color-text-secondary)'
        }}>
          选择您需要使用的工具
        </p>
      </div>

      {/* 加载状态 */}
      {isLoading && (
        <div style={{
          textAlign: 'center',
          padding: 'var(--spacing-2xl)',
          color: 'var(--color-text-secondary)'
        }}>
          <div style={{
            width: 40,
            height: 40,
            border: '3px solid var(--color-bg-card)',
            borderTopColor: 'var(--color-accent)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto var(--spacing-md)'
          }}></div>
          加载中...
        </div>
      )}

      {/* 错误状态 */}
      {error && (
        <div className="card" style={{
          textAlign: 'center',
          color: 'var(--color-danger)',
          maxWidth: 400,
          margin: '0 auto'
        }}>
          <p>加载失败: {error}</p>
          <button
            className="btn btn--secondary"
            onClick={fetchTools}
            style={{ marginTop: 'var(--spacing-md)' }}
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
        <div className="card" style={{
          textAlign: 'center',
          maxWidth: 400,
          margin: '0 auto'
        }}>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            暂无可用工具
          </p>
        </div>
      )}

      {/* 统计信息 */}
      {!isLoading && !error && tools.length > 0 && (
        <div style={{
          marginTop: 'var(--spacing-xl)',
          textAlign: 'center',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--font-size-sm)'
        }}>
          共 {tools.length} 个工具 · {
            tools.filter(t => t.status === 'online').length
          } 个在线
        </div>
      )}

    </div>
  )
}

export default Home
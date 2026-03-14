import { useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { WrenchScrewdriverIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid'
import useToolsStore from '../stores/toolsStore'

// 导入工具组件
import MechanicalClock from '../components/tools/MechanicalClock'
import MechanicalClock3D from '../components/tools/MechanicalClock3D'
import AppDownload from '../components/tools/AppDownload'

// 工具组件映射
const TOOL_COMPONENTS = {
  'MechanicalClock': MechanicalClock,
  'MechanicalClock3D': MechanicalClock3D,
  'AppDownload': AppDownload,
}

function ToolDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { currentTool, isLoading, fetchToolById, invokeTool } = useToolsStore()

  useEffect(() => {
    fetchToolById(id)
  }, [id, fetchToolById])

  const handleInvoke = async () => {
    const result = await invokeTool(id, {})
    if (result.success) {
      alert('操作成功！')
    }
  }

  const statusText = {
    online: '在线',
    offline: '离线',
    maintenance: '维护中'
  }

  // 渲染工具内容
  const renderToolContent = () => {
    // 如果工具离线或维护中
    if (currentTool?.status === 'offline') {
      return (
        <div className="tool-detail__offline">
          <div className="flex items-center justify-center gap-2">
            <ExclamationTriangleIcon className="w-6 h-6 text-yellow-500" />
            <p>该工具当前离线，请稍后再试</p>
          </div>
        </div>
      )
    }

    if (currentTool?.status === 'maintenance') {
      return (
        <div className="tool-detail__maintenance">
          <div className="flex items-center justify-center gap-2">
            <WrenchScrewdriverIcon className="w-6 h-6 text-gray-500" />
            <p>该工具正在维护中，敬请期待</p>
          </div>
        </div>
      )
    }

    // 根据组件名称渲染对应工具
    const componentName = currentTool?.component
    if (componentName && TOOL_COMPONENTS[componentName]) {
      const ToolComponent = TOOL_COMPONENTS[componentName]
      return <ToolComponent />
    }

    // 默认占位内容
    return (
      <div className="tool-detail__placeholder">
        <p className="tool-detail__placeholder-text">
          工具功能区域 - 待对接后台服务
        </p>
        <p className="tool-detail__placeholder-api">
          API 端点：{currentTool?.apiEndpoint}
        </p>
        <button
          className="btn btn--primary"
          onClick={handleInvoke}
        >
          测试调用
        </button>
      </div>
    )
  }

  if (isLoading || !currentTool) {
    return (
      <div className="tool-detail">
        <div className="loading-state">
          <div className="loading-state__spinner"></div>
          加载中...
        </div>
      </div>
    )
  }

  // 沉浸式全屏布局：机械时钟专用
  const componentName = currentTool?.component
  if (componentName === 'MechanicalClock' || componentName === 'MechanicalClock3D') {
    const ToolComponent = TOOL_COMPONENTS[componentName]
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--color-bg-card)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* 左上角圆形 Soft Design 返回按钮 */}
        <button
          onClick={() => navigate('/')}
          className="clock-back-btn"
          title="返回首页"
          style={{
            position: 'fixed',
            top: '3vh',
            left: '3vh',
            width: 48,
            height: 48,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all 150ms ease',
            zIndex: 101,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>

        <ToolComponent />
      </div>
    )
  }

  return (
    <div className="tool-detail">
      {/* 返回按钮 */}
      <Link
        to="/"
        className="btn btn--ghost"
        style={{ marginBottom: 'var(--spacing-lg)', alignSelf: 'flex-start' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        返回首页
      </Link>

      {/* 工具头部信息 */}
      <div className="tool-detail__header">
        <div className="tool-detail__icon">
          {currentTool.icon || <WrenchScrewdriverIcon className="w-10 h-10" />}
        </div>
        <div className="tool-detail__info">
          <h1>{currentTool.name}</h1>
          <p>{currentTool.description}</p>
          <div className="tool-detail__status-row">
            <span className={`tool-card__status tool-card__status--${currentTool.status}`}>
              <span className={`status-dot status-dot--${currentTool.status}`}></span>
              {statusText[currentTool.status]}
            </span>
          </div>
        </div>
      </div>

      {/* 工具内容区域 */}
      <div className="tool-detail__content">
        {renderToolContent()}
      </div>
    </div>
  )
}

export default ToolDetail

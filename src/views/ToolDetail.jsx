import { useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import useToolsStore from '../stores/toolsStore'
import {
  CommandEmptyState,
  CommandNotice,
  CommandPanel,
  CommandStatusTag,
} from '../components/command/CommandPrimitives'
import '../styles/command-console.css'

// 导入工具组件
import MechanicalClock from '../components/tools/MechanicalClock'
import MechanicalClock3D from '../components/tools/MechanicalClock3D'

// 工具组件映射
const TOOL_COMPONENTS = {
  MechanicalClock: MechanicalClock,
  MechanicalClock3D: MechanicalClock3D,
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
    maintenance: '维护中',
  }

  // 渲染工具内容
  const renderToolContent = () => {
    // 如果工具离线或维护中
    if (currentTool?.status === 'offline') {
      return (
        <CommandEmptyState
          title="该工具当前离线"
          description="请稍后再试，或返回首页切换到其他可用工具。"
          icon="OFF"
        />
      )
    }

    if (currentTool?.status === 'maintenance') {
      return (
        <CommandEmptyState
          title="该工具正在维护中"
          description="维护完成后将恢复可用，请稍后再进入。"
          icon="MA"
        />
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
        <p className="tool-detail__placeholder-text">工具功能区域 - 待对接后台服务</p>
        <p className="tool-detail__placeholder-api">API 端点：{currentTool?.apiEndpoint}</p>
        <button className="btn btn--primary" onClick={handleInvoke}>
          测试调用
        </button>
      </div>
    )
  }

  if (isLoading || !currentTool) {
    return (
      <div className="command-tool-page surface-public">
        <div className="command-tool-page__wrap">
          <CommandPanel title="工具加载中" subtitle="正在读取工具配置与状态。">
            <CommandNotice tone="info">加载中...</CommandNotice>
          </CommandPanel>
        </div>
      </div>
    )
  }

  // 沉浸式全屏布局：机械时钟专用
  const componentName = currentTool?.component
  if (componentName === 'MechanicalClock' || componentName === 'MechanicalClock3D') {
    const ToolComponent = TOOL_COMPONENTS[componentName]
    return (
      <div className="command-tool-fullscreen">
        <button onClick={() => navigate('/')} className="command-tool-back" title="返回首页">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>

        <ToolComponent />
      </div>
    )
  }

  return (
    <div className="command-tool-page surface-public">
      <div className="command-tool-page__wrap">
        <CommandPanel
          title={currentTool.name}
          subtitle={currentTool.description}
          actions={
            <div className="command-actions-row">
              <Link to="/" className="btn btn--ghost">
                返回首页
              </Link>
              <CommandStatusTag
                tone={
                  currentTool.status === 'online'
                    ? 'success'
                    : currentTool.status === 'maintenance'
                      ? 'warning'
                      : 'danger'
                }
              >
                {statusText[currentTool.status]}
              </CommandStatusTag>
            </div>
          }
        >
          {currentTool.apiEndpoint ? (
            <div className="command-token">{currentTool.apiEndpoint}</div>
          ) : null}
        </CommandPanel>

        <CommandPanel
          title="工具内容"
          subtitle="公开工具也对齐为轻量版指挥台语言，保留工具本体但统一外围壳层。"
        >
          {renderToolContent()}
        </CommandPanel>
      </div>
    </div>
  )
}

export default ToolDetail

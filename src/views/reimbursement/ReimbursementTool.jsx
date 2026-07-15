/**
 * Reimbursement Tool
 * 发票报销助手 - 主页面
 */

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import useReimbursementStore from '../../stores/reimbursementStore'
import {
  AppH5Notice,
  AppH5Panel,
  AppH5Surface,
  AppH5Tabs,
} from '../../components/app/AppH5Surface'
import './reimbursement.css'

// 子组件
import ProjectSelector from './components/ProjectSelector';
import PreviewWorkspace from './components/PreviewWorkspace';
import ReimbursementTable from './components/ReimbursementTable';
import ReimbursementMobileHome from './components/ReimbursementMobileHome';
import LlmConfigModal from './components/LlmConfigModal';
import MatchingCenterModal from './components/MatchingCenterModal';
import AttachmentManager from './components/AttachmentManager';
import ProjectManagementPage from './components/ProjectManagementPage';

// 图标
const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)

const SettingsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

function ReimbursementTool() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    activeProjectId,
    activeProject,
    records,
    isLoading,
    error,
    pendingMatches,
    llmConfig,
    hasServerLlmConfig,
    fetchSettings,
    fetchProjects,
    clearError,
  } = useReimbursementStore()

  const [showLlmConfig, setShowLlmConfig] = useState(false)
  const [showMatchingCenter, setShowMatchingCenter] = useState(false)
  const [showRecords, setShowRecords] = useState(false)
  const [showAttachments, setShowAttachments] = useState(false)
  const [focusRecordId, setFocusRecordId] = useState(null)
  const isProjectManager = location.pathname === '/app/reimbursements/projects'

  // 计算附件数量
  const attachmentCount = records?.reduce((sum, r) => sum + (r.attachments?.length || 0), 0) || 0

  // 计算模型配置状态
  const hasLlmConfig = Boolean(hasServerLlmConfig || (llmConfig?.apiKey && llmConfig?.baseUrl))
  const reimbursementTabs = [
    {
      key: 'import',
      label: '导入与识别',
      active: !showRecords && !showAttachments,
      onClick: () => { setShowRecords(false); setShowAttachments(false); },
    },
    {
      key: 'records',
      label: '报销明细',
      badge: activeProject?.record_count || 0,
      active: showRecords,
      onClick: () => { setShowRecords(true); setShowAttachments(false); },
    },
    {
      key: 'attachments',
      label: '票据管理',
      badge: attachmentCount,
      active: showAttachments,
      onClick: () => { setShowAttachments(true); setShowRecords(false); },
    },
  ]

  // 获取项目列表
  useEffect(() => {
    fetchSettings().catch(() => undefined)
    fetchProjects()
  }, [fetchProjects, fetchSettings])

  return (
    <div className="reimbursement-page">
      <AppH5Surface
        eyebrow="报销工具"
        title="发票报销控制面"
        summary="围绕导入凭证、识别校对、汇总明细与导出归档组织单线流程，避免发票与付款凭证分散在多套工作区。"
        actions={(
          <div className="command-actions-row reimbursement-header-actions">
            <button
              className="btn btn--ghost"
              onClick={() => navigate('/app')}
            >
              <BackIcon />
              返回工作台
            </button>
            {activeProjectId && !isProjectManager && (
              <>
                <ProjectSelector />
              </>
            )}
            <button
              className="btn btn--ghost"
              onClick={() => navigate({
                pathname: isProjectManager ? '/app/reimbursements' : '/app/reimbursements/projects',
                search: location.search,
              })}
            >
              {isProjectManager ? '返回工作区' : '项目管理'}
            </button>
            <div className="reimbursement-config-area">
              <span className={`config-status-badge ${hasLlmConfig ? 'config-status-badge--ok' : 'config-status-badge--warning'}`}>
                {hasLlmConfig ? '✓ 已配置' : '⚠ 需配置'}
              </span>
              <button
                className={`btn ${hasLlmConfig ? 'btn--ghost' : 'btn--primary'}`}
                onClick={() => setShowLlmConfig(true)}
              >
                <SettingsIcon />
                模型配置
              </button>
            </div>
          </div>
        )}
      >
        {error ? (
          <AppH5Notice tone="danger">
            {error}
            <button className="btn btn--ghost btn--sm" onClick={clearError}>关闭</button>
          </AppH5Notice>
        ) : null}

        {isLoading ? <AppH5Notice tone="info">正在加载报销项目和识别配置...</AppH5Notice> : null}

        {/* 未配置模型警告 - 借鉴Admin的admin-state-banner */}
        {activeProjectId && !hasLlmConfig && !isLoading ? (
          <AppH5Notice tone="warning" className="reimbursement-warning-banner">
            <span className="reimbursement-warning-banner__icon">⚠️</span>
            <span className="reimbursement-warning-banner__text">
              尚未配置 OCR 模型。请点击"模型配置"按钮完成设置，或确认服务端已配置默认模型。
            </span>
            <button
              className="btn btn--sm btn--primary"
              onClick={() => setShowLlmConfig(true)}
            >
              立即配置
            </button>
          </AppH5Notice>
        ) : null}

      {isProjectManager ? (
        <ProjectManagementPage />
      ) : !activeProjectId ? (
        <AppH5Panel title="先选择项目" summary="请先创建或切换到一个报销项目，然后再开始导入发票与付款凭证。">
          <div className="reimbursement-tool__welcome">
            <div className="reimbursement-tool__empty-actions">
              <ProjectSelector showCreate />
              <button
                className="btn btn--ghost"
                onClick={() => navigate({ pathname: '/app/reimbursements/projects', search: location.search })}
              >
                进入项目管理
              </button>
            </div>
          </div>
        </AppH5Panel>
      ) : (
        <>
          {/* 待匹配项提示 */}
          {pendingMatches.length > 0 && !showRecords && !showAttachments && (
            <AppH5Panel title="待处理冲突" summary="存在无法自动匹配的付款凭证，需要手动确认。" tone="warning">
              <div className="reimbursement-alert reimbursement-alert--warning">
                <span className="reimbursement-alert__icon">⚠️</span>
                <span className="reimbursement-alert__text">
                  发现 {pendingMatches.length} 笔付款凭证需要手动匹配
                </span>
                <button
                  className="btn btn--primary btn--sm"
                  onClick={() => setShowMatchingCenter(true)}
                >
                  处理冲突
                </button>
              </div>
            </AppH5Panel>
          )}

          {/* 统一标签栏 */}
          <AppH5Tabs items={reimbursementTabs} ariaLabel="报销视图" />

          {/* 内容区域 */}
          {showRecords ? (
            <ReimbursementTable
              focusRecordId={focusRecordId}
              onFocusRecordHandled={() => setFocusRecordId(null)}
            />
          ) : showAttachments ? (
            <AttachmentManager projectId={activeProjectId} />
          ) : (
            <div className="reimbursement-tool__content">
              <div className="reimbursement-tool__mobile-content">
                <ReimbursementMobileHome
                  projectId={activeProjectId}
                  records={records}
                  pendingMatches={pendingMatches}
                  onOpenRecord={(recordId) => {
                    setFocusRecordId(recordId)
                    setShowRecords(true)
                    setShowAttachments(false)
                  }}
                />
              </div>
              <div className="reimbursement-tool__desktop-content">
                <PreviewWorkspace
                  projectId={activeProjectId}
                  onOpenRecord={(recordId) => {
                    setFocusRecordId(recordId)
                    setShowRecords(true)
                    setShowAttachments(false)
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}
      </AppH5Surface>

      {/* LLM配置弹窗 */}
      <LlmConfigModal
        visible={showLlmConfig}
        onClose={() => setShowLlmConfig(false)}
      />

      {/* 待匹配项中心 */}
      <MatchingCenterModal
        visible={showMatchingCenter}
        onClose={() => setShowMatchingCenter(false)}
      />
    </div>
  )
}

export default ReimbursementTool

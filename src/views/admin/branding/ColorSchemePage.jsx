/**
 * ColorSchemePage
 * 配色方案管理页面 - 支持按层级（admin/app/ops）区分配色
 */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import useAuthStore from '../../../stores/authStore'
import useColorSchemeStore, { defaultConfigBySurface } from '../../../stores/colorSchemeStore'
import { CommandPanel, CommandNotice } from '../../../components/command/CommandPrimitives'
import ColorPaletteEditor from './components/ColorPaletteEditor'
import ColorPreviewPanel from './components/ColorPreviewPanel'
import PresetSchemeList from './components/PresetSchemeList'
import { exportSchemeAsJson, exportSchemeAsCss, importSchemeFromJson, applyColorScheme, removeColorScheme } from './utils/colorUtils'
import './ColorSchemePage.css'

const DownloadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

const UploadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

const SaveIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
)

const RotateIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)

const SURFACE_OPTIONS = [
  { value: 'admin', label: '管理层 (Admin)', description: '后台管理系统配色' },
  { value: 'app', label: '应用层 (App)', description: '用户应用界面配色' },
  { value: 'ops', label: '执行层 (Ops)', description: '执行操作界面配色' },
]

function ColorSchemePage() {
  const [searchParams] = useSearchParams()
  const user = useAuthStore((state) => state.user)

  const orgId = searchParams.get('orgId') || user?.orgId
  const isSuperAdmin = user?.role === 'super_admin'
  const isOrgAdmin = user?.role === 'org_admin'
  const canEdit = isSuperAdmin || (isOrgAdmin && orgId === user?.orgId)

  const {
    currentOrgScheme,
    currentConfig,
    currentSurface,
    isLoading,
    isSaving,
    error,
    loadOrgScheme,
    loadCustomSchemes,
    setOrgScheme,
    resetOrgScheme,
    updateCurrentConfig,
    createScheme,
    setCurrentSurface,
    clearError,
  } = useColorSchemeStore()

  const [showSaveModal, setShowSaveModal] = useState(false)
  const [newSchemeName, setNewSchemeName] = useState('')
  const [newSchemeDescription, setNewSchemeDescription] = useState('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [previewMode, setPreviewMode] = useState('default')

  // 加载机构配色
  useEffect(() => {
    if (orgId) {
      loadOrgScheme(orgId, currentSurface)
      loadCustomSchemes(orgId, currentSurface)
    }
  }, [orgId, currentSurface])

  // 应用配色到整个系统
  useEffect(() => {
    if (previewMode === 'live' && currentConfig) {
      applyColorScheme(currentConfig, currentSurface)
    } else if (previewMode === 'default') {
      removeColorScheme()
    }
  }, [currentConfig, previewMode, currentSurface])

  // 清理：组件卸载时移除配色
  useEffect(() => {
    return () => {
      removeColorScheme()
    }
  }, [])

  // 切换层级时重置预览模式
  const handleSurfaceChange = (e) => {
    const newSurface = e.target.value
    setCurrentSurface(newSurface)
    setHasUnsavedChanges(false)
  }

  const handleSelectPreset = async (scheme) => {
    if (!canEdit) return

    const success = await setOrgScheme(orgId, currentSurface, scheme.id)
    if (success) {
      setHasUnsavedChanges(false)
      // 立即应用配色到整个系统
      const defaultConfig = defaultConfigBySurface[currentSurface] || defaultConfigBySurface.admin
      const newConfig = { ...defaultConfig, ...scheme.config }
      updateCurrentConfig(newConfig)
      applyColorScheme(newConfig, currentSurface)
    }
  }

  const handleConfigChange = (updates) => {
    updateCurrentConfig(updates)
    setHasUnsavedChanges(true)
  }

  const handleSaveAsNew = async () => {
    if (!newSchemeName.trim()) return

    const scheme = await createScheme({
      name: newSchemeName,
      description: newSchemeDescription,
      config: currentConfig,
    }, orgId, currentSurface)

    if (scheme) {
      setShowSaveModal(false)
      setNewSchemeName('')
      setNewSchemeDescription('')
      setHasUnsavedChanges(false)
    }
  }

  const handleReset = async () => {
    if (!confirm('确定要重置为默认配色吗？')) return
    const success = await resetOrgScheme(orgId, currentSurface)
    if (success) {
      setHasUnsavedChanges(false)
    }
  }

  const handleExportJson = () => {
    const scheme = {
      name: currentOrgScheme?.name || '自定义配色',
      description: currentOrgScheme?.description || '',
      surface: currentSurface,
      config: currentConfig,
    }
    exportSchemeAsJson(scheme)
  }

  const handleExportCss = () => {
    const scheme = {
      name: currentOrgScheme?.name || '自定义配色',
      surface: currentSurface,
      config: currentConfig,
    }
    exportSchemeAsCss(scheme)
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const data = await importSchemeFromJson(file)
      updateCurrentConfig(data.config)
      setHasUnsavedChanges(true)
    } catch (err) {
      alert('导入失败：' + err.message)
    }

    e.target.value = ''
  }

  const currentSchemeId = currentOrgScheme?.id

  return (
    <div className="color-scheme-page">
      <CommandPanel
        title="配色方案"
        subtitle={orgId ? `机构 ID: ${orgId}` : '品牌配色管理'}
        actions={
          <div className="color-scheme-page__actions">
            {hasUnsavedChanges && (
              <span className="color-scheme-page__unsaved">有未保存的更改</span>
            )}

            {/* 层级切换器 */}
            <div className="color-scheme-page__surface-selector">
              <label className="color-scheme-page__surface-label">配色层级：</label>
              <select
                className="color-scheme-page__surface-select"
                value={currentSurface}
                onChange={handleSurfaceChange}
                disabled={!canEdit}
              >
                {SURFACE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span className="color-scheme-page__surface-desc">
                {SURFACE_OPTIONS.find((opt) => opt.value === currentSurface)?.description}
              </span>
            </div>

            {/* 预览模式切换 */}
            <select
              className="color-scheme-page__preview-select"
              value={previewMode}
              onChange={(e) => setPreviewMode(e.target.value)}
            >
              <option value="default">默认预览</option>
              <option value="live">实时预览</option>
            </select>

            {canEdit && (
              <>
                <button className="btn btn--ghost" onClick={() => setShowSaveModal(true)}>
                  <SaveIcon />
                  保存为新方案
                </button>
                <button className="btn btn--ghost" onClick={handleReset}>
                  <RotateIcon />
                  重置
                </button>
              </>
            )}

            <div className="color-scheme-page__export-dropdown">
              <button className="btn btn--ghost">
                <DownloadIcon />
                导出
              </button>
              <div className="color-scheme-page__export-menu">
                <button onClick={handleExportJson}>导出 JSON</button>
                <button onClick={handleExportCss}>导出 CSS</button>
              </div>
            </div>

            <label className="btn btn--ghost">
              <UploadIcon />
              导入
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        }
      >
        {error && (
          <CommandNotice tone="danger">
            {error}
            <button className="btn btn--ghost btn--sm" onClick={clearError}>关闭</button>
          </CommandNotice>
        )}

        {isLoading ? (
          <CommandNotice tone="info">正在加载配色方案...</CommandNotice>
        ) : null}

        <PresetSchemeList
          currentSchemeId={currentSchemeId}
          onSelect={handleSelectPreset}
          orgId={orgId}
          surface={currentSurface}
        />
      </CommandPanel>

      <div className="color-scheme-page__layout">
        <CommandPanel
          title="配色编辑"
          subtitle="调整各层级颜色值"
          className="color-scheme-page__editor"
        >
          <ColorPaletteEditor
            config={currentConfig}
            onChange={handleConfigChange}
            disabled={!canEdit}
          />
        </CommandPanel>

        <CommandPanel
          title="效果预览"
          subtitle={`查看 ${SURFACE_OPTIONS.find((opt) => opt.value === currentSurface)?.label} 的配色效果`}
          className="color-scheme-page__preview"
        >
          <ColorPreviewPanel config={currentConfig} surface={currentSurface} />
        </CommandPanel>
      </div>

      {showSaveModal && (
        <div className="color-scheme-modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="color-scheme-modal" onClick={(e) => e.stopPropagation()}>
            <div className="color-scheme-modal__header">
              <h3>保存为新配色方案</h3>
              <button className="color-scheme-modal__close" onClick={() => setShowSaveModal(false)}>×</button>
            </div>
            <div className="color-scheme-modal__body">
              <div className="color-scheme-modal__field">
                <label>方案名称</label>
                <input
                  type="text"
                  value={newSchemeName}
                  onChange={(e) => setNewSchemeName(e.target.value)}
                  placeholder="如：企业蓝"
                />
              </div>
              <div className="color-scheme-modal__field">
                <label>方案描述</label>
                <textarea
                  value={newSchemeDescription}
                  onChange={(e) => setNewSchemeDescription(e.target.value)}
                  placeholder="简要描述此配色方案的特点"
                  rows={3}
                />
              </div>
              <div className="color-scheme-modal__field">
                <label>适用层级</label>
                <div className="color-scheme-modal__surface-display">
                  {SURFACE_OPTIONS.find((opt) => opt.value === currentSurface)?.label}
                </div>
              </div>
            </div>
            <div className="color-scheme-modal__footer">
              <button className="btn btn--ghost" onClick={() => setShowSaveModal(false)}>取消</button>
              <button
                className="btn btn--primary"
                onClick={handleSaveAsNew}
                disabled={!newSchemeName.trim() || isSaving}
              >
                {isSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ColorSchemePage

/**
 * ColorPreviewPanel
 * 预览面板组件 - 展示配色在实际界面的效果
 * 支持按层级（admin/app/ops）预览
 */

import { useMemo } from 'react'

const SURFACE_LABELS = {
  admin: '管理层',
  app: '应用层',
  ops: '执行层',
}

function ColorPreviewPanel({ config, surface = 'admin' }) {
  const previewStyle = useMemo(() => ({
    '--preview-accent': config?.accent || '#D8262C',
    '--preview-accent-hover': config?.accentHover || '#b30018',
    '--preview-accent-soft': config?.accentSoft || 'rgba(216, 38, 44, 0.08)',
    '--preview-bg': config?.bgPrimary || '#fcf9f8',
    '--preview-surface': config?.surface || '#ffffff',
    '--preview-panel': config?.panel || '#1c1917',
    '--preview-text': config?.textPrimary || '#1b1c1c',
    '--preview-text-secondary': config?.textSecondary || '#454747',
    '--preview-border': config?.border || '#e7e5e4',
    '--preview-text-on-accent': config?.textOnAccent || '#ffffff',
  }), [config])

  return (
    <div className="color-preview-panel" style={previewStyle}>
      <div className="color-preview-panel__surface-indicator">
        <span className="color-preview-panel__surface-badge">
          {SURFACE_LABELS[surface] || surface}
        </span>
        <span className="color-preview-panel__surface-color" style={{ backgroundColor: config?.accent }} />
      </div>

      <div className="color-preview-panel__section">
        <span className="color-preview-panel__section-label">页面头部</span>

        <div className="preview-shell">
          <div className="preview-shell__header">
            <div className="preview-shell__badge">预览</div>
            <div className="preview-shell__title">界面效果演示</div>
            <div className="preview-shell__subtitle">这是副标题说明文字</div>
          </div>
          <div className="preview-shell__actions">
            <button className="preview-btn preview-btn--ghost">取消</button>
            <button className="preview-btn preview-btn--primary">确认</button>
          </div>
        </div>
      </div>

      <div className="color-preview-panel__section">
        <span className="color-preview-panel__section-label">按钮样式</span>

        <div className="preview-buttons">
          <button className="preview-btn preview-btn--primary">主要按钮</button>
          <button className="preview-btn preview-btn--secondary">次要按钮</button>
          <button className="preview-btn preview-btn--ghost">幽灵按钮</button>
        </div>
      </div>

      <div className="color-preview-panel__section">
        <span className="color-preview-panel__section-label">卡片与面板</span>

        <div className="preview-cards">
          <div className="preview-card">
            <div className="preview-card__title">卡片标题</div>
            <div className="preview-card__content">这是卡片内容，展示表面色和文字颜色的组合效果。</div>
            <div className="preview-card__footer">
              <span className="preview-card__tag">标签</span>
            </div>
          </div>

          <div className="preview-card preview-card--panel">
            <div className="preview-card__title">面板标题</div>
            <div className="preview-card__content">深色面板展示，用于侧边栏等区域。</div>
          </div>
        </div>
      </div>

      <div className="color-preview-panel__section">
        <span className="color-preview-panel__section-label">表单元素</span>

        <div className="preview-form">
          <div className="preview-form-item">
            <label className="preview-form-label">输入框</label>
            <input className="preview-input" type="text" placeholder="请输入内容" />
          </div>
          <div className="preview-form-item">
            <label className="preview-form-label">下拉选择</label>
            <select className="preview-select">
              <option>选项一</option>
              <option>选项二</option>
            </select>
          </div>
        </div>
      </div>

      <div className="color-preview-panel__section">
        <span className="color-preview-panel__section-label">状态标签</span>

        <div className="preview-tags">
          <span className="preview-tag preview-tag--accent">强调标签</span>
          <span className="preview-tag preview-tag--success">成功状态</span>
          <span className="preview-tag preview-tag--warning">警告状态</span>
          <span className="preview-tag preview-tag--danger">错误状态</span>
        </div>
      </div>
    </div>
  )
}

export default ColorPreviewPanel
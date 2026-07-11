/**
 * PresetSchemeList
 * 预设配色方案列表组件 - 支持层级切换
 */

import useColorSchemeStore from '../../../../stores/colorSchemeStore'

function PresetSchemeList({ currentSchemeId, onSelect, orgId, surface }) {
  const { presets, customSchemes, deleteScheme } = useColorSchemeStore()

  const handleDelete = async (e, schemeId) => {
    e.stopPropagation()
    if (!confirm('确定要删除此配色方案吗？')) return
    await deleteScheme(schemeId, orgId, surface)
  }

  const surfaceLabels = {
    admin: '管理层',
    app: '应用层',
    ops: '执行层',
  }

  return (
    <div className="preset-scheme-list">
      <div className="preset-scheme-list__header">
        <h4 className="preset-scheme-list__title">预设配色方案</h4>
        <span className="preset-scheme-list__count">
          {presets.length} 个预设（{surfaceLabels[surface] || surface}）
        </span>
      </div>

      <div className="preset-scheme-list__items">
        {presets.map((scheme) => (
          <div
            key={scheme.id}
            className={`preset-scheme-item ${currentSchemeId === scheme.id ? 'preset-scheme-item--active' : ''}`}
            onClick={() => onSelect(scheme)}
          >
            <div
              className="preset-scheme-item__color-bar"
              style={{ backgroundColor: scheme.config?.accent }}
            />
            <div className="preset-scheme-item__content">
              <div className="preset-scheme-item__name">{scheme.name}</div>
              <div className="preset-scheme-item__description">{scheme.description}</div>
            </div>
            {currentSchemeId === scheme.id && (
              <div className="preset-scheme-item__check">✓</div>
            )}
          </div>
        ))}
      </div>

      {customSchemes.length > 0 && (
        <>
          <div className="preset-scheme-list__header preset-scheme-list__header--custom">
            <h4 className="preset-scheme-list__title">自定义方案</h4>
            <span className="preset-scheme-list__count">{customSchemes.length} 个</span>
          </div>

          <div className="preset-scheme-list__items">
            {customSchemes.map((scheme) => (
              <div
                key={scheme.id}
                className={`preset-scheme-item ${currentSchemeId === scheme.id ? 'preset-scheme-item--active' : ''}`}
                onClick={() => onSelect(scheme)}
              >
                <div
                  className="preset-scheme-item__color-bar"
                  style={{ backgroundColor: scheme.config?.accent }}
                />
                <div className="preset-scheme-item__content">
                  <div className="preset-scheme-item__name">{scheme.name}</div>
                  <div className="preset-scheme-item__description">{scheme.description || '自定义配色'}</div>
                </div>
                <button
                  className="preset-scheme-item__delete"
                  onClick={(e) => handleDelete(e, scheme.id)}
                  title="删除"
                >
                  ×
                </button>
                {currentSchemeId === scheme.id && (
                  <div className="preset-scheme-item__check">✓</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default PresetSchemeList

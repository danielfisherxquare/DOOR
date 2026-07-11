/**
 * ColorPaletteEditor
 * 调色盘编辑器组件
 */

import ColorSwatch from './ColorSwatch'

const COLOR_GROUPS = [
  {
    key: 'accent',
    label: '强调色系',
    description: '品牌主色调，用于按钮、链接、高亮等关键元素',
    keys: ['accent', 'accentHover', 'accentActive', 'accentSoft', 'accentLight'],
  },
  {
    key: 'background',
    label: '背景色系',
    description: '页面和组件的背景颜色',
    keys: ['bgPrimary', 'bgSecondary', 'bgTertiary'],
  },
  {
    key: 'surface',
    label: '表面色系',
    description: '卡片、面板等表面元素的颜色',
    keys: ['surface', 'surfaceHover'],
  },
  {
    key: 'panel',
    label: '面板色系',
    description: '深色面板、侧边栏等区域的颜色',
    keys: ['panel', 'panelStrong'],
  },
  {
    key: 'text',
    label: '文字色系',
    description: '各级文字的颜色',
    keys: ['textPrimary', 'textSecondary', 'textMuted', 'textOnAccent'],
  },
  {
    key: 'border',
    label: '边框色系',
    description: '边框和分隔线的颜色',
    keys: ['border', 'borderStrong'],
  },
]

function ColorPaletteEditor({ config, onChange, disabled = false }) {
  const handleColorChange = (key, value) => {
    onChange({ [key]: value })
  }

  return (
    <div className="color-palette-editor">
      {COLOR_GROUPS.map((group) => (
        <div key={group.key} className="color-group">
          <div className="color-group__header">
            <h4 className="color-group__label">{group.label}</h4>
            <p className="color-group__description">{group.description}</p>
          </div>
          <div className="color-group__swatches">
            {group.keys.map((key) => (
              <ColorSwatch
                key={key}
                label={key}
                value={config?.[key] || ''}
                onChange={(value) => handleColorChange(key, value)}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default ColorPaletteEditor

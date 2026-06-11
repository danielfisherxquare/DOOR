/**
 * Color Utilities
 * 颜色处理工具函数 - 支持按层级应用配色
 */

/**
 * HEX 转 RGB
 * @param {string} hex - HEX 颜色值
 * @returns {{r: number, g: number, b: number} | null}
 */
export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null
}

/**
 * RGB 转 HEX
 * @param {number} r - 红色值 (0-255)
 * @param {number} g - 绿色值 (0-255)
 * @param {number} b - 蓝色值 (0-255)
 * @returns {string}
 */
export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(x).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }).join('')
}

/**
 * HEX 转 HSL
 * @param {string} hex - HEX 颜色值
 * @returns {{h: number, s: number, l: number} | null}
 */
export function hexToHsl(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return null

  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}

/**
 * HSL 转 HEX
 * @param {number} h - 色相 (0-360)
 * @param {number} s - 饱和度 (0-100)
 * @param {number} l - 亮度 (0-100)
 * @returns {string}
 */
export function hslToHex(h, s, l) {
  s /= 100
  l /= 100

  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2

  let r = 0, g = 0, b = 0

  if (0 <= h && h < 60) {
    r = c; g = x; b = 0
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c
  } else if (300 <= h && h < 360) {
    r = c; g = 0; b = x
  }

  return rgbToHex(
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  )
}

/**
 * 调整颜色亮度
 * @param {string} hex - HEX 颜色值
 * @param {number} percent - 亮度调整百分比 (-100 到 100)
 * @returns {string}
 */
export function adjustBrightness(hex, percent) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex

  const factor = percent / 100
  const adjust = (value) => {
    const adjusted = value + (255 - value) * factor
    return Math.min(255, Math.max(0, Math.round(adjusted)))
  }

  return rgbToHex(
    percent >= 0 ? adjust(rgb.r) : Math.round(rgb.r * (1 + factor)),
    percent >= 0 ? adjust(rgb.g) : Math.round(rgb.g * (1 + factor)),
    percent >= 0 ? adjust(rgb.b) : Math.round(rgb.b * (1 + factor))
  )
}

/**
 * 生成 accentSoft 颜色
 * @param {string} hex - 强调色 HEX 值
 * @param {number} opacity - 透明度 (0-1)
 * @returns {string}
 */
export function generateSoftColor(hex, opacity = 0.08) {
  const rgb = hexToRgb(hex)
  if (!rgb) return `rgba(0, 0, 0, ${opacity})`
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`
}

/**
 * 计算对比色（用于文字颜色）
 * @param {string} hex - 背景色 HEX 值
 * @returns {string} - 返回黑色或白色
 */
export function getContrastColor(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#ffffff'

  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
  return luminance > 0.5 ? '#1b1c1c' : '#ffffff'
}

/**
 * 验证颜色值是否有效
 * @param {string} color - 颜色值
 * @returns {boolean}
 */
export function isValidColor(color) {
  if (!color || typeof color !== 'string') return false

  if (/^#[0-9A-Fa-f]{6}$/.test(color)) return true
  if (/^#[0-9A-Fa-f]{3}$/.test(color)) return true
  if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/.test(color)) return true

  return false
}

/**
 * 生成完整的配色方案（基于单个强调色）
 * @param {string} accentColor - 强调色 HEX 值
 * @returns {Object}
 */
export function generateColorScheme(accentColor) {
  const rgb = hexToRgb(accentColor)
  if (!rgb) return null

  const hsl = hexToHsl(accentColor)
  if (!hsl) return null

  return {
    accent: accentColor,
    accentHover: adjustBrightness(accentColor, -15),
    accentActive: adjustBrightness(accentColor, -30),
    accentSoft: generateSoftColor(accentColor, 0.08),
    accentLight: hslToHex(hsl.h, hsl.s, 85),
    bgPrimary: '#fcf9f8',
    bgSecondary: '#f0eded',
    surface: '#ffffff',
    panel: '#1c1917',
    textPrimary: '#1b1c1c',
    textSecondary: '#454747',
    textMuted: '#78716c',
    textOnAccent: getContrastColor(accentColor),
    border: '#e7e5e4',
  }
}

/**
 * 将配色配置转换为 CSS 变量对象
 * @param {Object} config - 配色配置
 * @returns {Object}
 */
export function configToCssVariables(config) {
  const mapping = {
    accent: '--layer-accent',
    accentHover: '--layer-accent-hover',
    accentActive: '--layer-accent-active',
    accentSoft: '--layer-accent-soft',
    accentLight: '--layer-accent-light',
    bgPrimary: '--layer-bg-primary',
    bgSecondary: '--layer-bg-secondary',
    bgTertiary: '--layer-bg-tertiary',
    surface: '--layer-surface',
    surfaceHover: '--layer-surface-hover',
    panel: '--layer-panel',
    panelStrong: '--layer-panel-strong',
    textPrimary: '--layer-text-primary',
    textSecondary: '--layer-text-secondary',
    textMuted: '--layer-text-muted',
    textOnAccent: '--layer-text-on-accent',
    border: '--layer-border',
    borderStrong: '--layer-border-strong',
  }

  const cssVars = {}
  for (const [key, cssVar] of Object.entries(mapping)) {
    if (config[key]) {
      cssVars[cssVar] = config[key]
    }
  }
  return cssVars
}

/**
 * 应用配色到 DOM（按层级）
 * @param {Object} config - 配色配置
 * @param {string} surface - 层级（admin/app/ops）
 * @param {HTMLElement} element - 目标元素（默认为 document.documentElement）
 */
export function applyColorScheme(config, surface = 'admin', element = document.documentElement) {
  const cssVars = configToCssVariables(config)

  // 移除旧的层级样式类
  element.classList.remove('color-scheme--admin', 'color-scheme--app', 'color-scheme--ops')

  // 添加新的层级样式类
  element.classList.add(`color-scheme--${surface}`)

  // 应用 CSS 变量到 :root，使用 style 标签注入，确保优先级高于 CSS 类定义
  let styleEl = document.getElementById('dynamic-color-scheme')
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'dynamic-color-scheme'
    document.head.appendChild(styleEl)
  }

  const cssText = `
    :root,
    .layout--admin,
    .layout--app,
    .layout--ops {
      ${Object.entries(cssVars).map(([key, value]) => `${key}: ${value} !important;`).join('\n      ')}
    }
  `
  styleEl.textContent = cssText
}

/**
 * 移除配色样式
 * @param {HTMLElement} element - 目标元素
 */
export function removeColorScheme(element = document.documentElement) {
  // 移除动态样式标签
  const styleEl = document.getElementById('dynamic-color-scheme')
  if (styleEl) {
    styleEl.remove()
  }

  // 移除层级样式类
  element.classList.remove('color-scheme--admin', 'color-scheme--app', 'color-scheme--ops')
}

/**
 * 应用配色到指定层级容器
 * 用于在预览时只改变某个层级的配色，而不影响其他层级
 * @param {Object} config - 配色配置
 * @param {string} surface - 层级（admin/app/ops）
 * @param {HTMLElement} container - 目标容器元素
 */
export function applyColorSchemeToSurface(config, surface, container) {
  if (!container) return
  
  const cssVars = configToCssVariables(config)
  
  // 为该层级容器设置 CSS 变量
  for (const [property, value] of Object.entries(cssVars)) {
    container.style.setProperty(property, value)
  }
}

/**
 * 导出配色方案为 JSON 文件
 * @param {Object} scheme - 配色方案对象
 */
export function exportSchemeAsJson(scheme) {
  const data = JSON.stringify(scheme, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `color-scheme-${scheme.name || 'export'}-${Date.now()}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 导出配色方案为 CSS 文件
 * @param {Object} scheme - 配色方案对象
 */
export function exportSchemeAsCss(scheme) {
  const cssVars = configToCssVariables(scheme.config)
  const cssContent = `/**
 * Color Scheme: ${scheme.name}
 * Surface: ${scheme.surface || 'admin'}
 * Generated by ArcSpro Color Scheme Manager
 */

.color-scheme--${scheme.surface || 'admin'} {
${Object.entries(cssVars).map(([key, value]) => `  ${key}: ${value};`).join('\n')}
}
`
  const blob = new Blob([cssContent], { type: 'text/css' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `color-scheme-${scheme.name || 'export'}-${Date.now()}.css`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 从 JSON 文件导入配色方案
 * @param {File} file - JSON 文件
 * @returns {Promise<Object>}
 */
export function importSchemeFromJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)
        if (!data.config || !data.name) {
          throw new Error('Invalid color scheme file format')
        }
        resolve(data)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

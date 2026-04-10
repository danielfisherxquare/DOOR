/**
 * ColorSwatch
 * 颜色选择器组件
 */

import { useState, useRef, useEffect } from 'react'
import { hexToRgb, isValidColor } from '../utils/colorUtils'

const VARIABLE_LABELS = {
  accent: '强调色',
  accentHover: '悬停色',
  accentActive: '激活色',
  accentSoft: '柔化色',
  accentLight: '浅色调',
  bgPrimary: '主背景',
  bgSecondary: '次背景',
  bgTertiary: '三级背景',
  surface: '表面色',
  surfaceHover: '表面悬停',
  panel: '面板色',
  panelStrong: '强面板色',
  textPrimary: '主文字',
  textSecondary: '次文字',
  textMuted: '弱化文字',
  textOnAccent: '强调文字',
  border: '边框色',
  borderStrong: '强边框',
}

function ColorSwatch({ label, value, onChange, disabled = false }) {
  const [localValue, setLocalValue] = useState(value || '#000000')
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    setLocalValue(value || '#000000')
  }, [value])

  const handleColorChange = (e) => {
    const newColor = e.target.value
    setLocalValue(newColor)
    if (isValidColor(newColor)) {
      onChange(newColor)
    }
  }

  const handleTextChange = (e) => {
    const newValue = e.target.value
    setLocalValue(newValue)
  }

  const handleTextBlur = () => {
    if (isValidColor(localValue)) {
      onChange(localValue)
    } else {
      setLocalValue(value || '#000000')
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleTextBlur()
    }
    if (e.key === 'Escape') {
      setLocalValue(value || '#000000')
      setIsEditing(false)
    }
  }

  const displayLabel = VARIABLE_LABELS[label] || label
  
  const getContrastColor = (hex) => {
    const rgb = hexToRgb(hex)
    if (!rgb) return '#000'
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
    return luminance > 0.5 ? '#1b1c1c' : '#ffffff'
  }

  const isRgba = value && value.startsWith('rgba')
  const textColor = isRgba ? '#1b1c1c' : getContrastColor(localValue)

  return (
    <div className={`color-swatch ${disabled ? 'color-swatch--disabled' : ''}`}>
      <div className="color-swatch__header">
        <span className="color-swatch__label">{displayLabel}</span>
        <span className="color-swatch__variable">{label}</span>
      </div>
      
      <div className="color-swatch__body">
        <div 
          className="color-swatch__preview"
          style={{ backgroundColor: localValue, color: textColor }}
          onClick={() => !disabled && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="color"
            className="color-swatch__native-input"
            value={isRgba ? '#000000' : localValue}
            onChange={handleColorChange}
            disabled={disabled}
          />
        </div>
        
        {isEditing ? (
          <input
            type="text"
            className="color-swatch__text-input"
            value={localValue}
            onChange={handleTextChange}
            onBlur={handleTextBlur}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            autoFocus
          />
        ) : (
          <div 
            className="color-swatch__value"
            onClick={() => !disabled && setIsEditing(true)}
          >
            {localValue}
          </div>
        )}
      </div>
    </div>
  )
}

export default ColorSwatch
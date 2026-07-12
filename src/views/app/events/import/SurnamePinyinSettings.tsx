import { useEffect, useMemo, useState } from 'react'
import {
    clearSurnamePinyinOverrides,
    formatSurnameOverrideLines,
    getSurnameOverrideExamples,
    loadSurnamePinyinOverrides,
    parseSurnameOverrideLines,
    saveSurnamePinyinOverrides,
} from '../../../../utils/namePinyin'

export default function SurnamePinyinSettings() {
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [status, setStatus] = useState('')

    useEffect(() => {
    setText(formatSurnameOverrideLines(loadSurnamePinyinOverrides()))
  }, [])

    const currentCount = useMemo(() => {
    const { overrides, errors: nextErrors } = parseSurnameOverrideLines(text)
    return nextErrors.length === 0 ? Object.keys(overrides).length : null
  }, [text])

    const handleSave = () => {
    const { overrides, errors: nextErrors } = parseSurnameOverrideLines(text)
        if (nextErrors.length > 0) {
      setErrors(nextErrors)
      setStatus('')
      return
        }

    saveSurnamePinyinOverrides(overrides)
    setText(formatSurnameOverrideLines(overrides))
    setErrors([])
    setStatus(`已保存 ${Object.keys(overrides).length} 条补充映射`)
  }

    const handleReset = () => {
    clearSurnamePinyinOverrides()
    setText('')
    setErrors([])
    setStatus('已清空本地补充映射')
  }

    const handleLoadExamples = () => {
    setText(formatSurnameOverrideLines(getSurnameOverrideExamples()))
    setErrors([])
    setStatus('已载入示例，点击保存后生效')
  }

    return (
        <div style={{ padding: '8px 0' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
                名单排序和姓名转拼音会共享这里的本地补充规则。内置常见多音姓始终生效，这里只维护补充或覆盖项。
            </p>

      <div
        style={{
                background: 'var(--bg-secondary, #f8fafc)',
          border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 10,
                padding: 12,
                marginBottom: 12,
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
        }}
      >
                <div>格式：每行一条，使用 `姓=pin yin`</div>
                <div>示例：`区=ou`、`单=shan`、`尉迟=yu chi`</div>
                <div>支持空行和 `#` 注释；姓氏长度 1-4 个汉字，拼音仅允许字母和空格。</div>
            </div>

            <textarea
                value={text}
                onChange={(event) => {
          setText(event.target.value)
          if (errors.length) setErrors([])
          if (status) setStatus('')
                }}
                placeholder={'区=ou\n单=shan\n尉迟=yu chi'}
                spellCheck={false}
                style={{
                    width: '100%',
                    minHeight: 220,
                    resize: 'vertical',
                    borderRadius: 0,
                    border: '1px solid var(--border)',
                    padding: 12,
                    fontFamily: 'Consolas, Monaco, monospace',
                    fontSize: 13,
                    lineHeight: 1.6,
                    background: 'var(--surface)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                }}
            />

      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}
      >
        <button className="btn btn--primary" onClick={handleSave}>
          保存补充映射
        </button>
        <button className="btn btn--secondary" onClick={handleLoadExamples}>
          载入示例
        </button>
        <button className="btn btn--secondary" onClick={handleReset}>
          清空本地补充
        </button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {currentCount == null ? '当前内容有待修正' : `当前编辑 ${currentCount} 条映射`}
                </span>
            </div>

            {status ? (
        <div
          style={{
                    marginTop: 12,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'rgba(16, 185, 129, 0.12)',
                    color: '#047857',
                    fontSize: 12,
                    fontWeight: 600,
          }}
        >
                    {status}
                </div>
            ) : null}

            {errors.length > 0 ? (
        <div
          style={{
                    marginTop: 12,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'rgba(239, 68, 68, 0.12)',
                    color: '#B91C1C',
                    fontSize: 12,
                    lineHeight: 1.6,
          }}
        >
                    {errors.slice(0, 5).map((error) => (
                        <div key={error}>{error}</div>
                    ))}
                    {errors.length > 5 ? <div>还有 {errors.length - 5} 条错误未展开</div> : null}
                </div>
            ) : null}
        </div>
  )
}

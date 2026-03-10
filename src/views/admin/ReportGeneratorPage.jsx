import { useState, useCallback, useRef } from 'react'
import { uploadPdfTemplate, generateMarathonData, downloadWordFile } from '../../api/llmApi'

const MODELS = [
  { value: 'qwen-max', label: 'Qwen-Max（推荐，联网最稳定）' },
  { value: 'glm-5', label: 'GLM-5（智谱）' },
  { value: 'kimi-k2.5', label: 'Kimi K2.5（月之暗面）' },
  { value: 'MiniMax-M2.5', label: 'MiniMax M2.5' },
]

const YEARS = Array.from({ length: 20 }, (_, i) => 2024 - i) // 2024 ~ 2005

function ReportGeneratorPage() {
  // PDF 上传
  const [uploading, setUploading] = useState(false)
  const [templateInfo, setTemplateInfo] = useState(null)
  const [templateId, setTemplateId] = useState('')
  const fileInputRef = useRef(null)

  // 生成控制
  const [year, setYear] = useState(2024)
  const [model, setModel] = useState('qwen-max')
  const [stage, setStage] = useState('idle')  // idle | uploading | searching | analyzing | generating | done | error
  const [progressMessages, setProgressMessages] = useState([])
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const progress = { idle: 0, searching: 20, analyzing: 55, generating: 85, done: 100, error: 0 }
  const stageLabels = {
    idle: '就绪', searching: '🔍 联网搜索中...', analyzing: '🧠 分析推算中...',
    generating: '📄 生成 Word 中...', done: '🎉 完成', error: '❌ 出错',
  }
  const isRunning = !['idle', 'done', 'error'].includes(stage)

  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError('')
    setTemplateInfo(null)
    setTemplateId('')
    setResult(null)

    try {
      const res = await uploadPdfTemplate(file)
      if (res.success) {
        setTemplateInfo(res.data)
        setTemplateId(res.data.templateId)
      } else {
        throw new Error(res.error || '上传失败')
      }
    } catch (err) {
      setError(`PDF 上传失败: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!templateId) { setError('请先上传 PDF 报告'); return }

    setStage('searching')
    setError('')
    setResult(null)
    setProgressMessages([])

    try {
      const data = await generateMarathonData(year, model, templateId, (event, payload) => {
        const msg = payload?.message || event
        setProgressMessages(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])

        if (event === 'progress') {
          const text = (payload?.message || '').toLowerCase()
          if (text.includes('搜索')) setStage('searching')
          else if (text.includes('推算') || text.includes('分析') || text.includes('报告内容')) setStage('analyzing')
          else if (text.includes('word') || text.includes('文档')) setStage('generating')
        } else if (event === 'search_complete') setStage('analyzing')
        else if (event === 'analysis_complete') setStage('generating')
        else if (event === 'word_complete') setStage('done')
      })

      if (data?.success && data?.data) {
        setResult(data.data)
        setStage('done')
      } else {
        throw new Error(data?.error || '未知错误')
      }
    } catch (err) {
      setError(err.message)
      setStage('error')
    }
  }, [year, model, templateId])

  const handleDownload = useCallback(async () => {
    if (!result?.word_file?.fileName) return
    try {
      await downloadWordFile(result.word_file.fileName)
    } catch (err) {
      alert(`下载失败: ${err.message}`)
    }
  }, [result])

  const handleExportJSON = () => {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${year}年南宁马拉松-AI生成数据.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div className="admin-card" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="admin-card__body" style={{ padding: 'var(--spacing-xl)' }}>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, margin: '0 0 var(--spacing-xs) 0' }}>
            马拉松赛事经济评估报告 · AI 生成器
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: 'var(--font-size-sm)' }}>
            上传 PDF 报告 → AI 联网搜索 + 推算 → 生成 Word 文档
          </p>
        </div>
      </div>

      {error && (
        <div className="admin-alert admin-alert--error">
          <strong>错误：</strong>{error}
        </div>
      )}

      {/* Step 1: PDF 上传 */}
      <div className="admin-card" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="admin-card__header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="pill pill--blue">1</span> 上传参照报告 (PDF)
        </div>
        <div className="admin-card__body">
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${templateInfo ? 'var(--color-success)' : 'var(--border-color)'}`,
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--spacing-2xl) var(--spacing-lg)',
              textAlign: 'center',
              cursor: 'pointer',
              background: templateInfo ? 'rgba(16, 185, 129, 0.05)' : 'var(--color-bg-secondary)',
              transition: 'all var(--transition-normal)',
              opacity: uploading ? 0.7 : 1,
              pointerEvents: uploading ? 'none' : 'auto'
            }}
            onMouseOver={e => !templateInfo && (e.currentTarget.style.borderColor = 'var(--color-primary)')}
            onMouseOut={e => !templateInfo && (e.currentTarget.style.borderColor = 'var(--border-color)')}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleUpload}
              style={{ display: 'none' }}
            />
            {uploading ? (
              <div style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>正在解析 PDF...</div>
            ) : templateInfo ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacing-md)', textAlign: 'left' }}>
                <div style={{ fontSize: '2rem' }}>✅</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-md)', marginBottom: '4px' }}>
                    {templateInfo.fileName}
                  </div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                    {templateInfo.totalPages} 页 · {templateInfo.totalChars.toLocaleString()} 字符 · {templateInfo.sectionCount} 个章节
                  </div>
                  <div style={{ color: 'var(--color-purple)', fontSize: 'var(--font-size-xs)', textDecoration: 'underline', marginTop: '4px' }}>
                    点击重新上传
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '2.5rem', marginBottom: 'var(--spacing-sm)' }}>📄</div>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-md)' }}>点击上传 PDF 报告文件</div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', marginTop: '4px' }}>系统将纯本地提取文档结构作为生成参照</div>
              </div>
            )}
          </div>

          {/* 章节预览 */}
          {templateInfo?.sections?.length > 0 && (
            <details style={{ marginTop: 'var(--spacing-lg)' }}>
              <summary style={{ cursor: 'pointer', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                👉 查看提取的章节结构 ({templateInfo.sectionCount})
              </summary>
              <div style={{ marginTop: 'var(--spacing-md)', display: 'grid', gap: 'var(--spacing-xs)' }}>
                {templateInfo.sections.map(s => (
                  <div key={s.index} style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)',
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--font-size-sm)'
                  }}>
                    <span style={{ color: 'var(--color-purple)', fontWeight: 600, minWidth: '24px' }}>{s.index + 1}</span>
                    <span style={{ flex: 1, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                    <span className="pill pill--yellow">{s.contentLength.toLocaleString()} 字</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>

      {/* Step 2: 参数配置 + 生成 */}
      <div className="admin-card" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="admin-card__header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="pill pill--blue">2</span> 选择年份与模型
        </div>
        <div className="admin-card__body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-lg)', alignItems: 'flex-end' }}>
            <div className="input-group">
              <label className="admin-label">目标年份</label>
              <select className="input" value={year} onChange={e => setYear(Number(e.target.value))} disabled={isRunning}>
                {YEARS.map(y => <option key={y} value={y}>{y} 年</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="admin-label">AI 模型</label>
              <select className="input" value={model} onChange={e => setModel(e.target.value)} disabled={isRunning}>
                {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <button
              className="btn btn--primary"
              onClick={handleGenerate}
              disabled={isRunning || !templateId}
              style={{
                background: (isRunning || !templateId) ? 'var(--btn-secondary-bg)' : 'var(--color-primary)',
                color: (isRunning || !templateId) ? 'var(--color-text-muted)' : 'var(--color-text-on-dark)'
              }}
            >
              {isRunning ? '生成中...' : '🚀 开始深度研究 & 生成'}
            </button>
          </div>
        </div>
      </div>

      {/* 进度提示区 */}
      {stage !== 'idle' && (
        <div className="admin-card" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div className="admin-card__body">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--spacing-sm)' }}>
              <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{stageLabels[stage]}</span>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{progress[stage]}%</span>
            </div>
            <div style={{ height: '6px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                background: stage === 'error' ? 'var(--color-danger)' : 'var(--color-primary)',
                width: `${progress[stage]}%`,
                transition: 'width 0.6s ease'
              }} />
            </div>
            <details style={{ marginTop: 'var(--spacing-md)' }} open={stage === 'error'}>
              <summary style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontWeight: 600 }}>
                📜 查看处理日志 ({progressMessages.length})
              </summary>
              <div style={{
                maxHeight: '200px', overflowY: 'auto', marginTop: 'var(--spacing-sm)',
                padding: 'var(--spacing-md)', background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-md)', fontSize: '12px', fontFamily: 'Consolas, monospace',
                color: 'var(--color-text-secondary)'
              }}>
                {progressMessages.map((msg, i) => (
                  <div key={i} style={{ padding: '2px 0', borderBottom: '1px solid var(--border-color)' }}>{msg}</div>
                ))}
              </div>
            </details>
          </div>
        </div>
      )}

      {/* Step 3: 结果 */}
      {result && (
        <div className="admin-card" style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div className="admin-card__header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="pill pill--blue">3</span> 生成结果
          </div>
          <div className="admin-card__body">
            <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)', flexWrap: 'wrap' }}>
              {result.word_file?.fileName && (
                <button className="btn btn--primary" onClick={handleDownload}>
                  📥 下载 Word 报告
                </button>
              )}
              <button className="btn btn--secondary" onClick={handleExportJSON}>
                导出原始 JSON
              </button>
            </div>

            {/* 搜索结果 */}
            {result.search_results && (
              <details style={{ marginBottom: 'var(--spacing-md)' }}>
                <summary style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' }}>
                  🌍 联网搜索结果数据
                </summary>
                <div style={{
                  marginTop: 'var(--spacing-sm)', padding: 'var(--spacing-md)', background: 'var(--color-bg-secondary)',
                  borderRadius: 'var(--radius-md)', overflowX: 'auto', maxHeight: '400px', overflowY: 'auto'
                }}>
                  <pre style={{ fontSize: '12px', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {JSON.stringify(result.search_results, null, 2)}
                  </pre>
                </div>
              </details>
            )}

            {/* 生成的章节 */}
            {result.sections?.length > 0 && (
              <details open>
                <summary style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' }}>
                  📑 报告内容预览 ({result.sections.length} 章节)
                </summary>
                <div style={{ marginTop: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
                  {result.sections.map((s, i) => (
                    <div key={i} style={{ padding: 'var(--spacing-lg)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
                      <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, margin: '0 0 var(--spacing-sm) 0', color: 'var(--color-primary)' }}>
                        {s.title}
                      </h3>
                      <div style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.7, color: 'var(--color-text-secondary)', whiteSpace: 'pre-line' }}>
                        {s.content}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ReportGeneratorPage

import { useEffect, useMemo, useRef, useState } from 'react'
import useImportStore from '../../../../stores/importStore'
import importSessionApi from '../../../../api/import-session'
import { DEFAULT_CLEANING_RULES, type CleaningRules } from '../../../../utils/dataCleaners'
import { loadSurnamePinyinOverrides, type SurnamePinyinOverrides } from '../../../../utils/namePinyin'
import type { ImportSessionSummary, MergedRow, StandardField, UploadedFile } from '../../../../utils/importTypes'

const RULE_INFO = {
  pinyin: { icon: 'PY', label: '拼音生成', desc: '自动为姓名生成拼音' },
  country: { icon: 'NAT', label: '国籍标准化', desc: '规范国家/地区名称格式' },
  idCard: { icon: 'IDC', label: '证件号解析', desc: '从证件号提取生日与性别' },
  clothingSize: { icon: 'SIZE', label: '尺码标准化', desc: '统一服装尺码格式' },
  address: { icon: 'ADR', label: '地址拆分', desc: '拆分省/市/区层级' },
  idCardAddress: { icon: 'REG', label: '证件地址回填', desc: '根据证件地区码补全地址' },
} as const

type WorkerInput = {
  uploadedFiles: Array<
    Pick<UploadedFile, 'fullData' | 'mappings' | 'name' | 'extractedSource' | 'extractedEvent' | 'eventPriority'>
  >
  standardFields: StandardField[]
  rules: CleaningRules
  surnameOverrides: SurnamePinyinOverrides
}

type WorkerSummaryOutput = {
  type: 'summary'
  rawCount: number
  rawPreview: MergedRow[]
  stats: Record<string, number>
  totalRows: number
}

type WorkerChunkOutput = {
  type: 'chunk'
  rows: MergedRow[]
}

type WorkerDoneOutput = {
  type: 'done'
  totalRows: number
}

type WorkerOutput = WorkerSummaryOutput | WorkerChunkOutput | WorkerDoneOutput

type CleanerResult = {
  rawCount: number
  rawPreview: MergedRow[]
  cleanedPreview: MergedRow[]
  stats: Record<string, number>
  totalRows: number
}

export default function DataCleaner({ raceId }: { raceId: string | null }) {
  const parsedRaceId = Number(raceId)
  const {
    uploadedFiles,
    standardFields,
    importSessionId,
    setStep,
    setImportSession,
  } = useImportStore()

  const [rules, setRules] = useState<CleaningRules>(DEFAULT_CLEANING_RULES)
  const [result, setResult] = useState<CleanerResult | null>(null)
  const [processing, setProcessing] = useState(false)
  const runIdRef = useRef(0)
  const currentImportSessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    currentImportSessionIdRef.current = importSessionId
  }, [importSessionId])

  useEffect(() => {
    if (uploadedFiles.length === 0) {
      const existingSessionId = currentImportSessionIdRef.current
      if (existingSessionId) {
        void importSessionApi.clear(existingSessionId).catch(() => false)
        setImportSession(null, 0)
      }
      queueMicrotask(() => {
        setResult(null)
        setProcessing(false)
      })
      return
    }

    const runId = ++runIdRef.current
    let worker: Worker | null = null
    let disposed = false
    let committed = false
    let sessionId: string | null = null
    let latestSummary: WorkerSummaryOutput | null = null
    let cleanedPreviewRows: MergedRow[] = []
    let appendQueue: Promise<void> = Promise.resolve()
    let totalRows = 0

    queueMicrotask(() => {
      setProcessing(true)
      setResult(null)
      setImportSession(null, 0)
    })

    ;(async () => {
      try {
        const existingSessionId = currentImportSessionIdRef.current
        if (existingSessionId) {
          await importSessionApi.clear(existingSessionId).catch(() => false)
        }

        if (!Number.isFinite(parsedRaceId) || parsedRaceId <= 0) {
          throw new Error('请先选择赛事后再执行导入')
        }

        const created = await importSessionApi.create(parsedRaceId)
        if (disposed || runId !== runIdRef.current) {
          await importSessionApi.clear(created.id).catch(() => false)
          return
        }
        sessionId = created.id

        worker = new Worker(new URL('./dataCleaner.worker.ts', import.meta.url), { type: 'module' })

        worker.onmessage = (ev: MessageEvent<WorkerOutput>) => {
          if (disposed || runId !== runIdRef.current || !sessionId) return
          const payload = ev.data

          if (payload.type === 'chunk') {
            totalRows += payload.rows.length
            if (cleanedPreviewRows.length < 50) {
              cleanedPreviewRows = cleanedPreviewRows.concat(payload.rows.slice(0, 50 - cleanedPreviewRows.length))
              const previewSnapshot = cleanedPreviewRows.slice()
              setResult((prev) => ({
                rawCount: prev?.rawCount ?? 0,
                rawPreview: prev?.rawPreview ?? [],
                cleanedPreview: previewSnapshot,
                stats: prev?.stats ?? {},
                totalRows,
              }))
            }

            appendQueue = appendQueue.then(async () => {
              if (!sessionId) return
              const appendResult = await importSessionApi.appendChunk(sessionId, payload.rows)
              if (appendResult?.totalRows) {
                setImportSession(sessionId, appendResult.totalRows)
              }
            })
            return
          }

          if (payload.type === 'summary') {
            latestSummary = payload
            return
          }

          if (payload.type === 'done') {
            void (async () => {
              try {
                await appendQueue
                if (disposed || runId !== runIdRef.current || !sessionId) return

                const summary: ImportSessionSummary & { totalRows: number } = latestSummary ?? {
                  rawCount: payload.totalRows,
                  rawPreview: [],
                  stats: {},
                  totalRows: payload.totalRows,
                }

                await importSessionApi.setSummary(sessionId, {
                  rawCount: summary.rawCount,
                  rawPreview: summary.rawPreview,
                  stats: summary.stats,
                })

                if (disposed || runId !== runIdRef.current || !sessionId) return

                setImportSession(sessionId, summary.totalRows)
                setResult({
                  rawCount: summary.rawCount,
                  rawPreview: summary.rawPreview,
                  cleanedPreview: cleanedPreviewRows.slice(),
                  stats: summary.stats,
                  totalRows: summary.totalRows,
                })
                committed = true
                setProcessing(false)
                worker?.terminate()
              } catch (error) {
                console.error(error)
                setProcessing(false)
                worker?.terminate()
                alert('数据清洗过程中出错')
              }
            })()
          }
        }

        worker.onerror = (error) => {
          if (disposed || runId !== runIdRef.current) return
          console.error(error)
          setProcessing(false)
          worker?.terminate()
          alert('数据清洗失败：Worker 运行时错误')
        }

        const input: WorkerInput = {
          uploadedFiles: uploadedFiles.map((file) => ({
            fullData: file.fullData,
            mappings: file.mappings,
            name: file.name,
            extractedSource: file.extractedSource,
            extractedEvent: file.extractedEvent,
            eventPriority: file.eventPriority,
          })),
          standardFields,
          rules,
          surnameOverrides: loadSurnamePinyinOverrides(),
        }
        worker.postMessage(input)
      } catch (error) {
        if (disposed || runId !== runIdRef.current) return
        console.error(error)
        setProcessing(false)
        alert(error instanceof Error ? error.message : '初始化导入会话失败')
      }
    })()

    return () => {
      disposed = true
      worker?.terminate()
      if (sessionId && !committed) {
        void importSessionApi.clear(sessionId).catch(() => false)
      }
    }
  }, [parsedRaceId, rules, setImportSession, standardFields, uploadedFiles])

  const cleanedData = useMemo(() => result?.cleanedPreview ?? [], [result?.cleanedPreview])
  const stats = useMemo(() => result?.stats ?? {}, [result?.stats])
  const rawCount = result?.rawCount ?? 0
  const totalAffected = useMemo(() => Object.values(stats).reduce((total, value) => total + value, 0), [stats])

  const modifiedCells = useMemo(() => {
    const changes = new Set<string>()
    const rawPreview = result?.rawPreview ?? []
    cleanedData.slice(0, 50).forEach((row, rowIndex) => {
      const original = rawPreview[rowIndex]
      if (!original) return
      standardFields.forEach((field) => {
        if (row[field.id] !== original[field.id]) {
          changes.add(`${rowIndex}-${field.id}`)
        }
      })
    })
    return changes
  }, [cleanedData, result?.rawPreview, standardFields])

  return (
    <div className="import-cleaner">
      <div className="import-cleaner__header">
        <h3 style={{ margin: 0 }}>数据清洗</h3>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn--secondary" onClick={() => setStep('mapping')}>← 返回</button>
          <button
            className="btn btn--primary"
            disabled={processing || !result || !importSessionId}
            onClick={() => setStep('preview')}
          >
            {processing ? '处理中...' : '预览保存 →'}
          </button>
        </div>
      </div>

      <div className="import-cleaner__layout">
        <div className="import-cleaner__rules">
          {(Object.keys(RULE_INFO) as (keyof CleaningRules)[]).map((key) => {
            const active = rules[key]
            return (
              <button
                key={key}
                type="button"
                className={`import-cleaner__rule ${active ? 'active' : ''}`}
                onClick={() => setRules((prev) => ({ ...prev, [key]: !prev[key] }))}
              >
                <div className="import-cleaner__rule-icon">{RULE_INFO[key].icon}</div>
                <div className="import-cleaner__rule-title">{RULE_INFO[key].label}</div>
                <div className="import-cleaner__rule-desc">{RULE_INFO[key].desc}</div>
                <div className="import-cleaner__rule-footer">
                  <span>{active ? '已启用' : '已停用'}</span>
                  {(stats[key] ?? 0) > 0 ? <strong>{stats[key]}</strong> : null}
                </div>
              </button>
            )
          })}
        </div>

        <aside className="import-cleaner__summary">
          <div>
            <span className="import-cleaner__summary-label">总行数</span>
            <strong className="import-cleaner__summary-value">{processing ? '...' : rawCount}</strong>
          </div>
          <div className="import-cleaner__summary-divider" />
          <div>
            <span className="import-cleaner__summary-label">已更新</span>
            <strong className="import-cleaner__summary-value accent">{processing ? '...' : totalAffected}</strong>
            <p>根据选中规则对字段进行标准化处理。</p>
          </div>
        </aside>
      </div>

      <div className="import-cleaner__table-card">
        <div className="import-cleaner__table-header">
          <h4 style={{ margin: 0, fontSize: 14 }}>实时预览（前 50 行）</h4>
          <div className="import-cleaner__legend">
            <span className="import-cleaner__legend-dot" />
            <span>修改过的单元格</span>
          </div>
        </div>

        {processing ? (
          <div className="import-cleaner__status">后台清洗中，正在分块写入...</div>
        ) : null}
        {!processing && cleanedData.length === 0 ? (
          <div className="import-cleaner__status">暂无数据</div>
        ) : null}

        <div className="import-preview-table-wrapper" style={{ maxHeight: 800 }}>
          <table className="import-preview-table">
            <thead>
              <tr>
                <th>#</th>
                {standardFields.map((field) => (
                  <th key={field.id}>{field.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cleanedData.slice(0, 50).map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <td>{rowIndex + 1}</td>
                  {standardFields.map((field) => (
                    <td
                      key={field.id}
                      style={{
                        background: modifiedCells.has(`${rowIndex}-${field.id}`) ? 'rgba(255, 255, 0, 0.28)' : undefined,
                      }}
                    >
                      {row[field.id] || <span style={{ opacity: 0.25 }}>-</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="import-cleaner__footer">待导入行数: {result?.totalRows ?? 0}</div>
      </div>
    </div>
  )
}

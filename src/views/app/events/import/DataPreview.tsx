import { useEffect, useMemo, useState } from 'react'
import useImportStore from '../../../../stores/importStore'
import importSessionApi from '../../../../api/import-session'
import { exportToExcel } from '../../../../utils/excelProcessor'
import type { JobStatusResponse, MergedRow } from '../../../../utils/importTypes'
import { CommandNotice } from '../../../../components/command/CommandPrimitives'

const RUNNER_CATEGORIES = [
  { value: 'Mass', label: '大众选手 (Mass)' },
  { value: 'Elite', label: '特邀选手 (Elite)' },
  { value: 'Permanent', label: '永久号码 (Permanent)' },
  { value: 'Sponsor', label: '赞助商 (Sponsor)' },
  { value: 'Pacer', label: '官方配速员 (Pacer)' },
  { value: 'Medic', label: '急救跑者 (Medic)' },
  { value: 'Performance', label: '成绩数据 (Performance)' },
  { value: 'Other', label: '其他 (Other)' },
]

const PREVIEW_LIMIT = 100
const EXPORT_CHUNK_SIZE = 5000

export default function DataPreview({ raceId }: { raceId: string | null }) {
  const parsedRaceId = Number(raceId)
  const {
    standardFields,
    importSessionId,
    importSessionRowCount,
    setImportSession,
    setStep,
    clearFiles,
  } = useImportStore()

  const [previewRows, setPreviewRows] = useState<MergedRow[]>([])
  const [totalRows, setTotalRows] = useState(importSessionRowCount || 0)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [category, setCategory] = useState('Mass')
  const [jobProgress, setJobProgress] = useState(0)
  const [jobMessage, setJobMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [noticeTone, setNoticeTone] = useState<'info' | 'success' | 'danger' | 'warning'>('info')

  useEffect(() => {
    let cancelled = false

    if (!importSessionId) {
      setPreviewRows([])
      setTotalRows(0)
      return () => {
        cancelled = true
      }
    }

    setLoadingPreview(true)
    Promise.all([
      importSessionApi.get(importSessionId),
      importSessionApi.getChunk(importSessionId, 0, PREVIEW_LIMIT),
    ])
      .then(([info, rows]) => {
        if (cancelled) return
        setPreviewRows(rows as MergedRow[])
        setTotalRows(info.totalRows || info.rawCount || rows.length)
        setImportSession(info.id, info.totalRows || info.rawCount || rows.length)
      })
      .catch((error) => {
        if (cancelled) return
        console.error(error)
        setNotice('读取导入会话失败，请返回上一步重新清洗。')
        setNoticeTone('danger')
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false)
      })

    return () => {
      cancelled = true
    }
  }, [importSessionId, setImportSession])

  const hasSession = useMemo(() => Boolean(importSessionId), [importSessionId])

  const handleSave = async () => {
    if (!importSessionId) {
      setNotice('未找到导入会话，请返回上一步重新处理。')
      setNoticeTone('danger')
      return
    }
    if (!Number.isFinite(parsedRaceId) || parsedRaceId <= 0) {
      setNotice('请先选择赛事。')
      setNoticeTone('warning')
      return
    }
    if (category === 'Other') {
      setNotice('当前系统仅支持提交标准选手类别，请选择其他合法分类。')
      setNoticeTone('warning')
      return
    }

    setSaving(true)
    setJobProgress(0)
    setJobMessage('正在提交...')
    setNotice('')
    try {
      const { jobId } = await importSessionApi.commit(importSessionId, parsedRaceId, category)

      let finished = false
      while (!finished) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        const job = await importSessionApi.getJobStatus(jobId) as JobStatusResponse
        setJobProgress(job.progress || 0)
        setJobMessage(job.message || '')

        if (job.status === 'succeeded') {
          finished = true
          const result = job.result || {}
          await importSessionApi.clear(importSessionId).catch(() => false)
          setNotice(`导入完成：新增 ${result.addedCount || 0} 条，更新 ${result.updatedCount || 0} 条，合并 ${result.internalCount || 0} 条，拒绝 ${result.rejectedCount || 0} 条。`)
          setNoticeTone('success')
          clearFiles()
          setStep('upload')
        } else if (job.status === 'failed') {
          finished = true
          throw new Error(job.error?.message || '导入失败')
        }
      }
    } catch (error) {
      console.error(error)
      setNotice(`导入失败：${error instanceof Error ? error.message : '未知错误'}`)
      setNoticeTone('danger')
    } finally {
      setSaving(false)
      setJobProgress(0)
      setJobMessage('')
    }
  }

  const handleExport = async () => {
    if (!importSessionId) {
      setNotice('未找到导入会话，请返回上一步重新处理。')
      setNoticeTone('danger')
      return
    }

    setExporting(true)
    setNotice('')
    try {
      const allRows: MergedRow[] = []
      let offset = 0
      while (true) {
        const chunk = await importSessionApi.getChunk(importSessionId, offset, EXPORT_CHUNK_SIZE)
        if (!chunk.length) break
        allRows.push(...(chunk as MergedRow[]))
        offset += chunk.length
        if (chunk.length < EXPORT_CHUNK_SIZE) break
      }
      exportToExcel(allRows, standardFields)
      setNotice(`已导出 ${allRows.length} 条预览记录。`)
      setNoticeTone('success')
    } catch (error) {
      console.error(error)
      setNotice(`导出失败：${error instanceof Error ? error.message : '未知错误'}`)
      setNoticeTone('danger')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="import-cleaner">
      <div className="import-cleaner__header">
        <h3 style={{ margin: 0 }}>最终预览</h3>
        <div className="import-preview-actions-row">
          <select
            className="import-preview-select"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {RUNNER_CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <button className="btn btn--secondary" onClick={() => setStep('cleaning')}>← 返回</button>
          <button className="btn btn--ghost" onClick={() => void handleExport()} disabled={exporting || !hasSession}>
            {exporting ? '导出中...' : '下载 Excel'}
          </button>
          <button className="btn btn--primary" onClick={() => void handleSave()} disabled={saving || !hasSession || loadingPreview}>
            {saving ? `保存中... ${jobProgress}%` : '保存到数据库'}
          </button>
        </div>
      </div>

      {saving ? (
        <div className="import-progress">
          <div className="import-progress-bar" style={{ width: `${jobProgress}%` }} />
          <span>{jobMessage || '正在提交...'}</span>
        </div>
      ) : null}

      {notice ? <CommandNotice tone={noticeTone}>{notice}</CommandNotice> : null}

      {!hasSession ? (
        <div className="import-cleaner__status">未找到导入会话，请返回上一步重新清洗。</div>
      ) : (
        <div className="import-preview-section">
          <div className="import-preview-stats">
            <span>{loadingPreview ? '正在读取预览...' : `显示前 ${previewRows.length} 条，共 ${totalRows} 条记录`}</span>
            <span>提交类别: {category}</span>
          </div>

          <div className="import-preview-table-wrapper" style={{ maxHeight: 600 }}>
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
                {previewRows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    <td>{rowIndex + 1}</td>
                    {standardFields.map((field) => (
                      <td key={field.id}>{row[field.id] || <span style={{ opacity: 0.25 }}>-</span>}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

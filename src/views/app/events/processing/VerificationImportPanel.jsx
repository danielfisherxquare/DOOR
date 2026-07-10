import { useCallback, useRef, useState } from 'react'
import recordsApi from '../../../../api/records'
import { parseVerificationExcel } from '../../../../utils/excelProcessor'
import {
  AppH5DataCard,
  AppH5DataTable,
  AppH5Notice,
  AppH5Panel,
} from '../../../../components/app/AppH5Surface'

export default function VerificationImportPanel({ raceId, onImported }) {
  const fileInputRef = useRef(null)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('info')
  const [parsedPreview, setParsedPreview] = useState(null)

  const handleSelectFile = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(async (event) => {
    const file = event.target.files?.[0]
    if (!file || !raceId) return

    event.target.value = ''

    try {
      setImporting(true)
      setParsedPreview(null)
      setMessage('')

      const parsed = await parseVerificationExcel(file)
      if (!parsed.results || parsed.results.length === 0) {
        setMessage('未能识别到有效成绩数据，请确认工作表名称和列名是否符合约定。')
        setMessageTone('danger')
        return
      }

      setParsedPreview(parsed)
      setMessage(`已识别 ${parsed.results.length} 条成绩记录，可确认导入。`)
      setMessageTone('success')
    } catch (err) {
      console.error(err)
      setMessage(`解析失败：${err.message}`)
      setMessageTone('danger')
    } finally {
      setImporting(false)
    }
  }, [raceId])

  const handleConfirmImport = useCallback(async () => {
    if (!raceId || !parsedPreview) return

    try {
      setImporting(true)
      const response = await recordsApi.importVerification(raceId, parsedPreview.results)
      const result = response.data
      setMessage(`导入成功，已更新 ${result?.updated || 0} 位选手的成绩证明。`)
      setMessageTone('success')
      setParsedPreview(null)
      onImported?.()
    } catch (err) {
      console.error(err)
      setMessage(`导入失败：${err.message}`)
      setMessageTone('danger')
    } finally {
      setImporting(false)
    }
  }, [onImported, parsedPreview, raceId])

  return (
    <div className="processing-stack">
      {message ? <AppH5Notice tone={messageTone}>{message}</AppH5Notice> : null}

      <AppH5Panel
        title="导入成绩证明"
        subtitle="上传包含全马/半马成绩证明的 Excel，系统会按证件号匹配当前赛事选手。"
        actions={(
          <button className="btn btn--primary" onClick={handleSelectFile} disabled={importing}>
            {importing ? '解析中...' : '选择 Excel'}
          </button>
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          hidden
          onChange={handleFileChange}
        />
        <div className="processing-help">
          <strong>识别规则：</strong>工作表名称需包含“全 / full / qmcj”或“半 / half / bmcj”，且表头至少包含证件号与净成绩。
        </div>
      </AppH5Panel>

      {parsedPreview ? (
        <AppH5Panel
          title="解析预览"
          subtitle={`已识别工作表：${parsedPreview.sheetsMatched.join(' | ')}`}
          actions={(
            <div className="processing-inline-actions">
              <button className="btn btn--secondary" onClick={() => setParsedPreview(null)} disabled={importing}>
                取消
              </button>
              <button className="btn btn--primary" onClick={handleConfirmImport} disabled={importing}>
                {importing ? '写入中...' : `确认导入 ${parsedPreview.results.length} 条`}
              </button>
            </div>
          )}
        >
          <AppH5DataTable
            mobileCards={parsedPreview.results.slice(0, 100).map((item, index) => (
              <AppH5DataCard
                key={`${item.idNumber}-${index}`}
                eyebrow={`#${index + 1}`}
                title={item.idNumber}
                fields={[
                  { key: 'idNumber', label: '证件号', value: item.idNumber },
                  { key: 'netTime', label: '净成绩', value: item.netTime },
                  { key: 'raceName', label: '赛事名称', value: item.raceName },
                  { key: 'event', label: '项目', value: item.event === 'Full' ? '马拉松' : '半程马拉松' },
                ]}
              />
            ))}
          >
            <table>
            <thead>
              <tr>
                <th>#</th>
                <th>证件号</th>
                <th>净成绩</th>
                <th>赛事名称</th>
                <th>项目</th>
              </tr>
            </thead>
            <tbody>
              {parsedPreview.results.slice(0, 100).map((item, index) => (
                <tr key={`${item.idNumber}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{item.idNumber}</td>
                  <td>{item.netTime}</td>
                  <td>{item.raceName}</td>
                  <td>{item.event === 'Full' ? '马拉松' : '半程马拉松'}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </AppH5DataTable>
          {parsedPreview.results.length > 100 ? (
            <div className="processing-footnote">仅展示前 100 条，共 {parsedPreview.results.length} 条。</div>
          ) : null}
        </AppH5Panel>
      ) : null}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import adminApi from '../../api/adminApi'
import useAuthStore from '../../stores/authStore'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

function formatDate(value) {
  if (!value) return '未完成'
  return new Date(value).toLocaleString('zh-CN')
}

function badgeStyle(status) {
  switch (status) {
    case 'success':
    case 'succeeded':
      return { background: '#dcfce7', color: '#166534' }
    case 'running':
      return { background: '#dbeafe', color: '#1d4ed8' }
    case 'failed':
      return { background: '#fee2e2', color: '#991b1b' }
    default:
      return { background: '#f3f4f6', color: '#374151' }
  }
}

function getCardStyle() {
  return {
    background: 'var(--color-bg-primary, #ffffff)',
    borderRadius: 16,
    padding: 24,
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    marginBottom: 24,
  }
}

export default function DatabaseBackupPage() {
  const token = useAuthStore((state) => state.token)
  const fileInputRef = useRef(null)
  const envFileInputRef = useRef(null)
  const [backups, setBackups] = useState([])
  const [restores, setRestores] = useState([])
  const [status, setStatus] = useState({ backupRunning: false, restoreRunning: false })
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [startingRestore, setStartingRestore] = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null)
  const [envFile, setEnvFile] = useState(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [backupRes, restoreRes, backupStatusRes, restoreStatusRes] = await Promise.all([
        adminApi.listDbBackups(),
        adminApi.listDbRestores(),
        adminApi.getDbBackupStatus(),
        adminApi.getDbRestoreStatus(),
      ])
      setBackups(backupRes?.data?.items || [])
      setRestores(restoreRes?.data?.items || [])
      setStatus({
        backupRunning: Boolean(backupStatusRes?.data?.running),
        restoreRunning: Boolean(restoreStatusRes?.data?.running),
      })
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '加载数据库备份信息失败' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (!status.backupRunning && !status.restoreRunning) return undefined
    const timer = setInterval(() => {
      loadData()
    }, 5000)
    return () => clearInterval(timer)
  }, [status.backupRunning, status.restoreRunning])

  const busy = creatingBackup || uploading || startingRestore || status.backupRunning || status.restoreRunning

  const handleCreateBackup = async () => {
    setCreatingBackup(true)
    setMessage(null)
    try {
      await adminApi.createDbBackup()
      setMessage({ type: 'success', text: '数据库备份已生成' })
      await loadData()
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '创建备份失败' })
    } finally {
      setCreatingBackup(false)
    }
  }

  const handleDownload = async (filename) => {
    setMessage(null)
    try {
      const response = await fetch(`${API_BASE}/admin/system/backups/${encodeURIComponent(filename)}/download`, {
        headers: {
          Authorization: `Bearer ${token || ''}`,
        },
      })
      if (!response.ok) {
        let errorMessage = '下载备份失败'
        try {
          const data = await response.json()
          errorMessage = data.message || errorMessage
        } catch {
          // noop
        }
        throw new Error(errorMessage)
      }

      const blob = await response.blob()
      const objectUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(objectUrl)
      setMessage({ type: 'success', text: `已开始下载 ${filename}` })
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '下载备份失败' })
    }
  }

  const handleDownloadEnv = async (envFilename) => {
    setMessage(null)
    try {
      const response = await fetch(`${API_BASE}/admin/system/backups/${encodeURIComponent(envFilename)}/download-env`, {
        headers: {
          Authorization: `Bearer ${token || ''}`,
        },
      })
      if (!response.ok) {
        let errorMessage = '下载 .env 备份失败'
        try {
          const data = await response.json()
          errorMessage = data.message || errorMessage
        } catch {
          // noop
        }
        throw new Error(errorMessage)
      }
      const blob = await response.blob()
      const objectUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = envFilename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(objectUrl)
      setMessage({ type: 'success', text: `已开始下载 ${envFilename}` })
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '下载 .env 备份失败' })
    }
  }

  const handleUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    setMessage(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (envFile) {
        formData.append('envFile', envFile)
      }
      const response = await fetch(`${API_BASE}/admin/system/restores/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token || ''}`,
        },
        body: formData,
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.message || '上传恢复文件失败')
      }
      setUploadedFile(data.data)
      const envMsg = envFile ? '（含 .env）' : ''
      setMessage({ type: 'success', text: `已上传 ${data.data.filename}${envMsg}` })
      setEnvFile(null)
      if (envFileInputRef.current) envFileInputRef.current.value = ''
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '上传恢复文件失败' })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleStartRestore = async () => {
    if (!uploadedFile?.uploadId) return
    setStartingRestore(true)
    setMessage(null)
    try {
      const response = await adminApi.startDbRestore(uploadedFile.uploadId)
      setUploadedFile(null)
      setMessage({ type: 'success', text: `恢复任务已启动，目标库：${response.data.targetDatabase}` })
      await loadData()
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '启动恢复失败' })
    } finally {
      setStartingRestore(false)
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary, #111)', marginBottom: 16 }}>
        数据库备份与恢复
      </h1>
      <p style={{ color: 'var(--color-text-secondary, #666)', marginBottom: 24 }}>
        服务器仅保留最近 10 份备份。恢复默认写入新的测试数据库，不会覆盖当前生产库。
      </p>

      {message && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          marginBottom: 16,
          background: message.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: message.type === 'success' ? '#166534' : '#991b1b',
        }}>
          {message.text}
        </div>
      )}

      <div style={{ ...getCardStyle(), display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>自动备份频率</div>
          <div style={{ fontWeight: 700 }}>每日 1 次</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>保留策略</div>
          <div style={{ fontWeight: 700 }}>最近 10 份</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>当前状态</div>
          <div style={{ fontWeight: 700 }}>{status.restoreRunning ? '恢复中' : status.backupRunning ? '备份中' : '空闲'}</div>
        </div>
      </div>

      <div style={getCardStyle()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>服务器备份</h3>
            <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 13 }}>可手动生成最新备份，并下载到本地安全保存。</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn--ghost" onClick={loadData} disabled={loading || busy}>刷新</button>
            <button className="btn btn--primary" onClick={handleCreateBackup} disabled={busy}>
              {creatingBackup ? '生成中...' : '立即生成备份'}
            </button>
          </div>
        </div>

        {loading ? (
          <p>加载中...</p>
        ) : backups.length === 0 ? (
          <p style={{ color: '#6b7280' }}>当前还没有可下载的备份文件。</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '10px 8px' }}>文件名</th>
                  <th style={{ padding: '10px 8px' }}>时间</th>
                  <th style={{ padding: '10px 8px' }}>大小</th>
                  <th style={{ padding: '10px 8px' }}>来源</th>
                  <th style={{ padding: '10px 8px' }}>状态</th>
                  <th style={{ padding: '10px 8px' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((item) => (
                  <tr key={item.filename} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 8px', fontWeight: 600 }}>{item.filename}</td>
                    <td style={{ padding: '12px 8px' }}>{formatDate(item.createdAt)}</td>
                    <td style={{ padding: '12px 8px' }}>{item.sizeLabel}</td>
                    <td style={{ padding: '12px 8px' }}>{item.trigger === 'cron' ? '自动' : '手动'}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{ ...badgeStyle(item.status), padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                        {item.status === 'success' ? '成功' : item.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn--ghost btn--sm" onClick={() => handleDownload(item.filename)} disabled={busy}>
                          下载 DB
                        </button>
                        {item.envFile && (
                          <button className="btn btn--ghost btn--sm" onClick={() => handleDownloadEnv(item.envFile)} disabled={busy}>
                            下载 .env
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={getCardStyle()}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>上传恢复到测试库</h3>
          <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 13 }}>
            仅支持 `.sql.gz` 文件。恢复后会生成新的 `door_restore_YYYYMMDD_HHMMSS` 测试数据库。
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <button className="btn btn--ghost" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            {uploading ? '上传中...' : '选择恢复文件 (.sql.gz)'}
          </button>
          <button className="btn btn--ghost" onClick={() => envFileInputRef.current?.click()} disabled={busy} style={{ opacity: 0.85 }}>
            {envFile ? `✅ ${envFile.name}` : '附加 .env 文件（可选）'}
          </button>
          {uploadedFile && (
            <div style={{ fontSize: 13, color: '#374151' }}>
              已上传：<strong>{uploadedFile.filename}</strong>（{uploadedFile.sizeLabel}）
            </div>
          )}
          <button className="btn btn--primary" onClick={handleStartRestore} disabled={!uploadedFile || busy}>
            {startingRestore ? '恢复中...' : '恢复到测试库'}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".sql.gz"
          style={{ display: 'none' }}
          onChange={handleUpload}
        />
        <input
          ref={envFileInputRef}
          type="file"
          accept=".env"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) setEnvFile(f)
          }}
        />

        <div style={{ padding: 12, borderRadius: 10, background: '#fff7ed', color: '#9a3412', fontSize: 13 }}>
          恢复成功也不代表业务完全可用，请继续核对 `users`、`orgs`、`races`、`records` 和 `knex_migrations` 等核心表。
        </div>
      </div>

      <div style={getCardStyle()}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>恢复记录</h3>
          <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 13 }}>用于查看最近恢复任务状态、目标数据库名和基础校验结果。</p>
        </div>

        {restores.length === 0 ? (
          <p style={{ color: '#6b7280' }}>当前还没有恢复记录。</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {restores.map((job) => (
              <div key={job.jobId} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{job.filename}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>目标库：{job.targetDatabase}</div>
                  </div>
                  <span style={{ ...badgeStyle(job.status), padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                    {job.status === 'succeeded' ? '成功' : job.status === 'failed' ? '失败' : job.status === 'running' ? '进行中' : job.status}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#374151', display: 'grid', gap: 4 }}>
                  <div>上传时间：{formatDate(job.uploadedAt)}</div>
                  <div>开始时间：{formatDate(job.startedAt)}</div>
                  <div>完成时间：{formatDate(job.finishedAt)}</div>
                  {job.checks && (
                    <div>
                      检查结果：连接 {job.checks.connectivity ? '通过' : '失败'}，migration 表 {job.checks.migrationTablePresent ? '存在' : '缺失'}，核心表 {job.checks.tablesPresent ? '齐全' : '缺失'}
                    </div>
                  )}
                  {job.error && <div style={{ color: '#991b1b' }}>错误：{job.error}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

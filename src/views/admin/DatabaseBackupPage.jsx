import { useEffect, useMemo, useRef, useState } from 'react'
import adminApi from '../../api/adminApi'
import { requestRaw } from '../../utils/request'
import {
  CommandDataTable,
  CommandEmptyState,
  CommandMetricGrid,
  CommandNotice,
  CommandPanel,
  CommandShell,
  CommandStatusTag,
} from '../../components/command/CommandPrimitives'

function formatDate(value) {
  if (!value) return '未完成'
  return new Date(value).toLocaleString('zh-CN')
}

function getStatusTone(status) {
  if (status === 'success' || status === 'succeeded') return 'success'
  if (status === 'running') return 'warning'
  if (status === 'failed') return 'danger'
  return 'neutral'
}

function getStatusLabel(status) {
  if (status === 'success' || status === 'succeeded') return '成功'
  if (status === 'running') return '进行中'
  if (status === 'failed') return '失败'
  return status || '待处理'
}

/* ── 密钥指纹脱敏显示 ─────────────────────────────────── */
function FingerprintDisplay({ value, label }) {
  if (!value || value === 'UNSET') {
    return (
      <div className="kg-fingerprint kg-fingerprint--unset">
        <span className="kg-fingerprint__label">{label}</span>
        <span className="kg-fingerprint__value">未设置</span>
      </div>
    )
  }
  // 显示前4位 + 掩码 + 后4位
  const masked = `${value.slice(0, 4)}${'••••'.repeat(2)}${value.slice(-4)}`
  return (
    <div className="kg-fingerprint">
      <span className="kg-fingerprint__label">{label}</span>
      <code className="kg-fingerprint__value">{masked}</code>
    </div>
  )
}

/* ── 密钥安全面板 ─────────────────────────────────────── */
function KeyGuardPanel({ encStatus, onMessage }) {
  if (!encStatus) return null

  const { healthy, current, stored, envBackups, reason } = encStatus
  const match = healthy
  const keysSet = current?.isSet

  const handleDownloadEnv = async (envFilename) => {
    try {
      const response = await requestRaw.get(
        `/admin/system/backups/${encodeURIComponent(envFilename)}/download-env`,
        { responseType: 'blob' },
      )
      const objectUrl = window.URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = envFilename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(objectUrl)
      onMessage?.({ type: 'success', text: `已下载 ${envFilename}` })
    } catch (error) {
      onMessage?.({ type: 'error', text: error.message })
    }
  }

  return (
    <CommandPanel
      title="🔐 加密密钥安全"
      subtitle="PII 字段使用 AES-256-GCM 加密。密钥丢失将导致手机号、身份证等数据不可逆丢失。"
      tone={match ? 'default' : 'warning'}
    >
      {/* ── 状态指示器 ───────────────────────────── */}
      <div className="kg-status-bar">
        <div className={`kg-status-indicator ${match ? 'kg-status-indicator--ok' : 'kg-status-indicator--danger'}`}>
          <span className="kg-status-indicator__icon">{match ? '✅' : '⛔'}</span>
          <span className="kg-status-indicator__text">
            {match ? '密钥一致，加密数据安全' : '密钥不匹配！加密数据无法解密'}
          </span>
        </div>
        {!keysSet && (
          <div className="kg-status-indicator kg-status-indicator--warn">
            <span className="kg-status-indicator__icon">⚠️</span>
            <span className="kg-status-indicator__text">
              PII 加密密钥未在 .env 中设置（当前使用开发默认密钥）
            </span>
          </div>
        )}
      </div>

      {/* ── 指纹对比视图 ──────────────────────────── */}
      <div className="kg-compare">
        <div className="kg-compare__column">
          <h4 className="kg-compare__heading">🔑 当前 .env 密钥</h4>
          <FingerprintDisplay label="加密密钥 (AES)" value={current?.encryptionKeyFingerprint} />
          <FingerprintDisplay label="HMAC 密钥" value={current?.hmacKeyFingerprint} />
          <span className="kg-compare__version">版本: {current?.version || '—'}</span>
        </div>
        <div className="kg-compare__divider">
          <span className={`kg-compare__match-icon ${match ? 'kg-compare__match-icon--ok' : 'kg-compare__match-icon--fail'}`}>
            {match ? '=' : '≠'}
          </span>
        </div>
        <div className="kg-compare__column">
          <h4 className="kg-compare__heading">🗄️ 数据库记录密钥</h4>
          {stored ? (
            <>
              <FingerprintDisplay label="加密密钥 (AES)" value={stored.encryptionKeyFingerprint} />
              <FingerprintDisplay label="HMAC 密钥" value={stored.hmacKeyFingerprint} />
              <span className="kg-compare__version">版本: {stored.version || '—'}</span>
            </>
          ) : (
            <div className="kg-compare__empty">尚未注册（首次启动会自动写入）</div>
          )}
        </div>
      </div>

      {/* ── 不匹配时的恢复指引 ────────────────────── */}
      {!match && (
        <div className="kg-recovery">
          <h4 className="kg-recovery__title">⚡ 恢复步骤</h4>
          <ol className="kg-recovery__steps">
            <li>从下方备份中下载正确的 <code>.env</code> 文件</li>
            <li>替换服务器上的 <code>server/.env</code></li>
            <li>执行 <code>docker compose restart app</code></li>
            <li>刷新此页面确认状态恢复为 ✅</li>
          </ol>

          {envBackups && envBackups.length > 0 ? (
            <div className="kg-recovery__backups">
              <h5 className="kg-recovery__backups-title">可用的 .env 备份</h5>
              <div className="kg-recovery__backup-list">
                {envBackups.map((eb) => (
                  <button
                    key={eb.filename}
                    className="btn btn--ghost btn--sm kg-recovery__backup-btn"
                    onClick={() => void handleDownloadEnv(eb.filename)}
                  >
                    📥 {eb.filename}
                    <span className="kg-recovery__backup-date">
                      {formatDate(eb.backupDate)} · {eb.trigger === 'cron' ? '自动' : '手动'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <CommandNotice tone="danger">
              没有可用的 .env 备份文件。请立即检查服务器上的 .env 是否完整。
            </CommandNotice>
          )}
        </div>
      )}

      {/* ── 匹配时也显示备份提醒 ──────────────────── */}
      {match && reason !== 'no_canary_yet' && (
        <CommandNotice tone="info">
          每次自动备份都会同步保存 .env 文件。如需手动备份，可执行 <code>scripts/run-postgres-backup.sh</code>
        </CommandNotice>
      )}
    </CommandPanel>
  )
}

export default function DatabaseBackupPage() {
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
  const [encStatus, setEncStatus] = useState(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [backupRes, restoreRes, backupStatusRes, restoreStatusRes, encRes] = await Promise.all([
        adminApi.listDbBackups(),
        adminApi.listDbRestores(),
        adminApi.getDbBackupStatus(),
        adminApi.getDbRestoreStatus(),
        adminApi.getEncryptionStatus().catch(() => null),
      ])
      setBackups(backupRes?.data?.items || [])
      setRestores(restoreRes?.data?.items || [])
      setStatus({
        backupRunning: Boolean(backupStatusRes?.data?.running),
        restoreRunning: Boolean(restoreStatusRes?.data?.running),
      })
      if (encRes?.data) setEncStatus(encRes.data)
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '加载数据库备份信息失败。' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    if (!status.backupRunning && !status.restoreRunning) return undefined
    const timer = setInterval(() => {
      void loadData()
    }, 5000)
    return () => clearInterval(timer)
  }, [status.backupRunning, status.restoreRunning])

  const busy = creatingBackup || uploading || startingRestore || status.backupRunning || status.restoreRunning

  const metrics = useMemo(() => ([
    {
      key: 'policy',
      label: '保留策略',
      value: '10 份',
      meta: '服务器自动保留最近 10 份备份。',
      pill: 'RET',
    },
    {
      key: 'backup',
      label: '备份任务',
      value: status.backupRunning ? '执行中' : '空闲',
      meta: '支持手动触发，也会按计划自动生成。',
      pill: 'DB',
    },
    {
      key: 'restore',
      label: '恢复任务',
      value: status.restoreRunning ? '执行中' : '空闲',
      meta: '恢复默认写入测试库，不直接覆盖生产库。',
      pill: 'RST',
    },
    {
      key: 'latest',
      label: '最近备份',
      value: backups[0]?.createdAt ? formatDate(backups[0].createdAt) : '暂无',
      meta: '优先下载最近一次成功备份做离线留档。',
      pill: 'TIME',
    },
  ]), [backups, status.backupRunning, status.restoreRunning])

  const handleCreateBackup = async () => {
    setCreatingBackup(true)
    setMessage(null)
    try {
      await adminApi.createDbBackup()
      setMessage({ type: 'success', text: '数据库备份已生成。' })
      await loadData()
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '创建备份失败。' })
    } finally {
      setCreatingBackup(false)
    }
  }

  const handleDownload = async (filename) => {
    setMessage(null)
    try {
      const response = await requestRaw.get(`/admin/system/backups/${encodeURIComponent(filename)}/download`, {
        responseType: 'blob',
      })
      const objectUrl = window.URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(objectUrl)
      setMessage({ type: 'success', text: `已开始下载 ${filename}。` })
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '下载备份失败。' })
    }
  }

  const handleDownloadEnv = async (envFilename) => {
    setMessage(null)
    try {
      const response = await requestRaw.get(`/admin/system/backups/${encodeURIComponent(envFilename)}/download-env`, {
        responseType: 'blob',
      })
      const objectUrl = window.URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = envFilename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(objectUrl)
      setMessage({ type: 'success', text: `已开始下载 ${envFilename}。` })
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '下载 .env 备份失败。' })
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
      if (envFile) formData.append('envFile', envFile)

      const response = await requestRaw.post('/admin/system/restores/upload', formData)
      const data = response.data
      if (!data.success) {
        throw new Error(data.message || '上传恢复文件失败')
      }

      setUploadedFile(data.data)
      setMessage({
        type: 'success',
        text: `已上传 ${data.data.filename}${envFile ? '，同时附带 .env 快照（不会自动应用）。' : '。'}`,
      })
      setEnvFile(null)
      if (envFileInputRef.current) envFileInputRef.current.value = ''
    } catch (error) {
      setMessage({ type: 'error', text: error.message || '上传恢复文件失败。' })
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
      setMessage({ type: 'error', text: error.message || '启动恢复失败。' })
    } finally {
      setStartingRestore(false)
    }
  }

  return (
    <div className="command-page surface-admin">
      <CommandShell
        eyebrow="系统维护"
        title="数据库备份与恢复"
        summary="统一管理备份生成、下载留档和测试库恢复任务。所有高风险动作都保持在同一套控制台语法下。"
        actions={(
          <div className="command-actions-row">
            <button className="btn btn--secondary" onClick={() => void loadData()} disabled={loading || busy}>
              刷新状态
            </button>
            <button className="btn btn--primary" onClick={handleCreateBackup} disabled={busy}>
              {creatingBackup ? '生成中...' : '立即生成备份'}
            </button>
          </div>
        )}
      >
        <CommandMetricGrid items={metrics} />
      </CommandShell>

      {message ? <CommandNotice tone={message.type === 'success' ? 'success' : 'danger'}>{message.text}</CommandNotice> : null}
      {loading ? <CommandNotice tone="info">正在同步备份与恢复任务状态...</CommandNotice> : null}

      {/* ── 密钥安全面板 ──────────────────────────── */}
      {!loading && (
        <KeyGuardPanel
          encStatus={encStatus}
          onMessage={setMessage}
        />
      )}

      <CommandPanel
        title="服务器备份"
        subtitle="手动备份和自动备份会汇总在同一张列表里，方便下载留档与快速比对。"
      >
        {!loading && backups.length === 0 ? (
          <CommandEmptyState
            title="当前还没有可下载的备份"
            description="先生成第一份数据库备份，再下载到本地做离线留档。"
            icon="DB"
          />
        ) : null}

        {!loading && backups.length > 0 ? (
          <CommandDataTable>
            <thead>
              <tr>
                <th>文件名</th>
                <th>时间</th>
                <th>大小</th>
                <th>来源</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((item) => (
                <tr key={item.filename}>
                  <td>{item.filename}</td>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>{item.sizeLabel}</td>
                  <td>{item.trigger === 'cron' ? '自动' : '手动'}</td>
                  <td>
                    <CommandStatusTag tone={getStatusTone(item.status)}>
                      {getStatusLabel(item.status)}
                    </CommandStatusTag>
                  </td>
                  <td>
                    <div className="command-actions-row">
                      <button className="btn btn--ghost btn--sm" onClick={() => void handleDownload(item.filename)} disabled={busy}>
                        下载 DB
                      </button>
                      {item.envFile ? (
                        <button className="btn btn--ghost btn--sm" onClick={() => void handleDownloadEnv(item.envFile)} disabled={busy}>
                          下载 .env
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </CommandDataTable>
        ) : null}
      </CommandPanel>

      <div className="command-grid command-grid--two">
        <CommandPanel
          title="上传恢复到测试库"
          subtitle="仅支持 PostgreSQL custom `.dump`，恢复后会创建新的 `door_restore_*` 测试库。"
          footer="恢复成功后仍需核对 users、organizations、races、records 与 knex_migrations 等核心表。"
        >
          <div className="command-stack">
            <div className="command-actions-row">
              <button className="btn btn--secondary" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                {uploading ? '上传中...' : '选择恢复文件'}
              </button>
              <button className="btn btn--ghost" onClick={() => envFileInputRef.current?.click()} disabled={busy}>
                {envFile ? '已附加 .env 快照' : '附加 .env 快照'}
              </button>
              <button className="btn btn--primary" onClick={handleStartRestore} disabled={!uploadedFile || busy}>
                {startingRestore ? '恢复中...' : '恢复到测试库'}
              </button>
            </div>

            {uploadedFile ? (
              <div className="command-definition-list">
                <div className="command-definition-list__row">
                  <span className="command-definition-list__label">已上传文件</span>
                  <span className="command-definition-list__value">{uploadedFile.filename}</span>
                </div>
                <div className="command-definition-list__row">
                  <span className="command-definition-list__label">文件大小</span>
                  <span className="command-definition-list__value">{uploadedFile.sizeLabel}</span>
                </div>
              </div>
            ) : (
              <CommandEmptyState
                title="尚未选择恢复文件"
                description="先上传一个备份文件，再启动恢复到测试库。"
                icon="UP"
              />
            )}

            <CommandNotice tone="warning">
              恢复不会覆盖生产数据库，也不会自动应用 .env；密钥快照仅随恢复记录保留，正式切换需按运维手册执行。
            </CommandNotice>
          </div>
        </CommandPanel>

        <CommandPanel
          title="恢复记录"
          subtitle="快速查看最近恢复任务的目标库、校验结果和异常信息。"
        >
          {!loading && restores.length === 0 ? (
            <CommandEmptyState
              title="当前还没有恢复记录"
              description="上传并启动一次测试库恢复后，这里会展示任务详情和校验结果。"
              icon="RS"
            />
          ) : null}

          {!loading && restores.length > 0 ? (
            <CommandDataTable>
              <thead>
                <tr>
                  <th>文件</th>
                  <th>目标库</th>
                  <th>状态</th>
                  <th>时间</th>
                  <th>校验</th>
                </tr>
              </thead>
              <tbody>
                {restores.map((job) => (
                  <tr key={job.jobId}>
                    <td>{job.filename}</td>
                    <td>{job.targetDatabase}</td>
                    <td>
                      <CommandStatusTag tone={getStatusTone(job.status)}>
                        {getStatusLabel(job.status)}
                      </CommandStatusTag>
                    </td>
                    <td>
                      <div>上传：{formatDate(job.uploadedAt)}</div>
                      <div>开始：{formatDate(job.startedAt)}</div>
                      <div>完成：{formatDate(job.finishedAt)}</div>
                    </td>
                    <td>
                      {job.checks ? (
                        <div className="command-stack" style={{ gap: 6 }}>
                          <span>连接：{job.checks.connectivity ? '通过' : '失败'}</span>
                          <span>Migration：{job.checks.migrationTablePresent ? '存在' : '缺失'}</span>
                          <span>核心表：{job.checks.tablesPresent ? '齐全' : '缺失'}</span>
                          <span>.env 快照：{job.envSnapshotProvided ? '已附加（未应用）' : '未附加'}</span>
                          {job.error ? <span style={{ color: 'var(--danger)' }}>错误：{job.error}</span> : null}
                        </div>
                      ) : (
                        job.error || '待校验'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </CommandDataTable>
          ) : null}
        </CommandPanel>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".dump"
        style={{ display: 'none' }}
        onChange={handleUpload}
      />
      <input
        ref={envFileInputRef}
        type="file"
        accept=".env"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) setEnvFile(file)
        }}
      />
    </div>
  )
}

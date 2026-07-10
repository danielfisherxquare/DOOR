import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { opsBibTrackingApi as bibTrackingApi } from '../../api/bibTracking'
import { opsCredentialApi as credentialApi } from '../../api/credential'
import { CommandEmptyState, CommandNotice, CommandPanel, CommandStatusTag } from '../../components/command/CommandPrimitives'

const BIB_STATUS_LABELS = {
  receipt_printed: '凭条已打印',
  picked_up: '已领取',
  checked_in: '已检录',
  finished: '已完赛',
}

const CREDENTIAL_STATUS_LABELS = {
  generated: '已生成',
  printed: '已打印',
  issued: '已发放',
  voided: '已作废',
  active: '使用中',
}

const INFO_TONE_MAP = {
  success: 'success',
  neutral: 'info',
  error: 'danger',
  warning: 'warning',
}

function getBibInfoState(item) {
  if (!item) return null
  if (item.result === 'picked_up_now') {
    return { tone: 'success', message: '已确认领取。' }
  }
  switch (item.actionReason) {
    case 'already_picked_up':
      return { tone: 'success', message: '该号码布已领取，无需重复操作。' }
    case 'already_checked_in':
      return { tone: 'neutral', message: '该号码布已检录，不能再做领取确认。' }
    case 'already_finished':
      return { tone: 'neutral', message: '该号码布已完赛，不能再做领取确认。' }
    case 'invalidated':
      return { tone: 'error', message: '该二维码已失效，请联系工作人员重新生成。' }
    default:
      return null
  }
}

function getCredentialInfoState(item) {
  if (!item) return null
  if (item.status === 'voided') {
    return { tone: 'error', message: '该证件已作废，不允许通行。' }
  }
  if (item.status === 'issued' || item.status === 'active') {
    return { tone: 'success', message: '证件有效，允许通行。' }
  }
  if (item.status === 'generated' || item.status === 'printed') {
    return { tone: 'warning', message: '该证件尚未发放，请先完成领取登记。' }
  }
  return null
}

function ResultField({ label, value }) {
  return (
    <div className="command-definition-list__row">
      <div className="command-definition-list__label">{label}</div>
      <div className="command-definition-list__value">{value || '-'}</div>
    </div>
  )
}

function BibResultCard({ item, token }) {
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [current, setCurrent] = useState(item)

  const infoState = getBibInfoState(current)

  const handlePickup = async () => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const response = await bibTrackingApi.pickup(token)
      setCurrent((prev) => (prev ? { ...prev, ...response.data } : prev))
    } catch (err) {
      setSubmitError(err.message || '领取更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="command-stack">
      <div className="command-actions-row">
        <CommandStatusTag tone="info">号码布</CommandStatusTag>
        <CommandStatusTag>{BIB_STATUS_LABELS[current.status] || current.status}</CommandStatusTag>
      </div>
      <div className="command-field-grid">
        <ResultField label="姓名" value={current.name} />
        <ResultField label="号码布号" value={current.bibNumber} />
      </div>

      {submitError ? <CommandNotice tone="danger">{submitError}</CommandNotice> : null}
      {infoState ? <CommandNotice tone={INFO_TONE_MAP[infoState.tone] || 'info'}>{infoState.message}</CommandNotice> : null}

      {current.nextAction === 'pickup' ? (
        <div className="command-actions-row">
          <button className="btn btn--primary" onClick={handlePickup} disabled={submitting}>
            {submitting ? '提交中...' : '确认已领取'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function CredentialResultCard({ item }) {
  const infoState = getCredentialInfoState(item)
  const accessAreas = item.accessAreas || item.accessCodeList || ''

  return (
    <div className="command-stack">
      <div className="command-actions-row">
        <CommandStatusTag tone="warning">工作证件</CommandStatusTag>
        <CommandStatusTag>{CREDENTIAL_STATUS_LABELS[item.status] || item.status}</CommandStatusTag>
      </div>
      <div className="command-field-grid">
        <ResultField label="持证人" value={item.personName} />
        <ResultField label="证件编号" value={item.credentialNo} />
        <ResultField label="类别 / 岗位" value={item.categoryName} />
        <ResultField label="单位" value={item.orgName} />
      </div>
      {accessAreas ? <ResultField label="可通行区域" value={accessAreas} /> : null}
      {infoState ? <CommandNotice tone={INFO_TONE_MAP[infoState.tone] || 'info'}>{infoState.message}</CommandNotice> : null}
    </div>
  )
}

function ScanResult() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('t') || ''
  const [resultType, setResultType] = useState(null)
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!token) {
      setItem(null)
      setLoading(false)
      setLoadError('缺少二维码 token')
      return
    }

    let cancelled = false
    setLoading(true)
    setItem(null)
    setResultType(null)
    setLoadError('')

    bibTrackingApi.resolveScan(token)
      .then((response) => {
        if (!cancelled) {
          setResultType('bib')
          setItem(response.data)
        }
      })
      .catch(() => credentialApi.resolveCredential(token)
        .then((response) => {
          if (!cancelled) {
            setResultType('credential')
            setItem(response.data)
          }
        }))
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || '二维码无效或已失效')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <div className="command-page surface-ops command-page--narrow">
      <CommandPanel
        title="扫码结果"
        subtitle="系统已经解析当前二维码，并给出可执行动作。继续扫码会直接返回执行端采集页。"
        actions={<button className="btn btn--ghost" onClick={() => navigate('/ops/scan')}>继续扫码</button>}
      >
        {loading ? <CommandNotice tone="info">正在读取二维码状态...</CommandNotice> : null}

        {!loading && loadError ? (
          <CommandEmptyState
            title="未能解析当前二维码"
            description={loadError}
            action={<Link to="/ops/scan" className="btn btn--primary">返回扫码首页</Link>}
            icon="ERR"
          />
        ) : null}

        {!loading && item && resultType === 'bib' ? <BibResultCard item={item} token={token} /> : null}
        {!loading && item && resultType === 'credential' ? <CredentialResultCard item={item} /> : null}
      </CommandPanel>
    </div>
  )
}

export default ScanResult

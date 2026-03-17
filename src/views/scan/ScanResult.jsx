import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import bibTrackingApi from '../../api/bibTracking'
import credentialApi from '../../api/credential'

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

const INFO_STYLES = {
  success: { color: '#166534', background: '#DCFCE7', border: '1px solid #86EFAC' },
  neutral: { color: '#334155', background: '#F8FAFC', border: '1px solid #CBD5E1' },
  error: { color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA' },
  warning: { color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A' },
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

/* ── Bib Result Card ── */
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
      setCurrent((prev) => prev ? { ...prev, ...response.data } : prev)
    } catch (err) {
      setSubmitError(err.message || '领取更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, color: '#3B82F6' }}>号码布</div>
      <div style={{ display: 'grid', gap: 12, borderRadius: 20, background: '#F8FAFC', padding: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: '#64748B' }}>姓名</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{current.name || '-'}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: '#64748B' }}>号码布号</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{current.bibNumber}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#64748B' }}>当前状态</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{BIB_STATUS_LABELS[current.status] || current.status}</div>
          </div>
        </div>
      </div>

      {submitError && <div style={{ color: '#DC2626' }}>{submitError}</div>}

      {infoState && (
        <div style={{ borderRadius: 14, padding: '12px 14px', fontSize: 14, ...INFO_STYLES[infoState.tone] }}>
          {infoState.message}
        </div>
      )}

      {current.nextAction === 'pickup' ? (
        <button className="btn btn--primary" onClick={handlePickup} disabled={submitting}>
          {submitting ? '提交中...' : '确认已领取'}
        </button>
      ) : null}
    </>
  )
}

/* ── Credential Result Card ── */
function CredentialResultCard({ item }) {
  const infoState = getCredentialInfoState(item)
  const accessAreas = item.accessAreas || item.accessCodeList || ''

  return (
    <>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, color: '#8B5CF6' }}>工作证件</div>
      <div style={{ display: 'grid', gap: 12, borderRadius: 20, background: '#F8FAFC', padding: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: '#64748B' }}>持证人</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{item.personName || '-'}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: '#64748B' }}>证件编号</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{item.credentialNo || '-'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#64748B' }}>类别/岗位</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{item.categoryName || '-'}</div>
          </div>
        </div>
        {item.orgName && (
          <div>
            <div style={{ fontSize: 12, color: '#64748B' }}>单位</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{item.orgName}</div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: '#64748B' }}>当前状态</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{CREDENTIAL_STATUS_LABELS[item.status] || item.status}</div>
          </div>
          {accessAreas && (
            <div>
              <div style={{ fontSize: 12, color: '#64748B' }}>可通行区域</div>
              <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>{accessAreas}</div>
            </div>
          )}
        </div>
      </div>

      {infoState && (
        <div style={{ borderRadius: 14, padding: '12px 14px', fontSize: 14, ...INFO_STYLES[infoState.tone] }}>
          {infoState.message}
        </div>
      )}
    </>
  )
}

/* ── ScanResult (Main) ── */
function ScanResult() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('t') || ''
  const [resultType, setResultType] = useState(null)   // 'bib' | 'credential'
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

    // 先尝试号码布解析，失败则尝试证件解析
    bibTrackingApi.resolveScan(token)
      .then((response) => {
        if (!cancelled) {
          setResultType('bib')
          setItem(response.data)
        }
      })
      .catch(() => {
        // 号码布解析失败，尝试证件
        return credentialApi.resolveCredential(token)
          .then((response) => {
            if (!cancelled) {
              setResultType('credential')
              setItem(response.data)
            }
          })
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || '二维码无效或已失效')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [token])

  return (
    <div style={{ background: '#fff', borderRadius: 24, padding: 20, boxShadow: '0 20px 50px rgba(15, 23, 42, 0.08)', display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>扫码结果</div>
        <button className="btn btn--ghost" onClick={() => navigate('/scan')}>继续扫码</button>
      </div>

      {loading && <div>正在读取二维码状态...</div>}
      {!loading && loadError && <div style={{ color: '#DC2626' }}>{loadError}</div>}

      {!loading && item && resultType === 'bib' && (
        <BibResultCard item={item} token={token} />
      )}

      {!loading && item && resultType === 'credential' && (
        <CredentialResultCard item={item} />
      )}

      <Link to="/scan" style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 600 }}>返回扫码首页</Link>
    </div>
  )
}

export default ScanResult

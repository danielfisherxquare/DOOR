import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import bibTrackingApi from '../../api/bibTracking'

const STATUS_LABELS = {
  receipt_printed: '凭条已打印',
  picked_up: '已领取',
  checked_in: '已检录',
  finished: '已完赛',
}

const INFO_STYLES = {
  success: { color: '#166534', background: '#DCFCE7', border: '1px solid #86EFAC' },
  neutral: { color: '#334155', background: '#F8FAFC', border: '1px solid #CBD5E1' },
  error: { color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA' },
}

function getInfoState(item) {
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

function ScanResult() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('t') || ''
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [submitError, setSubmitError] = useState('')

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
    setLoadError('')
    setSubmitError('')

    bibTrackingApi.resolveScan(token)
      .then((response) => {
        if (!cancelled) setItem(response.data)
      })
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

  const handlePickup = async () => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const response = await bibTrackingApi.pickup(token)
      setItem((current) => current ? { ...current, ...response.data } : current)
    } catch (err) {
      setSubmitError(err.message || '领取更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  const infoState = getInfoState(item)

  return (
    <div style={{ background: '#fff', borderRadius: 24, padding: 20, boxShadow: '0 20px 50px rgba(15, 23, 42, 0.08)', display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>扫码结果</div>
        <button className="btn btn--ghost" onClick={() => navigate('/scan')}>继续扫码</button>
      </div>

      {loading && <div>正在读取二维码状态...</div>}
      {!loading && loadError && <div style={{ color: '#DC2626' }}>{loadError}</div>}

      {!loading && item && (
        <>
          <div style={{ display: 'grid', gap: 12, borderRadius: 20, background: '#F8FAFC', padding: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: '#64748B' }}>姓名</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{item.name || '-'}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: '#64748B' }}>号码布号</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{item.bibNumber}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#64748B' }}>当前状态</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{STATUS_LABELS[item.status] || item.status}</div>
              </div>
            </div>
          </div>

          {submitError && <div style={{ color: '#DC2626' }}>{submitError}</div>}

          {infoState && (
            <div style={{ borderRadius: 14, padding: '12px 14px', fontSize: 14, ...INFO_STYLES[infoState.tone] }}>
              {infoState.message}
            </div>
          )}

          {item.nextAction === 'pickup' ? (
            <button className="btn btn--primary" onClick={handlePickup} disabled={submitting}>
              {submitting ? '提交中...' : '确认已领取'}
            </button>
          ) : null}
        </>
      )}

      <Link to="/scan" style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 600 }}>返回扫码首页</Link>
    </div>
  )
}

export default ScanResult

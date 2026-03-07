import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import bibTrackingApi from '../../api/bibTracking'

const STATUS_LABELS = {
  receipt_printed: '凭条已打印',
  picked_up: '已领取',
  checked_in: '已检录',
  finished: '已完赛',
}

function ScanResult() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('t') || ''
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setLoading(false)
      setError('缺少二维码 token')
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    bibTrackingApi.resolveScan(token)
      .then((response) => {
        if (!cancelled) setItem(response.data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || '二维码无效或已失效')
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
    setError('')
    try {
      const response = await bibTrackingApi.pickup(token)
      setItem((current) => current ? { ...current, ...response.data, allowedAction: 'none' } : current)
    } catch (err) {
      setError(err.message || '领取更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 24, padding: 20, boxShadow: '0 20px 50px rgba(15, 23, 42, 0.08)', display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>扫码结果</div>
        <button className="btn btn--ghost" onClick={() => navigate('/scan')}>继续扫码</button>
      </div>

      {loading && <div>正在读取二维码状态...</div>}
      {!loading && error && <div style={{ color: '#DC2626' }}>{error}</div>}

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

          {item.allowedAction === 'pickup' ? (
            <button className="btn btn--primary" onClick={handlePickup} disabled={submitting}>
              {submitting ? '提交中...' : '确认已领取'}
            </button>
          ) : (
            <div style={{ color: '#475569', fontSize: 14 }}>当前状态不允许执行领取操作。</div>
          )}
        </>
      )}

      <Link to="/scan" style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 600 }}>返回扫码首页</Link>
    </div>
  )
}

export default ScanResult

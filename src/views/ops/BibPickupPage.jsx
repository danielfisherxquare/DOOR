import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BrowserQRCodeReader } from '@zxing/browser'
import { opsBibTrackingApi as bibTrackingApi } from '../../api/bibTracking'

const BIB_STATUS_LABELS = {
  receipt_printed: '凭条已打印',
  picked_up: '已领取',
  checked_in: '已检录',
  finished: '已完赛',
}

function extractToken(rawText) {
  const text = String(rawText || '').trim()
  if (!text) return ''
  try {
    const url = new URL(text)
    return url.searchParams.get('t') || ''
  } catch {
    return text
  }
}

function detectCameraSupport() {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return '当前页面不是 HTTPS，浏览器禁止使用摄像头。请使用 https:// 开头的地址访问。'
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    return '当前浏览器不支持摄像头 API，请更换浏览器（推荐 Chrome / Safari）。'
  }
  return null
}

function getCameraErrorMessage(err) {
  const name = err?.name || ''
  const msg = err?.message || ''

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return '摄像头权限被拒绝。请点击浏览器地址栏的锁头/设置图标，允许摄像头权限后刷新页面重试。'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return '未检测到摄像头设备。请确认设备带有摄像头。'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return '摄像头被其它应用占用或无法读取，请关闭其它使用摄像头的应用后重试。'
  }
  if (name === 'OverconstrainedError') {
    return '当前摄像头不满足要求，正在尝试使用默认摄像头...'
  }
  if (name === 'AbortError') {
    return '摄像头启动被中止，请重试。'
  }
  if (name === 'SecurityError') {
    return '浏览器安全策略阻止了摄像头访问。请确保使用 HTTPS 并允许摄像头权限。'
  }
  if (name === 'TypeError') {
    return '浏览器不支持摄像头 API。请使用 Chrome 或 Safari 浏览器。'
  }
  return `无法打开摄像头：${msg || name || '未知错误'}`
}

function BibPickupPage() {
  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const controlsRef = useRef(null)
  const scanningRef = useRef(false)
  const lastDetectedRef = useRef({ token: '', at: 0 })
  const [searchParams] = useSearchParams()
  const [manualToken, setManualToken] = useState(searchParams.get('t') || '')
  const [cameraError, setCameraError] = useState('')
  const [cameraState, setCameraState] = useState('idle')

  // 扫码结果状态
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const preset = searchParams.get('t')
    if (preset) {
      handleToken(preset)
    }
    scanningRef.current = false
  }, [searchParams])

  useEffect(() => {
    return () => {
      controlsRef.current?.stop()
      readerRef.current = null
      controlsRef.current = null
      scanningRef.current = false
    }
  }, [])

  const stopScanning = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    readerRef.current = null
    scanningRef.current = false
    setCameraState('idle')
    setCameraError('')
  }, [])

  const handleToken = useCallback(async (token) => {
    if (!token) return

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const response = await bibTrackingApi.resolveScan(token)
      setResult(response.data)
    } catch (err) {
      setError(err.message || '二维码无效或已失效')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDetectedToken = useCallback((token) => {
    if (!token) return

    const now = Date.now()
    const lastDetected = lastDetectedRef.current
    if (lastDetected.token === token && now - lastDetected.at < 1000) {
      return
    }

    lastDetectedRef.current = { token, at: now }
    scanningRef.current = true
    controlsRef.current?.stop()
    controlsRef.current = null
    readerRef.current = null
    handleToken(token)
  }, [handleToken])

  const startScanning = useCallback(async () => {
    const envError = detectCameraSupport()
    if (envError) {
      setCameraState('error')
      setCameraError(envError)
      return
    }

    setCameraState('requesting')
    setCameraError('')
    scanningRef.current = false

    try {
      const reader = new BrowserQRCodeReader()
      readerRef.current = reader

      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result) => {
          if (result && !scanningRef.current) {
            const token = extractToken(result.getText())
            handleDetectedToken(token)
          }
        }
      )

      controlsRef.current = controls
      setCameraState('scanning')
    } catch (err) {
      console.error('[BibPickupPage] 摄像头启动失败:', err)

      if (err?.name === 'OverconstrainedError') {
        try {
          const reader = new BrowserQRCodeReader()
          readerRef.current = reader
          const stream = await navigator.mediaDevices.getUserMedia({ video: true })
          const controls = await reader.decodeFromStream(stream, videoRef.current, (result) => {
            if (result && !scanningRef.current) {
              const token = extractToken(result.getText())
              handleDetectedToken(token)
            }
          })
          controlsRef.current = controls
          setCameraState('scanning')
          return
        } catch (fallbackErr) {
          console.error('[BibPickupPage] 降级方案也失败:', fallbackErr)
          setCameraState('error')
          setCameraError(getCameraErrorMessage(fallbackErr))
          return
        }
      }

      setCameraState('error')
      setCameraError(getCameraErrorMessage(err))
    }
  }, [handleDetectedToken])

  const handleManualSubmit = (event) => {
    event.preventDefault()
    const token = extractToken(manualToken)
    if (!token) return
    handleToken(token)
  }

  const handlePickup = async () => {
    if (!result || !manualToken) return
    const token = extractToken(manualToken) || searchParams.get('t')
    if (!token) return

    setSubmitting(true)
    setError('')
    try {
      const response = await bibTrackingApi.pickup(token)
      setResult((prev) => prev ? { ...prev, ...response.data } : prev)
    } catch (err) {
      setError(err.message || '领取更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  const resetScan = () => {
    setResult(null)
    setError('')
    setManualToken('')
    setCameraState('idle')
  }

  const isVideoVisible = cameraState === 'scanning'

  // 显示结果
  if (result) {
    const canPickup = result.nextAction === 'pickup'
    const isAlreadyPickedUp = result.actionReason === 'already_picked_up'

    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ background: '#fff', borderRadius: 24, padding: 20, boxShadow: '0 20px 50px rgba(15, 23, 42, 0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, color: '#3B82F6' }}>号码布领取</div>
            <button className="btn btn--ghost" onClick={resetScan} style={{ fontSize: 13, padding: '4px 12px' }}>
              继续扫码
            </button>
          </div>

          <div style={{ display: 'grid', gap: 12, borderRadius: 20, background: '#F8FAFC', padding: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: '#64748B' }}>姓名</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{result.name || '-'}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: '#64748B' }}>号码布号</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{result.bibNumber}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#64748B' }}>当前状态</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{BIB_STATUS_LABELS[result.status] || result.status}</div>
              </div>
            </div>
          </div>

          {error && <div style={{ color: '#DC2626', marginTop: 12 }}>{error}</div>}

          {isAlreadyPickedUp && (
            <div style={{ borderRadius: 14, padding: '12px 14px', fontSize: 14, marginTop: 12, color: '#166534', background: '#DCFCE7', border: '1px solid #86EFAC' }}>
              该号码布已领取，无需重复操作。
            </div>
          )}

          {canPickup && (
            <button
              className="btn btn--primary"
              onClick={handlePickup}
              disabled={submitting}
              style={{ marginTop: 16, width: '100%' }}
            >
              {submitting ? '提交中...' : '确认已领取'}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: 16, boxShadow: '0 20px 50px rgba(15, 23, 42, 0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>号码布领取扫码</div>
          {cameraState === 'scanning' && (
            <button className="btn btn--ghost" onClick={stopScanning} style={{ fontSize: 13, padding: '4px 12px' }}>
              停止扫码
            </button>
          )}
        </div>
        <div style={{
          borderRadius: 20,
          overflow: 'hidden',
          background: '#0F172A',
          minHeight: 280,
          height: 'calc(100vh - 340px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}>
          <video
            ref={videoRef}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: isVideoVisible ? 'block' : 'none'
            }}
            muted
            playsInline
            autoPlay
          />

          {!isVideoVisible && (
            <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8' }}>
              {cameraState === 'idle' && (
                <>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🎫</div>
                  <div style={{ marginBottom: 16, fontSize: 14 }}>扫描号码布二维码进行领取确认</div>
                  <button
                    className="btn btn--primary"
                    onClick={startScanning}
                    style={{ fontSize: 16, padding: '12px 32px' }}
                  >
                    开始扫码
                  </button>
                </>
              )}
              {cameraState === 'requesting' && (
                <>
                  <div style={{ fontSize: 36, marginBottom: 16, animation: 'pulse 1.5s infinite' }}>📷</div>
                  <div style={{ fontSize: 14 }}>正在请求摄像头权限...</div>
                </>
              )}
              {cameraState === 'error' && (
                <>
                <div style={{ fontSize: 16, marginBottom: 16, fontWeight: 700, letterSpacing: '0.08em' }}>WARN</div>
                  <div style={{ color: '#FCA5A5', fontSize: 13, marginBottom: 16, lineHeight: 1.6, maxWidth: 280, margin: '0 auto 16px' }}>
                    {cameraError}
                  </div>
                  <button
                    className="btn btn--ghost"
                    onClick={startScanning}
                    style={{ fontSize: 14, color: '#94A3B8', borderColor: '#475569' }}
                  >
                    重试
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleManualSubmit} style={{ background: '#fff', borderRadius: 24, padding: 16, boxShadow: '0 20px 50px rgba(15, 23, 42, 0.08)', display: 'grid', gap: 12 }}>
        <div style={{ fontWeight: 700 }}>手动输入</div>
        <input
          className="input"
          placeholder="粘贴二维码链接或 token"
          value={manualToken}
          onChange={(event) => setManualToken(event.target.value)}
        />
        <button className="btn btn--primary" type="submit" disabled={loading}>
          {loading ? '查询中...' : '查询状态'}
        </button>
      </form>

      {error && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', borderRadius: 16, padding: 16 }}>
          {error}
        </div>
      )}
    </div>
  )
}

export default BibPickupPage

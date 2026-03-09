import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BrowserQRCodeReader } from '@zxing/browser'

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

/**
 * 检测摄像头环境可用性
 */
function detectCameraSupport() {
  // window.isSecureContext: HTTPS 或 localhost 时为 true
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return '当前页面不是 HTTPS，浏览器禁止使用摄像头。请使用 https:// 开头的地址访问。'
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    return '当前浏览器不支持摄像头 API，请更换浏览器（推荐 Chrome / Safari）。'
  }
  return null
}

/**
 * 根据错误对象返回用户友好的中文提示
 */
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
  // TypeError 通常意味着 getUserMedia 不可用
  if (name === 'TypeError') {
    return '浏览器不支持摄像头 API。请使用 Chrome 或 Safari 浏览器。'
  }
  return `无法打开摄像头：${msg || name || '未知错误'}`
}

function ScanHome() {
  // ⚠️ 关键：video 元素始终保持在 DOM 中，不做条件渲染
  //    避免 React 重新渲染时销毁/重建 video 节点导致 @zxing 引用失效
  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const controlsRef = useRef(null)
  const scanningRef = useRef(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [manualToken, setManualToken] = useState(searchParams.get('t') || '')
  const [cameraError, setCameraError] = useState('')
  // idle | requesting | scanning | error
  const [cameraState, setCameraState] = useState('idle')

  // 如果 URL 中自带 token，直接跳转结果页
  useEffect(() => {
    const preset = searchParams.get('t')
    if (preset) {
      navigate(`/scan/result?t=${encodeURIComponent(preset)}`, { replace: true })
    }
  }, [navigate, searchParams])

  // 清理：组件卸载时停止扫码
  useEffect(() => {
    return () => {
      controlsRef.current?.stop()
      readerRef.current = null
      controlsRef.current = null
    }
  }, [])

  const stopScanning = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    readerRef.current = null
    setCameraState('idle')
    setCameraError('')
  }, [])

  const startScanning = useCallback(async () => {
    // 环境检测
    const envError = detectCameraSupport()
    if (envError) {
      setCameraState('error')
      setCameraError(envError)
      return
    }

    setCameraState('requesting')
    setCameraError('')

    try {
      // @zxing/browser 内部会自己调用 getUserMedia，
      // 所以直接让它来处理，不需要预先请求再释放。
      // 将 videoRef.current 传给 reader，它会绑定 srcObject。
      const reader = new BrowserQRCodeReader()
      readerRef.current = reader

      const controls = await reader.decodeFromVideoDevice(
        undefined,           // deviceId: undefined = 让库自己选择（优先后置摄像头）
        videoRef.current,    // 已经挂载好的 video 元素
        (result, error) => {
          if (result && !scanningRef.current) {
            const token = extractToken(result.getText())
            if (!token) return
            scanningRef.current = true
            navigate(`/scan/result?t=${encodeURIComponent(token)}`)
          }
          // NotFoundException 是正常的"当前帧未识别到二维码"，忽略即可
        }
      )

      controlsRef.current = controls
      setCameraState('scanning')
    } catch (err) {
      console.error('[ScanHome] 摄像头启动失败:', err)

      // 如果是 OverconstrainedError，尝试不指定 facingMode 的降级方案
      if (err?.name === 'OverconstrainedError') {
        try {
          const reader = new BrowserQRCodeReader()
          readerRef.current = reader
          // 降级：不指定任何约束，使用默认摄像头
          const stream = await navigator.mediaDevices.getUserMedia({ video: true })
          const controls = await reader.decodeFromStream(stream, videoRef.current, (result) => {
            if (result && !scanningRef.current) {
              const token = extractToken(result.getText())
              if (!token) return
              scanningRef.current = true
              navigate(`/scan/result?t=${encodeURIComponent(token)}`)
            }
          })
          controlsRef.current = controls
          setCameraState('scanning')
          return
        } catch (fallbackErr) {
          console.error('[ScanHome] 降级方案也失败:', fallbackErr)
          setCameraState('error')
          setCameraError(getCameraErrorMessage(fallbackErr))
          return
        }
      }

      setCameraState('error')
      setCameraError(getCameraErrorMessage(err))
    }
  }, [navigate])

  const handleManualSubmit = (event) => {
    event.preventDefault()
    const token = extractToken(manualToken)
    if (!token) return
    navigate(`/scan/result?t=${encodeURIComponent(token)}`)
  }

  const isVideoVisible = cameraState === 'scanning'

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: 16, boxShadow: '0 20px 50px rgba(15, 23, 42, 0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700 }}>扫码区</div>
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
          aspectRatio: '3 / 4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}>
          {/* ⚠️ video 元素始终存在于 DOM 中，通过 CSS 控制显隐 */}
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

          {/* 非扫码状态的覆盖层 */}
          {!isVideoVisible && (
            <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8' }}>
              {cameraState === 'idle' && (
                <>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>📷</div>
                  <div style={{ marginBottom: 16, fontSize: 14 }}>点击下方按钮开始扫码</div>
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
                  <div style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>请在浏览器弹窗中点击"允许"</div>
                </>
              )}
              {cameraState === 'error' && (
                <>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
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

        {/* 调试信息（生产环境可删除） */}
        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8, fontFamily: 'monospace' }}>
          状态: {cameraState}
          {' | '}安全上下文: {typeof window !== 'undefined' ? String(window.isSecureContext) : '?'}
          {' | '}协议: {typeof location !== 'undefined' ? location.protocol : '?'}
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
        <button className="btn btn--primary" type="submit">查询状态</button>
      </form>
    </div>
  )
}

export default ScanHome

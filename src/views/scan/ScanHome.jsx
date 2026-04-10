import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BrowserQRCodeReader } from '@zxing/browser'
import { CommandNotice, CommandPanel } from '../../components/command/CommandPrimitives'

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
    return '摄像头权限被拒绝。请点击浏览器地址栏的锁头或设置图标，允许摄像头权限后刷新页面重试。'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return '未检测到摄像头设备。请确认设备带有摄像头。'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return '摄像头被其他应用占用或无法读取，请关闭其他使用摄像头的应用后重试。'
  }
  if (name === 'OverconstrainedError') {
    return '当前摄像头不满足要求，系统正在尝试使用默认摄像头。'
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

function CameraGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function ScanHome() {
  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const controlsRef = useRef(null)
  const scanningRef = useRef(false)
  const lastDetectedRef = useRef({ token: '', at: 0 })
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [manualToken, setManualToken] = useState(searchParams.get('t') || '')
  const [cameraError, setCameraError] = useState('')
  const [cameraState, setCameraState] = useState('idle')

  useEffect(() => {
    const preset = searchParams.get('t')
    if (preset) {
      navigate(`/ops/scan/result?t=${encodeURIComponent(preset)}`, { replace: true })
      return
    }
    scanningRef.current = false
  }, [navigate, searchParams])

  useEffect(() => () => {
    controlsRef.current?.stop()
    readerRef.current = null
    controlsRef.current = null
    scanningRef.current = false
  }, [])

  const stopScanning = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    readerRef.current = null
    scanningRef.current = false
    setCameraState('idle')
    setCameraError('')
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
    navigate(`/ops/scan/result?t=${encodeURIComponent(token)}`)
  }, [navigate])

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
        },
      )

      controlsRef.current = controls
      setCameraState('scanning')
    } catch (err) {
      console.error('[ScanHome] 摄像头启动失败:', err)

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
          console.error('[ScanHome] 降级方案也失败:', fallbackErr)
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
    navigate(`/ops/scan/result?t=${encodeURIComponent(token)}`)
  }

  const isVideoVisible = cameraState === 'scanning'

  return (
    <div className="command-page surface-ops">
      <CommandNotice tone="info">
        扫码页已经切换到执行指挥台语法。摄像头区、权限提示、失败重试和手动输入共用同一层级，不再使用旧版白卡和 emoji 状态块。
      </CommandNotice>

      <CommandPanel
        title="扫码采集区"
        subtitle="优先使用摄像头完成二维码采集；如果设备权限受限，可以直接切换到下方手动输入。"
        actions={cameraState === 'scanning' ? (
          <button className="btn btn--ghost" onClick={stopScanning}>
            停止扫码
          </button>
        ) : null}
      >
        <div className="command-scanner">
          <div className="command-scanner__stage">
            <video
              ref={videoRef}
              className={`command-scanner__video ${isVideoVisible ? '' : 'command-scanner__video--hidden'}`.trim()}
              muted
              playsInline
              autoPlay
            />

            {!isVideoVisible ? (
              <div className="command-scanner__overlay">
                {cameraState === 'idle' ? (
                  <div className="command-scanner__overlay-content">
                    <span className="command-scanner__glyph" aria-hidden="true"><CameraGlyph /></span>
                    <p className="command-scanner__headline">准备启动摄像头</p>
                    <p className="command-scanner__description">请保持二维码完整入镜，系统会自动识别并跳转到结果页。</p>
                    <button className="btn btn--primary" onClick={startScanning}>开始扫码</button>
                  </div>
                ) : null}

                {cameraState === 'requesting' ? (
                  <div className="command-scanner__overlay-content">
                    <span className="command-scanner__glyph" aria-hidden="true"><CameraGlyph /></span>
                    <span className="command-progress-pill">正在请求摄像头权限</span>
                    <p className="command-scanner__description">请在浏览器权限弹窗中允许摄像头访问，允许后会自动进入识别状态。</p>
                    <p className="command-scanner__helper">建议使用 HTTPS 或 localhost 环境打开当前页面。</p>
                  </div>
                ) : null}

                {cameraState === 'error' ? (
                  <div className="command-scanner__overlay-content">
                    <span className="command-scanner__glyph" aria-hidden="true"><CameraGlyph /></span>
                    <p className="command-scanner__headline">摄像头不可用</p>
                    <p className="command-scanner__description command-scanner__description--danger">{cameraError}</p>
                    <button className="btn btn--ghost" onClick={startScanning}>重新尝试</button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {cameraState === 'scanning' ? (
            <CommandNotice tone="success">摄像头已启动，识别到二维码后会自动跳转到结果页。</CommandNotice>
          ) : null}
        </div>
      </CommandPanel>

      <CommandPanel title="手动输入" subtitle="粘贴二维码链接或 token，用于无摄像头、权限受限或远程协助场景。">
        <form onSubmit={handleManualSubmit} className="command-stack">
          <input
            className="input"
            placeholder="粘贴二维码链接或 token"
            value={manualToken}
            onChange={(event) => setManualToken(event.target.value)}
          />
          <div className="command-actions-row">
            <button className="btn btn--primary" type="submit">查询状态</button>
          </div>
        </form>
      </CommandPanel>
    </div>
  )
}

export default ScanHome

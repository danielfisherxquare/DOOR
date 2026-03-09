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
 * 检测摄像头可用性，返回具体的错误信息
 */
function detectCameraSupport() {
  if (!window.isSecureContext) {
    return '当前页面不是 HTTPS，浏览器禁止使用摄像头。请使用 https:// 开头的地址访问。'
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return '当前浏览器不支持摄像头访问，请更换浏览器（推荐 Chrome / Safari）。'
  }
  return null
}

function ScanHome() {
  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const scanningRef = useRef(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [manualToken, setManualToken] = useState(searchParams.get('t') || '')
  const [cameraError, setCameraError] = useState('')
  // idle → requesting → scanning → error
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
      readerRef.current?.reset()
    }
  }, [])

  const startScanning = useCallback(() => {
    // 先检测环境
    const envError = detectCameraSupport()
    if (envError) {
      setCameraState('error')
      setCameraError(envError)
      return
    }

    setCameraState('requesting')
    setCameraError('')

    // 显式请求摄像头权限
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        // 权限已获取，立即释放（@zxing 会自己再打开）
        stream.getTracks().forEach((t) => t.stop())

        setCameraState('scanning')

        const reader = new BrowserQRCodeReader()
        readerRef.current = reader

        reader.decodeFromVideoDevice(undefined, videoRef.current, (result, error) => {
          if (result && !scanningRef.current) {
            const token = extractToken(result.getText())
            if (!token) return
            scanningRef.current = true
            navigate(`/scan/result?t=${encodeURIComponent(token)}`)
          }
          // 忽略 NotFoundException（正常扫码中的"未找到"）
          if (error && error.name !== 'NotFoundException') {
            console.warn('扫码过程警告:', error.message)
          }
        }).catch((err) => {
          setCameraState('error')
          setCameraError('启动扫码器失败：' + (err.message || '未知错误'))
        })
      })
      .catch((err) => {
        setCameraState('error')
        if (err.name === 'NotAllowedError') {
          setCameraError('摄像头权限被拒绝。请点击浏览器地址栏的锁头图标，允许摄像头权限后重试。')
        } else if (err.name === 'NotFoundError') {
          setCameraError('未检测到摄像头设备。请确认设备带有摄像头。')
        } else if (err.name === 'NotReadableError') {
          setCameraError('摄像头被其它应用占用，请关闭其它使用摄像头的应用后重试。')
        } else {
          setCameraError('无法打开摄像头：' + (err.message || '未知错误'))
        }
      })
  }, [navigate])

  const handleManualSubmit = (event) => {
    event.preventDefault()
    const token = extractToken(manualToken)
    if (!token) return
    navigate(`/scan/result?t=${encodeURIComponent(token)}`)
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: 16, boxShadow: '0 20px 50px rgba(15, 23, 42, 0.08)' }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>扫码区</div>
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
          {cameraState === 'scanning' ? (
            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
          ) : (
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
                <div style={{ fontSize: 14 }}>正在请求摄像头权限，请在弹窗中允许...</div>
              )}
              {cameraState === 'error' && (
                <>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                  <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>{cameraError}</div>
                  <button
                    className="btn btn--ghost"
                    onClick={startScanning}
                    style={{ fontSize: 14 }}
                  >
                    重试
                  </button>
                </>
              )}
              {/* scanning 时隐藏的 video 占位 */}
              <video ref={videoRef} style={{ display: 'none' }} muted playsInline />
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
        <button className="btn btn--primary" type="submit">查询状态</button>
      </form>
    </div>
  )
}

export default ScanHome

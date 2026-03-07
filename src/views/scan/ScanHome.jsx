import { useEffect, useRef, useState } from 'react'
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

function ScanHome() {
  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const scanningRef = useRef(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [manualToken, setManualToken] = useState(searchParams.get('t') || '')
  const [cameraError, setCameraError] = useState('')

  useEffect(() => {
    const preset = searchParams.get('t')
    if (preset) {
      navigate(`/scan/result?t=${encodeURIComponent(preset)}`, { replace: true })
      return
    }

    const reader = new BrowserQRCodeReader()
    readerRef.current = reader
    let cancelled = false

    reader.decodeFromVideoDevice(undefined, videoRef.current, (result, error) => {
      if (cancelled) return
      if (result && !scanningRef.current) {
        const token = extractToken(result.getText())
        if (!token) return
        scanningRef.current = true
        navigate(`/scan/result?t=${encodeURIComponent(token)}`)
      }
      if (error && error.name === 'NotAllowedError') {
        setCameraError('摄像头权限被拒绝，请允许浏览器访问摄像头。')
      }
    }).catch(() => {
      setCameraError('无法打开摄像头，请检查浏览器权限或改用手动输入。')
    })

    return () => {
      cancelled = true
      readerRef.current?.reset()
    }
  }, [navigate, searchParams])

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
          justifyContent: 'center'
        }}>
          <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
        </div>
        {cameraError && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 12 }}>{cameraError}</div>}
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

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BrowserQRCodeReader } from '@zxing/browser'
import { appInventoryApi } from '../../services/inventoryApi'
import { showSuccess, showError, showWarning, showInfo } from '../../utils/toast'
import StatusPill from '../../components/inventory/StatusPill'

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
    return `无法打开摄像头：${msg || name || '未知错误'}`
}

function ScanPickup({ inventoryApi = appInventoryApi }) {
    const unitApi = inventoryApi.unit
    const [searchParams] = useSearchParams()
    const selectedOrgId = searchParams.get('orgId')
    const videoRef = useRef(null)
    const readerRef = useRef(null)
    const controlsRef = useRef(null)
    const scanningRef = useRef(false)
    const lastDetectedRef = useRef({ token: '', at: 0 })

    const [manualToken, setManualToken] = useState('')
    const [cameraError, setCameraError] = useState('')
    const [cameraState, setCameraState] = useState('idle')
    const [scanResult, setScanResult] = useState(null)
    const [pickupLoading, setPickupLoading] = useState(false)
    const [runnerId, setRunnerId] = useState(searchParams.get('runnerId') || '')

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

    const handleDetectedToken = useCallback(async (token) => {
        if (!token) return

        const now = Date.now()
        const lastDetected = lastDetectedRef.current
        if (lastDetected.token === token && now - lastDetected.at < 2000) {
            return
        }

        lastDetectedRef.current = { token, at: now }
        scanningRef.current = true
        controlsRef.current?.stop()

        try {
            const result = await unitApi.getUnitByQR(token, selectedOrgId)
            setScanResult(result.data)
            setCameraState('idle')
            showSuccess('扫码成功，已获取物资信息')
        } catch (err) {
            setScanResult({ error: err.message })
            setCameraState('idle')
            showError('未找到该物资')
        }
    }, [selectedOrgId])

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
            console.error('[ScanPickup] 摄像头启动失败:', err)
            setCameraState('error')
            setCameraError(getCameraErrorMessage(err))
        }
    }, [handleDetectedToken])

    const handleManualSubmit = async (event) => {
        event.preventDefault()
        const qrCode = extractToken(manualToken)
        if (!qrCode) return

        try {
            const result = await unitApi.getUnitByQR(qrCode, selectedOrgId)
            setScanResult(result.data)
            showSuccess('查询成功')
        } catch (err) {
            setScanResult({ error: err.message })
            showError('查询失败: ' + err.message)
        }
    }

    const handlePickup = async () => {
        if (!scanResult || scanResult.error) return

        const normalizedRunnerId = String(runnerId || '').trim()
        if (!normalizedRunnerId) {
            showWarning('请先填写真实领取人 ID')
            return
        }

        setPickupLoading(true)
        try {
            const result = await unitApi.scanUnit({
                qrCode: scanResult.qr_code,
                action: 'pickup',
                raceId: scanResult.current_holder_id,
                runnerId: normalizedRunnerId,
            }, selectedOrgId)

            if (result.success) {
                setScanResult({
                    ...scanResult,
                    status: 'picked',
                    pickup_success: true,
                    current_holder_type: 'runner',
                    current_holder_id: normalizedRunnerId,
                })
                showSuccess('领取成功！')
            }
        } catch (err) {
            showError('领取失败: ' + err.message)
        } finally {
            setPickupLoading(false)
        }
    }

    const isVideoVisible = cameraState === 'scanning'

    return (
        <div className="warehouse-nested-page sp-page">
            <header className="sp-header">
                <div>
                    <h1 className="page-title">扫码领取</h1>
                    <p className="page-subtitle">扫描二维码领取物资</p>
                </div>
            </header>

            <div className="sp-layout">
                <section className="sp-scan-section">
                    <div className="sp-scan-header">
                        <h3 className="sp-scan-title">扫码区</h3>
                        {cameraState === 'scanning' && (
                            <button className="btn btn--ghost btn--sm" onClick={stopScanning}>
                                停止扫码
                            </button>
                        )}
                    </div>

                    <div className="sp-camera-container">
                        <video
                            ref={videoRef}
                            className={`sp-video ${isVideoVisible ? 'sp-video--visible' : ''}`}
                            muted
                            playsInline
                            autoPlay
                        />

                        {isVideoVisible && (
                            <div className="sp-scan-overlay">
                                <div className="sp-scan-frame">
                                    <div className="sp-scan-line" />
                                </div>
                            </div>
                        )}

                        {!isVideoVisible && (
                            <div className="sp-camera-placeholder">
                                {cameraState === 'idle' && (
                                    <>
                                        <div className="sp-camera-icon">
                                            <Icon name="camera" size={48} />
                                        </div>
                                        <p className="sp-camera-text">点击下方按钮开始扫码</p>
                                        <button className="btn btn--primary btn--large" onClick={startScanning}>
                                            开始扫码
                                        </button>
                                    </>
                                )}
                                {cameraState === 'requesting' && (
                                    <>
                                        <div className="sp-camera-icon sp-camera-icon--pulse">
                                            <Icon name="camera" size={36} />
                                        </div>
                                        <p className="sp-camera-text">正在请求摄像头权限...</p>
                                    </>
                                )}
                                {cameraState === 'error' && (
                                    <>
                                        <div className="sp-camera-icon sp-camera-icon--error">
                                            <Icon name="alert" size={48} />
                                        </div>
                                        <p className="sp-camera-text sp-camera-text--error">{cameraError}</p>
                                        <button className="btn btn--ghost" onClick={startScanning}>
                                            重试
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="sp-divider">
                        <span>或使用手动输入</span>
                    </div>

                    <form onSubmit={handleManualSubmit} className="sp-manual-form">
                        <input
                            className="input"
                            placeholder="粘贴二维码链接或 token"
                            value={manualToken}
                            onChange={(event) => setManualToken(event.target.value)}
                        />
                        <button className="btn btn--secondary" type="submit">
                            查询物资
                        </button>
                    </form>
                </section>

                <section className="sp-result-section">
                    <h3 className="sp-result-title">物资信息</h3>

                    {!scanResult ? (
                        <div className="sp-result-empty">
                            <Icon name="package" size={48} />
                            <p>扫描或输入二维码后显示物资信息</p>
                        </div>
                    ) : scanResult.error ? (
                        <div className="sp-result-error">
                            <Icon name="alert" size={24} />
                            <p>{scanResult.error}</p>
                        </div>
                    ) : (
                        <div className="sp-result-card">
                            <div className="sp-result-item sp-result-item--stack">
                                <span className="sp-result-label">领取人 ID</span>
                                <div className="sp-runner-field">
                                    <input
                                        className="input"
                                        placeholder="请输入真实领取人/选手 ID"
                                        value={runnerId}
                                        onChange={(event) => setRunnerId(event.target.value)}
                                    />
                                    <span className="sp-runner-hint">领取时会把这个 ID 写入持有人和流转记录</span>
                                </div>
                            </div>
                            <div className="sp-result-item">
                                <span className="sp-result-label">二维码</span>
                                <span className="sp-result-value sp-result-value--mono">{scanResult.qr_code}</span>
                            </div>
                            <div className="sp-result-item">
                                <span className="sp-result-label">物资类型</span>
                                <span className="sp-result-value">{scanResult.item_type}</span>
                            </div>
                            <div className="sp-result-item">
                                <span className="sp-result-label">规格</span>
                                <span className="sp-result-value">{formatSpec(scanResult.item_spec)}</span>
                            </div>
                            <div className="sp-result-item">
                                <span className="sp-result-label">状态</span>
                                <StatusPill status={scanResult.status} />
                            </div>

                            <div className="sp-result-action">
                                {scanResult.pickup_success ? (
                                    <div className="sp-success-message">
                                        <Icon name="check" size={20} />
                                        领取成功！
                                    </div>
                                ) : scanResult.status === 'allocated' ? (
                                    <button
                                        className="btn btn--primary btn--large sp-pickup-btn"
                                        onClick={handlePickup}
                                        disabled={pickupLoading}
                                    >
                                        {pickupLoading ? '领取中...' : '确认领取'}
                                    </button>
                                ) : scanResult.status === 'in_stock' ? (
                                    <div className="sp-warning-message">
                                        <Icon name="info" size={16} />
                                        物资尚未分配，无法领取
                                    </div>
                                ) : scanResult.status === 'picked' ? (
                                    <div className="sp-info-message">
                                        <Icon name="info" size={16} />
                                        物资已被领取
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    )}
                </section>
            </div>

            <style>{`
                .sp-header {
                    margin-bottom: var(--spacing-xl);
                }
                .sp-layout {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: var(--spacing-xl);
                }
                .sp-scan-section, .sp-result-section {
                    background: var(--surface);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-lg);
                    box-shadow: var(--shadow-sm);
                    border: 1px solid var(--border);
                }
                .sp-scan-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--spacing-md);
                }
                .sp-scan-title, .sp-result-title {
                    margin: 0;
                    font-size: var(--font-size-lg);
                }
                .sp-camera-container {
                    position: relative;
                    border-radius: var(--radius-lg);
                    overflow: hidden;
                    background: #0F172A;
                    aspect-ratio: 3 / 4;
                }
                .sp-video {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    display: none;
                }
                .sp-video--visible {
                    display: block;
                }
                .sp-scan-overlay {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    pointer-events: none;
                }
                .sp-scan-frame {
                    width: 200px;
                    height: 200px;
                    border: 2px solid rgba(255, 255, 255, 0.5);
                    border-radius: var(--radius-md);
                    position: relative;
                }
                .sp-scan-line {
                    position: absolute;
                    left: 10px;
                    right: 10px;
                    height: 2px;
                    background: var(--accent);
                    animation: scanLine 2s ease-in-out infinite;
                }
                @keyframes scanLine {
                    0%, 100% { top: 10px; }
                    50% { top: calc(100% - 12px); }
                }
                .sp-camera-placeholder {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    color: #94A3B8;
                    padding: var(--spacing-lg);
                    text-align: center;
                }
                .sp-camera-icon {
                    color: #64748B;
                    margin-bottom: var(--spacing-md);
                }
                .sp-camera-icon--pulse {
                    animation: pulse 1.5s infinite;
                }
                .sp-camera-icon--error {
                    color: #FCA5A5;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                .sp-camera-text {
                    font-size: var(--font-size-sm);
                    margin-bottom: var(--spacing-md);
                }
                .sp-camera-text--error {
                    color: #FCA5A5;
                    line-height: 1.6;
                }
                .sp-divider {
                    text-align: center;
                    margin: var(--spacing-lg) 0;
                    position: relative;
                }
                .sp-divider::before {
                    content: '';
                    position: absolute;
                    left: 0;
                    right: 0;
                    top: 50%;
                    height: 1px;
                    background: var(--border);
                }
                .sp-divider span {
                    background: var(--surface);
                    padding: 0 var(--spacing-md);
                    position: relative;
                    color: var(--text-muted);
                    font-size: var(--font-size-sm);
                }
                .sp-manual-form {
                    display: flex;
                    gap: var(--spacing-sm);
                }
                .sp-manual-form .input {
                    flex: 1;
                }
                .sp-result-empty, .sp-result-error {
                    text-align: center;
                    padding: var(--spacing-2xl);
                    color: var(--text-secondary);
                }
                .sp-result-error {
                    color: var(--danger);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--spacing-sm);
                }
                .sp-result-card {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }
                .sp-result-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-bottom: var(--spacing-md);
                    border-bottom: 1px solid var(--border);
                    gap: var(--spacing-md);
                }
                .sp-result-item--stack {
                    align-items: flex-start;
                }
                .sp-result-item:last-of-type {
                    border-bottom: none;
                }
                .sp-result-label {
                    font-size: var(--font-size-sm);
                    color: var(--text-secondary);
                    flex-shrink: 0;
                }
                .sp-result-value {
                    font-weight: 500;
                }
                .sp-result-value--mono {
                    font-family: 'SF Mono', Monaco, monospace;
                    font-size: var(--font-size-xs);
                }
                .sp-runner-field {
                    flex: 1;
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-xs);
                }
                .sp-runner-hint {
                    font-size: var(--font-size-xs);
                    color: var(--text-muted);
                    line-height: 1.5;
                }
                .sp-result-action {
                    margin-top: var(--spacing-md);
                    padding-top: var(--spacing-md);
                    border-top: 1px solid var(--border);
                }
                .sp-pickup-btn {
                    width: 100%;
                }
                .sp-success-message {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--spacing-sm);
                    background: rgba(16, 185, 129, 0.1);
                    color: var(--success);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                    font-weight: 600;
                }
                .sp-warning-message, .sp-info-message {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                    font-size: var(--font-size-sm);
                }
                .sp-warning-message {
                    background: rgba(245, 158, 11, 0.1);
                    color: var(--warning);
                }
                .sp-info-message {
                    background: var(--bg-secondary);
                    color: var(--text-secondary);
                }
                @media (max-width: 768px) {
                    .sp-layout {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </div>
    )
}

function Icon({ name, size = 20 }) {
    const icons = {
        camera: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
                <circle cx="12" cy="13" r="3"/>
            </svg>
        ),
        alert: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
        ),
        package: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
                <path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>
            </svg>
        ),
        check: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
        ),
        info: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
            </svg>
        ),
    }
    return icons[name] || null
}

function formatSpec(spec) {
    if (!spec) return '-'
    try {
        const obj = typeof spec === 'string' ? JSON.parse(spec) : spec
        return Object.entries(obj).map(([k, v]) => v).join(' / ') || '-'
    } catch {
        return String(spec)
    }
}

export default ScanPickup

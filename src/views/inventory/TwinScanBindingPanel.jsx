import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { appInventoryApi } from '../../services/inventoryApi'
import { showError, showSuccess } from '../../utils/toast'
import { buildInventorySurfaceHref, useInventorySurface } from './useInventorySurface'

const emptyObject = { objectCode: '', objectLevel: 'unit', shapeType: 'box', shapeTemplateId: '', widthMm: 600, depthMm: 400, heightMm: 400, weightKg: 5 }

function extractScanText(rawText) {
    const text = String(rawText || '').trim()
    if (!text) return ''
    try {
        const url = new URL(text)
        return url.searchParams.get('t') || text
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
        return '摄像头权限被拒绝。请允许摄像头权限后刷新页面重试。'
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return '未检测到摄像头设备。请确认当前设备带有可用摄像头。'
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
        return '摄像头被其它应用占用或无法读取，请关闭其它占用摄像头的应用后重试。'
    }
    if (name === 'SecurityError') {
        return '浏览器安全策略阻止了摄像头访问。请确保使用 HTTPS 并允许摄像头权限。'
    }
    return `无法打开摄像头：${msg || name || '未知错误'}`
}

function readValue(record, ...keys) {
    for (const key of keys) {
        if (record?.[key] !== undefined && record?.[key] !== null) return record[key]
    }
    return null
}

function formatDateTime(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return date.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function nextPath(surface, tab, searchParams, warehouseId) {
    const params = new URLSearchParams(searchParams)
    params.set('tab', tab)
    if (warehouseId) params.set('warehouseId', warehouseId)
    return buildInventorySurfaceHref(surface, '/inventory/space', { params: Object.fromEntries(params.entries()) })
}

function nextViewerPath(surface, searchParams, warehouseId, locationId, objectQr) {
    const params = new URLSearchParams(searchParams)
    params.set('tab', 'viewer')
    if (warehouseId) params.set('warehouseId', warehouseId)
    if (locationId) params.set('locationId', String(locationId))
    if (objectQr) params.set('objectQr', objectQr)
    params.set('fromBinding', '1')
    return buildInventorySurfaceHref(surface, '/inventory/space', { params: Object.fromEntries(params.entries()) })
}

export default function TwinScanBindingPanel({ mode = 'space', inventoryApi = appInventoryApi }) {
    const twinApi = inventoryApi.twin
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const selectedOrgId = searchParams.get('orgId')
    const selectedWarehouseId = searchParams.get('warehouseId') || ''
    const selectedBatchId = searchParams.get('batchId') || ''
    const { surface } = useInventorySurface()
    const videoRef = useRef(null)
    const readerRef = useRef(null)
    const controlsRef = useRef(null)
    const scannerLockRef = useRef(false)
    const lastScannedRef = useRef({ value: '', at: 0 })

    const [warehouses, setWarehouses] = useState([])
    const [itemShapes, setItemShapes] = useState([])
    const [objects, setObjects] = useState([])
    const [locations, setLocations] = useState([])
    const [events, setEvents] = useState([])
    const [objectDraft, setObjectDraft] = useState(emptyObject)
    const [bindingForm, setBindingForm] = useState({ objectQr: '', locationQr: '', reason: '' })
    const [submitting, setSubmitting] = useState(false)
    const [scannerTarget, setScannerTarget] = useState('locationQr')
    const [cameraState, setCameraState] = useState('idle')
    const [cameraError, setCameraError] = useState('')

    const selectedShape = useMemo(
        () => itemShapes.find((item) => String(item.id) === String(objectDraft.shapeTemplateId)) || null,
        [itemShapes, objectDraft.shapeTemplateId]
    )
    const pendingObjects = useMemo(
        () => objects.filter((item) => !readValue(item, 'current_location_id', 'currentLocationId')),
        [objects]
    )
    const recommendedLocations = useMemo(() => {
        return locations
            .filter((item) => {
                const status = String(readValue(item, 'status') || '').toLowerCase()
                const usedCapacity = Number(readValue(item, 'used_capacity', 'usedCapacity') || 0)
                const capacity = Number(readValue(item, 'capacity') || 0)
                return status !== 'locked' && status !== 'reserved' && usedCapacity < capacity
            })
            .sort((left, right) => {
                const leftUsed = Number(readValue(left, 'used_capacity', 'usedCapacity') || 0)
                const rightUsed = Number(readValue(right, 'used_capacity', 'usedCapacity') || 0)
                return leftUsed - rightUsed || String(readValue(left, 'code') || '').localeCompare(String(readValue(right, 'code') || ''))
            })
    }, [locations])
    const isVideoVisible = cameraState === 'scanning'

    const loadBootstrap = useCallback(async () => {
        try {
            const [warehouseRes, shapeRes] = await Promise.all([
                twinApi.getWarehouses(selectedOrgId),
                twinApi.getItemShapes(selectedOrgId),
            ])
            const nextWarehouses = warehouseRes.data || []
            setWarehouses(nextWarehouses)
            setItemShapes(shapeRes.data || [])
            if (!selectedWarehouseId && nextWarehouses.length > 0) {
                const params = new URLSearchParams(searchParams)
                params.set('warehouseId', String(nextWarehouses[0].id))
                setSearchParams(params, { replace: true })
            }
        } catch (err) {
            showError(`加载绑定基础数据失败：${err.message}`)
        }
    }, [searchParams, selectedOrgId, selectedWarehouseId, setSearchParams, twinApi])

    const loadContext = useCallback(async (warehouseId) => {
        if (!warehouseId) {
            setObjects([])
            setLocations([])
            setEvents([])
            return
        }
        try {
            const [objectRes, locationRes, eventRes] = await Promise.all([
                twinApi.getObjects({ warehouseId, batchId: selectedBatchId || undefined }, selectedOrgId),
                twinApi.getLocations({ warehouseId }, selectedOrgId),
                twinApi.getEvents({ warehouseId, limit: 20 }, selectedOrgId),
            ])
            setObjects(objectRes.data || [])
            setLocations(locationRes.data || [])
            setEvents(eventRes.data || [])
        } catch (err) {
            showError(`加载仓库上下文失败：${err.message}`)
        }
    }, [selectedBatchId, selectedOrgId, twinApi])

    useEffect(() => {
        loadBootstrap()
    }, [loadBootstrap])

    useEffect(() => {
        loadContext(selectedWarehouseId)
    }, [loadContext, selectedWarehouseId])

    useEffect(() => {
        const locationQr = searchParams.get('locationQr') || ''
        const objectQr = searchParams.get('objectQr') || ''
        if (!locationQr && !objectQr) return
        setBindingForm((value) => ({
            ...value,
            objectQr: objectQr || value.objectQr,
            locationQr: locationQr || value.locationQr,
        }))
    }, [searchParams])

    useEffect(() => {
        return () => {
            controlsRef.current?.stop()
            controlsRef.current = null
            readerRef.current = null
            scannerLockRef.current = false
        }
    }, [])

    useEffect(() => {
        if (!pendingObjects.length) return
        setBindingForm((value) => {
            if (value.objectQr) {
                const exists = pendingObjects.some((item) => (readValue(item, 'object_code', 'objectCode') || '') === value.objectQr)
                if (exists) return value
            }
            return {
                ...value,
                objectQr: readValue(pendingObjects[0], 'object_code', 'objectCode') || value.objectQr,
            }
        })
    }, [pendingObjects])

    useEffect(() => {
        if (!recommendedLocations.length) return
        setBindingForm((value) => {
            if (value.locationQr) {
                const exists = recommendedLocations.some((item) => (readValue(item, 'qr_code', 'qrCode') || '') === value.locationQr)
                if (exists) return value
            }
            return {
                ...value,
                locationQr: readValue(recommendedLocations[0], 'qr_code', 'qrCode') || value.locationQr,
            }
        })
    }, [recommendedLocations])

    const stopScanning = useCallback(() => {
        controlsRef.current?.stop()
        controlsRef.current = null
        readerRef.current = null
        scannerLockRef.current = false
        setCameraState('idle')
        setCameraError('')
    }, [])

    useEffect(() => {
        stopScanning()
    }, [selectedWarehouseId, stopScanning])

    const applyScannedValue = useCallback((field, rawValue) => {
        const value = extractScanText(rawValue)
        if (!value) return

        const now = Date.now()
        const lastScanned = lastScannedRef.current
        if (lastScanned.value === `${field}:${value}` && now - lastScanned.at < 1200) {
            return
        }
        lastScannedRef.current = { value: `${field}:${value}`, at: now }

        setBindingForm((current) => ({ ...current, [field]: value }))
        showSuccess(field === 'objectQr' ? '已识别货物二维码' : '已识别库位二维码')
    }, [])

    const startScanning = useCallback(async (field = scannerTarget) => {
        const envError = detectCameraSupport()
        if (envError) {
            setCameraState('error')
            setCameraError(envError)
            return
        }

        controlsRef.current?.stop()
        controlsRef.current = null
        readerRef.current = null
        scannerLockRef.current = false
        setScannerTarget(field)
        setCameraState('requesting')
        setCameraError('')

        try {
            const { BrowserQRCodeReader } = await import('@zxing/browser')
            const reader = new BrowserQRCodeReader()
            readerRef.current = reader

            const controls = await reader.decodeFromVideoDevice(
                undefined,
                videoRef.current,
                (result) => {
                    if (!result || scannerLockRef.current) return
                    scannerLockRef.current = true
                    const text = result.getText?.() || ''
                    applyScannedValue(field, text)
                    stopScanning()
                }
            )

            controlsRef.current = controls
            setCameraState('scanning')
        } catch (err) {
            console.error('[TwinScanBindingPanel] 摄像头启动失败:', err)
            setCameraState('error')
            setCameraError(getCameraErrorMessage(err))
        }
    }, [applyScannedValue, scannerTarget, stopScanning])

    async function createObject() {
        if (!selectedWarehouseId) return showError('请先选择仓库')
        if (!objectDraft.objectCode) return showError('请先填写货物二维码')
        const shapeDimensions = readValue(selectedShape, 'dimensions_mm', 'dimensionsMm') || {}
        const shapeType = readValue(selectedShape, 'shape_type', 'shapeType') || objectDraft.shapeType
        try {
            await twinApi.createObject({
                objectCode: objectDraft.objectCode,
                objectLevel: objectDraft.objectLevel,
                batchId: selectedBatchId ? Number(selectedBatchId) : undefined,
                shapeType,
                shapeTemplateId: objectDraft.shapeTemplateId ? Number(objectDraft.shapeTemplateId) : undefined,
                dimensionsMm: {
                    widthMm: Number(readValue(shapeDimensions, 'widthMm', 'width_mm') || objectDraft.widthMm || 0),
                    depthMm: Number(readValue(shapeDimensions, 'depthMm', 'depth_mm') || objectDraft.depthMm || 0),
                    heightMm: Number(readValue(shapeDimensions, 'heightMm', 'height_mm') || objectDraft.heightMm || 0),
                },
                weightKg: Number(readValue(selectedShape, 'default_weight_kg', 'defaultWeightKg') || objectDraft.weightKg || 0),
                currentWarehouseId: Number(selectedWarehouseId),
                stackable: true,
            }, selectedOrgId)
            setObjectDraft(emptyObject)
            showSuccess('货物对象已创建，二维码已自动注册')
            await loadContext(selectedWarehouseId)
        } catch (err) {
            showError(`创建货物对象失败：${err.message}`)
        }
    }

    async function runAction(mode) {
        if (!bindingForm.objectQr) return showError('请先输入货物二维码')
        if (mode !== 'unbind' && !bindingForm.locationQr) return showError('请先输入库位二维码')
        try {
            setSubmitting(true)
            let result
            if (mode === 'scan') {
                result = await twinApi.scanBind({ objectQr: bindingForm.objectQr, locationQr: bindingForm.locationQr }, selectedOrgId)
                showSuccess('扫码绑定成功')
            } else if (mode === 'move') {
                result = await twinApi.moveBinding({ objectQr: bindingForm.objectQr, locationQr: bindingForm.locationQr }, selectedOrgId)
                showSuccess('移位成功')
            } else {
                result = await twinApi.unbindBinding({ objectQr: bindingForm.objectQr, reason: bindingForm.reason || 'manual_unbind' }, selectedOrgId)
                showSuccess('解绑成功')
            }
            await loadContext(selectedWarehouseId)
            if (mode !== 'unbind') {
                const locationId = readValue(result?.data?.location, 'id')
                const warehouseId = readValue(result?.data?.location, 'warehouse_id', 'warehouseId') || selectedWarehouseId
                navigate(nextViewerPath(surface, searchParams, warehouseId, locationId, bindingForm.objectQr))
                return
            }
        } catch (err) {
            showError(`${mode === 'scan' ? '绑定' : mode === 'move' ? '移位' : '解绑'}失败：${err.message}`)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="warehouse-nested-page twin-page">
            <header className="twin-head">
                <div>
                    <div className="twin-eye">Phase 1 Binding Console</div>
                    <h1 className="page-title">库位绑定作业</h1>
                    <p className="page-subtitle">先支持 Web 后台的“登记对象 + 扫码绑定/移位/解绑”闭环，后续再平滑迁到 PDA。</p>
                </div>
                <div className="twin-actions">
                    {mode !== 'ops' && (
                        <>
                            <button className="btn btn--ghost" onClick={() => navigate(nextPath(surface, 'designer', searchParams, selectedWarehouseId))}>回到 3D 设计</button>
                            <button className="btn btn--primary" onClick={() => navigate(nextViewerPath(surface, searchParams, selectedWarehouseId))}>查看 3D 场景</button>
                        </>
                    )}
                </div>
            </header>

            <section className="twin-bar">
                <label className="twin-field">
                    <span>作业仓库</span>
                    <select className="input" value={selectedWarehouseId} onChange={(event) => {
                        const params = new URLSearchParams(searchParams)
                        if (event.target.value) params.set('warehouseId', event.target.value)
                        else params.delete('warehouseId')
                        setSearchParams(params)
                    }}>
                        <option value="">请选择仓库</option>
                        {warehouses.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}
                    </select>
                </label>
                <div className="twin-kpis">
                    <span>{objects.length} 个货物对象</span>
                    <span>{pendingObjects.length} 个待绑定</span>
                    <span>{locations.length} 个库位</span>
                    <span>{events.length} 条事件</span>
                </div>
            </section>

            {selectedBatchId && (
                <section className="twin-focus-banner">
                    <div>
                        <div className="twin-focus-banner__eyebrow">Inbound Focus</div>
                        <strong>当前正在处理批次 #{selectedBatchId} 的新入库对象。</strong>
                        <p>页面已经自动聚焦本批次、默认选中首个待绑定货物，并优先推荐可用空库位。</p>
                    </div>
                    <div className="twin-focus-banner__meta">
                        <span>待绑定 {pendingObjects.length}</span>
                        <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => {
                                const params = new URLSearchParams(searchParams)
                                params.delete('batchId')
                                setSearchParams(params)
                            }}
                        >
                            查看全部对象
                        </button>
                    </div>
                </section>
            )}

            {!selectedWarehouseId && <div className="twin-empty">先选择一个仓库再开始绑定。</div>}

            {selectedWarehouseId && (
                <div className="twin-two">
                    <section className="twin-panel">
                        <h3>货物对象登记</h3>
                        <div className="twin-grid">
                            <Field label="货物二维码"><input className="input" value={objectDraft.objectCode} onChange={(e) => setObjectDraft({ ...objectDraft, objectCode: e.target.value })} /></Field>
                            <Field label="对象层级"><select className="input" value={objectDraft.objectLevel} onChange={(e) => setObjectDraft({ ...objectDraft, objectLevel: e.target.value })}><option value="unit">unit</option><option value="box">box</option><option value="pallet">pallet</option><option value="batch">batch</option></select></Field>
                            <Field label="形状模板"><select className="input" value={objectDraft.shapeTemplateId} onChange={(e) => setObjectDraft({ ...objectDraft, shapeTemplateId: e.target.value })}><option value="">手工填写</option>{itemShapes.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</select></Field>
                            <Field label="形状类型"><select className="input" value={objectDraft.shapeType} onChange={(e) => setObjectDraft({ ...objectDraft, shapeType: e.target.value })}><option value="box">box</option><option value="bin">bin</option><option value="drum">drum</option><option value="custom_bbox">custom_bbox</option></select></Field>
                        </div>
                        <div className="twin-actions"><button className="btn btn--secondary" onClick={createObject}>登记货物对象</button></div>
                        {pendingObjects.length > 0 && (
                            <div className="twin-section-note">
                                已优先列出当前仓库里未绑定库位的对象，点击即可带入扫码表单。
                            </div>
                        )}
                        <div className="twin-chips">
                            {(pendingObjects.length ? pendingObjects : objects).slice(0, 12).map((item) => (
                                <button key={item.id} type="button" className="twin-chip twin-chip--button" onClick={() => setBindingForm((value) => ({ ...value, objectQr: readValue(item, 'object_code', 'objectCode') || '' }))}>
                                    {readValue(item, 'object_code', 'objectCode')}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="twin-panel">
                        <h3>扫码绑定 / 移位 / 解绑</h3>
                        <div className="twin-scan-shell">
                            <div className="twin-scan-head">
                                <div>
                                    <div className="twin-scan-eyebrow">Camera Scan</div>
                                    <strong>浏览器摄像头扫码</strong>
                                    <p>先选择扫描目标，再用摄像头识别二维码。识别成功后只会回填表单，不会自动提交绑定。</p>
                                </div>
                                <div className="twin-actions">
                                    <button
                                        type="button"
                                        className={`btn ${scannerTarget === 'objectQr' ? 'btn--primary' : 'btn--ghost'}`}
                                        onClick={() => setScannerTarget('objectQr')}
                                    >
                                        扫货物码
                                    </button>
                                    <button
                                        type="button"
                                        className={`btn ${scannerTarget === 'locationQr' ? 'btn--primary' : 'btn--ghost'}`}
                                        onClick={() => setScannerTarget('locationQr')}
                                    >
                                        扫库位码
                                    </button>
                                </div>
                            </div>

                            <div className="twin-scan-stage">
                                <video
                                    ref={videoRef}
                                    className={`twin-scan-video ${isVideoVisible ? 'is-visible' : ''}`}
                                    muted
                                    playsInline
                                    autoPlay
                                />
                                {!isVideoVisible && (
                                    <div className="twin-scan-placeholder">
                                        {cameraState === 'idle' && (
                                            <>
                                                <div className="twin-scan-icon">⌁</div>
                                                <strong>准备扫描{scannerTarget === 'objectQr' ? '货物码' : '库位码'}</strong>
                                                <p>适合在没有扫码枪时直接用浏览器摄像头作业。</p>
                                                <button type="button" className="btn btn--primary" onClick={() => startScanning(scannerTarget)}>启动摄像头</button>
                                            </>
                                        )}
                                        {cameraState === 'requesting' && (
                                            <>
                                                <div className="twin-scan-icon twin-scan-icon--pulse">⌁</div>
                                                <strong>正在请求摄像头权限</strong>
                                                <p>请在浏览器弹窗中允许摄像头访问。</p>
                                            </>
                                        )}
                                        {cameraState === 'error' && (
                                            <>
                                                <div className="twin-scan-icon twin-scan-icon--error">!</div>
                                                <strong>摄像头启动失败</strong>
                                                <p>{cameraError}</p>
                                                <button type="button" className="btn btn--ghost" onClick={() => startScanning(scannerTarget)}>重试</button>
                                            </>
                                        )}
                                    </div>
                                )}
                                {isVideoVisible && (
                                    <div className="twin-scan-overlay">
                                        <div className="twin-scan-frame">
                                            <div className="twin-scan-line" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="twin-actions">
                                {!isVideoVisible && <button type="button" className="btn btn--secondary" onClick={() => startScanning(scannerTarget)}>开始扫码</button>}
                                {isVideoVisible && <button type="button" className="btn btn--ghost" onClick={stopScanning}>停止扫码</button>}
                                <span className="twin-scan-hint">当前目标：{scannerTarget === 'objectQr' ? '货物二维码' : '库位二维码'}</span>
                            </div>
                        </div>

                        <div className="twin-grid twin-grid--one">
                            <Field label="货物二维码">
                                <div className="twin-inline-field">
                                    <input className="input" value={bindingForm.objectQr} onChange={(e) => setBindingForm({ ...bindingForm, objectQr: e.target.value })} />
                                    <button type="button" className="btn btn--ghost" onClick={() => startScanning('objectQr')}>摄像头扫描</button>
                                </div>
                            </Field>
                            <Field label="库位二维码">
                                <div className="twin-inline-field">
                                    <input className="input" value={bindingForm.locationQr} onChange={(e) => setBindingForm({ ...bindingForm, locationQr: e.target.value })} />
                                    <button type="button" className="btn btn--ghost" onClick={() => startScanning('locationQr')}>摄像头扫描</button>
                                </div>
                            </Field>
                            <Field label="解绑原因"><input className="input" value={bindingForm.reason} onChange={(e) => setBindingForm({ ...bindingForm, reason: e.target.value })} placeholder="可选" /></Field>
                        </div>
                        <div className="twin-actions">
                            <button className="btn btn--primary" disabled={submitting} onClick={() => runAction('scan')}>扫码绑定</button>
                            <button className="btn btn--secondary" disabled={submitting} onClick={() => runAction('move')}>移位</button>
                            <button className="btn btn--ghost" disabled={submitting} onClick={() => runAction('unbind')}>解绑</button>
                        </div>

                        {recommendedLocations.length > 0 && (
                            <div className="twin-section-note">
                                已按“非锁定、未满、低占用优先”推荐库位，点击即可带入库位二维码。
                            </div>
                        )}
                        <div className="twin-chips">
                            {(recommendedLocations.length ? recommendedLocations : locations).slice(0, 12).map((item) => (
                                <button key={item.id} type="button" className="twin-chip twin-chip--button twin-chip--muted" onClick={() => setBindingForm((value) => ({ ...value, locationQr: readValue(item, 'qr_code', 'qrCode') || '' }))}>
                                    {readValue(item, 'code')} · {readValue(item, 'qr_code', 'qrCode')}
                                </button>
                            ))}
                        </div>

                        <div className="twin-events">
                            {events.map((event) => (
                                <article key={event.id} className="twin-event">
                                    <div>
                                        <strong>{readValue(event, 'event_type', 'eventType')}</strong>
                                        <div className="twin-muted">object #{readValue(event, 'object_id', 'objectId') || '-'} · location #{readValue(event, 'location_id', 'locationId') || '-'}</div>
                                    </div>
                                    <time>{formatDateTime(readValue(event, 'created_at', 'createdAt'))}</time>
                                </article>
                            ))}
                        </div>
                    </section>
                </div>
            )}

            <style>{`
                .twin-head,.twin-bar,.twin-actions,.twin-chips,.twin-kpis{display:flex;gap:10px;flex-wrap:wrap}
                .twin-head{justify-content:space-between;align-items:flex-start;margin-bottom:24px}
                .twin-eye{display:inline-flex;padding:4px 10px;border-radius:var(--radius-sm);background:var(--accent-soft);color:var(--accent);font-size:12px;font-weight:700;margin-bottom:10px}
                .twin-bar{align-items:end;justify-content:space-between;margin-bottom:20px}
                .twin-focus-banner{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:20px;padding:18px 20px;border-radius:var(--radius-lg);background:linear-gradient(135deg,var(--panel-strong),color-mix(in srgb,var(--accent) 36%,var(--panel) 64%));color:rgba(255,255,255,.92)}
                .twin-focus-banner__eyebrow{display:inline-flex;padding:4px 10px;border-radius:var(--radius-sm);background:color-mix(in srgb,var(--accent-soft) 50%,transparent);color:var(--text-on-dark);font-size:12px;font-weight:700;margin-bottom:8px}
                .twin-focus-banner p{margin:6px 0 0;color:rgba(255,255,255,.68);font-size:13px}
                .twin-focus-banner__meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
                .twin-focus-banner__meta span{display:inline-flex;padding:8px 12px;border-radius:var(--radius-sm);background:rgba(255,255,255,.1);font-size:12px;font-weight:700}
                .twin-kpis span{display:inline-flex;padding:8px 12px;border-radius:var(--radius-sm);background:var(--bg-secondary);font-size:12px;font-weight:600;color:var(--text-secondary)}
                .twin-field,.twin-fieldbox{display:flex;flex-direction:column;gap:6px}
                .twin-field span,.twin-fieldbox label{font-size:12px;color:var(--text-secondary);font-weight:600}
                .twin-field{min-width:260px}
                .twin-two{display:grid;grid-template-columns:1fr .95fr;gap:20px}
                .twin-panel{background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 97%,transparent),var(--surface));border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px;box-shadow:var(--shadow-sm)}
                .twin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
                .twin-grid--one{grid-template-columns:1fr}
                .twin-inline-field{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}
                .twin-scan-shell{display:flex;flex-direction:column;gap:14px;margin-bottom:18px;padding:18px;border-radius:var(--radius-lg);background:linear-gradient(180deg,var(--bg-primary),var(--bg-secondary));border:1px solid var(--border)}
                .twin-scan-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
                .twin-scan-head p{margin:6px 0 0;color:var(--text-secondary);font-size:13px;line-height:1.6}
                .twin-scan-eyebrow{display:inline-flex;padding:4px 10px;border-radius:var(--radius-sm);background:var(--accent-soft);color:var(--accent);font-size:12px;font-weight:700;margin-bottom:8px}
                .twin-scan-stage{position:relative;min-height:260px;border-radius:22px;overflow:hidden;background:radial-gradient(circle at top, rgba(14,165,233,.18), transparent 40%), #0f172a}
                .twin-scan-video{width:100%;height:100%;min-height:260px;object-fit:cover;display:none}
                .twin-scan-video.is-visible{display:block}
                .twin-scan-placeholder{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;color:#cbd5e1}
                .twin-scan-placeholder strong{font-size:18px;color:#f8fafc}
                .twin-scan-placeholder p{margin:8px 0 0;max-width:320px;line-height:1.6;font-size:13px}
                .twin-scan-icon{display:grid;place-items:center;width:72px;height:72px;border-radius:var(--radius-lg);margin-bottom:14px;background:rgba(148,163,184,.14);font-size:34px;color:var(--accent-light)}
                .twin-scan-icon--pulse{animation:twinPulse 1.3s ease-in-out infinite}
                .twin-scan-icon--error{background:rgba(239,68,68,.12);color:#fda4af}
                .twin-scan-overlay{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}
                .twin-scan-frame{position:relative;width:min(72%,320px);aspect-ratio:1;border:2px solid color-mix(in srgb,var(--accent) 70%,white 30%);border-radius:var(--radius-lg);box-shadow:0 0 0 999px rgba(15,23,42,.22)}
                .twin-scan-line{position:absolute;left:12px;right:12px;top:16px;height:3px;border-radius:var(--radius-sm);background:linear-gradient(90deg,transparent,var(--accent-light),transparent);animation:twinScanLine 2.1s linear infinite}
                .twin-scan-hint{display:inline-flex;align-items:center;padding:8px 12px;border-radius:var(--radius-sm);background:rgba(15,23,42,.06);font-size:12px;font-weight:600;color:var(--text-secondary)}
                .twin-section-note{margin-top:14px;margin-bottom:10px;padding:12px 14px;border-radius:var(--radius-lg);background:var(--accent-soft);color:var(--text-secondary);font-size:13px}
                .twin-empty{padding:32px;border:1px dashed var(--border-accent);border-radius:var(--radius-lg);background:rgba(248,250,252,.9);text-align:center;color:var(--text-secondary)}
                .twin-chip{display:inline-flex;align-items:center;padding:7px 10px;border-radius:var(--radius-sm);background:var(--accent-soft);color:var(--accent);font-size:12px;font-weight:600;border:none}
                .twin-chip--button{cursor:pointer}
                .twin-chip--muted{background:rgba(15,23,42,.08);color:var(--text-primary)}
                .twin-events{margin-top:18px;border-top:1px solid rgba(15,23,42,.08);padding-top:12px}
                .twin-event{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid rgba(15,23,42,.08)}
                .twin-event:last-child{border-bottom:none}
                .twin-muted{font-size:12px;color:var(--text-secondary)}
                @keyframes twinScanLine{0%{transform:translateY(0)}50%{transform:translateY(calc(min(72vw,320px) - 40px))}100%{transform:translateY(0)}}
                @keyframes twinPulse{0%,100%{transform:scale(1);opacity:.7}50%{transform:scale(1.06);opacity:1}}
                @media (max-width:900px){.twin-head,.twin-focus-banner,.twin-scan-head{flex-direction:column}.twin-two,.twin-grid,.twin-inline-field{grid-template-columns:1fr}.twin-scan-stage,.twin-scan-video{min-height:220px}}
            `}</style>
        </div>
    )
}

function Field({ label, children }) {
    return <div className="twin-fieldbox"><label>{label}</label>{children}</div>
}

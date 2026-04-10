import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { buildAppHref } from '../../components/app/appConfig'
import { twinApi } from '../../services/inventoryApi'
import { showError, showInfo } from '../../utils/toast'
import { buildInventorySurfaceHref, useInventorySurface } from './useInventorySurface'

const TwinSceneCanvas = lazy(() => import('../../components/inventory/TwinSceneCanvas'))
const LOCATION_STATUS_META = {
    empty: { label: '空位', color: '#10b981' },
    occupied: { label: '占用', color: '#f59e0b' },
    partial: { label: '部分占用', color: '#f97316' },
    reserved: { label: '预留', color: '#8b5cf6' },
    locked: { label: '锁定', color: '#94a3b8' },
}

function readValue(record, ...keys) {
    for (const key of keys) {
        if (record?.[key] !== undefined && record?.[key] !== null) {
            return record[key]
        }
    }
    return null
}

function formatDateTime(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return date.toLocaleString('zh-CN', {
        hour12: false,
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

function formatDimensions(value) {
    if (!value) return '-'
    const width = readValue(value, 'widthMm', 'width_mm')
    const depth = readValue(value, 'depthMm', 'depth_mm')
    const height = readValue(value, 'heightMm', 'height_mm')
    if ([width, depth, height].every(item => item === null)) return '-'
    return `${width || 0} × ${depth || 0} × ${height || 0} mm`
}

function getLocationState(location) {
    const used = Number(readValue(location, 'used_capacity', 'usedCapacity') || 0)
    const capacity = Math.max(Number(readValue(location, 'capacity') || 1), 1)
    const rawStatus = String(readValue(location, 'status') || '').toLowerCase()

    if (rawStatus === 'locked') return 'locked'
    if (rawStatus === 'reserved') return 'reserved'
    if (rawStatus === 'partial') return 'partial'
    if (rawStatus === 'occupied') return 'occupied'
    if (used <= 0) return 'empty'
    if (used < capacity) return 'partial'
    return 'occupied'
}

function buildPath(surface, tab, searchParams, nextWarehouseId) {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', tab)
    if (nextWarehouseId) nextParams.set('warehouseId', nextWarehouseId)
    return buildInventorySurfaceHref(surface, '/inventory/space', { params: Object.fromEntries(nextParams.entries()) })
}

function buildDesignerHref({ orgId, warehouseId, warehouseName, sceneType = 'warehouse' }) {
    const params = new URLSearchParams()
    if (orgId) params.set('orgId', orgId)
    if (warehouseId) params.set('warehouseId', warehouseId)
    params.set('sceneType', sceneType)
    params.set('projectType', 'warehouse')
    if (warehouseName) {
        params.set('name', warehouseName)
        params.set('warehouseName', warehouseName)
    }
    const query = params.toString()
    return buildAppHref(`/3d-studio/new${query ? `?${query}` : ''}`)
}

export default function TwinWarehouseViewer() {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const selectedOrgId = searchParams.get('orgId')
    const selectedWarehouseId = searchParams.get('warehouseId') || ''
    const highlightedLocationId = searchParams.get('locationId') || ''
    const fromBinding = searchParams.get('fromBinding') === '1'
    const { surface } = useInventorySurface()

    const [warehouses, setWarehouses] = useState([])
    const [scene, setScene] = useState(null)
    const [loadingWarehouses, setLoadingWarehouses] = useState(true)
    const [loadingScene, setLoadingScene] = useState(false)
    const [viewMode, setViewMode] = useState('iso')
    const [selectedLocationId, setSelectedLocationId] = useState(null)
    const [locationQuery, setLocationQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')

    useEffect(() => {
        let active = true

        const loadWarehouses = async () => {
            setLoadingWarehouses(true)
            try {
                const result = await twinApi.getWarehouses(selectedOrgId)
                if (!active) return
                const nextWarehouses = result.data || []
                setWarehouses(nextWarehouses)

                if (!selectedWarehouseId && nextWarehouses.length > 0) {
                    const nextParams = new URLSearchParams(searchParams)
                    nextParams.set('warehouseId', String(nextWarehouses[0].id))
                    setSearchParams(nextParams, { replace: true })
                }
            } catch (err) {
                if (active) {
                    showError(`加载数字孪生仓库失败：${err.message}`)
                }
            } finally {
                if (active) setLoadingWarehouses(false)
            }
        }

        loadWarehouses()
        return () => {
            active = false
        }
    }, [selectedOrgId])

    useEffect(() => {
        if (!selectedWarehouseId) {
            setScene(null)
            return
        }

        let active = true
        const loadScene = async () => {
            setLoadingScene(true)
            try {
                const result = await twinApi.getScene(selectedWarehouseId, selectedOrgId)
                if (active) {
                    setScene(result.data || null)
                    setSelectedLocationId(highlightedLocationId ? Number(highlightedLocationId) : null)
                }
            } catch (err) {
                if (active) {
                    setScene(null)
                    showError(`加载 3D 场景失败：${err.message}`)
                }
            } finally {
                if (active) setLoadingScene(false)
            }
        }

        loadScene()
        return () => {
            active = false
        }
    }, [selectedWarehouseId, selectedOrgId, highlightedLocationId])

    useEffect(() => {
        setSelectedLocationId(highlightedLocationId ? Number(highlightedLocationId) : null)
    }, [highlightedLocationId])

    const setSelectedLocation = (locationId) => {
        setSelectedLocationId(locationId)
        const nextParams = new URLSearchParams(searchParams)
        if (locationId) nextParams.set('locationId', String(locationId))
        else nextParams.delete('locationId')
        setSearchParams(nextParams, { replace: true })
    }

    const warehouse = scene?.warehouse || warehouses.find(item => String(item.id) === String(selectedWarehouseId))
    const designerHref = useMemo(() => buildDesignerHref({
        orgId: selectedOrgId,
        warehouseId: selectedWarehouseId,
        warehouseName: readValue(warehouse, 'name') || '',
    }), [selectedOrgId, selectedWarehouseId, warehouse])
    const dimensions = readValue(warehouse, 'dimensions_mm', 'dimensionsMm')
    const locations = scene?.locations || []
    const selectedLocation = locations.find((location) => location.id === selectedLocationId) || null
    const occupiedLocations = locations.filter((location) => {
        const used = Number(readValue(location, 'used_capacity', 'usedCapacity') || 0)
        const status = readValue(location, 'status')
        return used > 0 || ['occupied', 'partial', 'reserved'].includes(status)
    })
    const filteredLocations = useMemo(() => {
        const keyword = locationQuery.trim().toLowerCase()
        return locations.filter((location) => {
            const state = getLocationState(location)
            if (statusFilter !== 'all' && state !== statusFilter) return false
            if (!keyword) return true
            const code = String(readValue(location, 'code') || '').toLowerCase()
            const qrCode = String(readValue(location, 'qr_code', 'qrCode') || '').toLowerCase()
            return code.includes(keyword) || qrCode.includes(keyword)
        })
    }, [locationQuery, locations, statusFilter])
    const filteredLocationIds = useMemo(
        () => new Set(filteredLocations.map((location) => location.id)),
        [filteredLocations]
    )
    const filteredScene = useMemo(() => {
        if (!scene) return null
        return {
            ...scene,
            locations: filteredLocations,
            objects: (scene.objects || []).filter((object) =>
                filteredLocationIds.has(readValue(object, 'current_location_id', 'currentLocationId'))
            ),
        }
    }, [filteredLocationIds, filteredLocations, scene])
    const locationStatusCounts = useMemo(() => {
        return locations.reduce((acc, location) => {
            const state = getLocationState(location)
            acc[state] = (acc[state] || 0) + 1
            return acc
        }, { empty: 0, occupied: 0, partial: 0, reserved: 0, locked: 0 })
    }, [locations])

    const summaryCards = useMemo(() => ([
        { key: 'zones', label: '区域', value: scene?.zones?.length || 0, accent: 'var(--accent)' },
        { key: 'racks', label: '货架', value: scene?.racks?.length || 0, accent: 'var(--info)' },
        { key: 'locations', label: '库位', value: locations.length, accent: 'var(--success)' },
        { key: 'objects', label: '在场货物', value: scene?.objects?.length || 0, accent: 'var(--warning)' },
        { key: 'occupied', label: '占用库位', value: occupiedLocations.length, accent: 'var(--danger)' },
        { key: 'events', label: '最新事件', value: scene?.events?.length || 0, accent: 'var(--accent-active)' },
    ]), [scene, locations.length, occupiedLocations.length])

    useEffect(() => {
        if (!selectedLocationId) return
        if (!filteredLocations.some((location) => location.id === selectedLocationId)) {
            setSelectedLocation(null)
        }
    }, [filteredLocations, selectedLocationId])

    return (
        <div className="warehouse-nested-page twin-page">
            <header className="twin-page-header">
                <div>
                    <span className="twin-page-header__eyebrow">Phase 1 Twin Viewer</span>
                    <h1 className="page-title">3D 仓库查看</h1>
                    <p className="page-subtitle">先用结构化场景载荷打通仓库、货架、库位和货物的联动，为后续 Three.js 渲染做稳定数据基线。</p>
                </div>
                <div className="twin-page-header__actions">
                    <button className="btn btn--ghost" onClick={() => navigate(designerHref)}>
                        进入 3D 设计
                    </button>
                    <button className="btn btn--primary" onClick={() => navigate(buildPath(surface, 'bind', searchParams, selectedWarehouseId))}>
                        去做库位绑定
                    </button>
                </div>
            </header>

            <section className="twin-toolbar">
                <label className="twin-field">
                    <span>选择仓库</span>
                    <select
                        className="input"
                        value={selectedWarehouseId}
                        disabled={loadingWarehouses}
                        onChange={(event) => {
                            const nextParams = new URLSearchParams(searchParams)
                            if (event.target.value) nextParams.set('warehouseId', event.target.value)
                            else nextParams.delete('warehouseId')
                            setSearchParams(nextParams)
                        }}
                    >
                        <option value="">请选择仓库</option>
                        {warehouses.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.name} · {item.code}
                            </option>
                        ))}
                    </select>
                </label>
                <button
                    className="btn btn--ghost"
                    disabled={!selectedWarehouseId || loadingScene}
                    onClick={() => {
                        if (!selectedWarehouseId) {
                            showInfo('请先选择一个仓库')
                            return
                        }
                        twinApi.getScene(selectedWarehouseId, selectedOrgId)
                            .then((result) => {
                                setScene(result.data || null)
                                setSelectedLocationId(null)
                            })
                            .catch((err) => showError(`刷新场景失败：${err.message}`))
                    }}
                >
                    刷新场景
                </button>
            </section>

            {fromBinding && selectedLocation && (
                <section className="twin-arrival-banner">
                    <div>
                        <div className="twin-arrival-banner__eyebrow">Binding Replayed</div>
                        <strong>刚刚完成的作业已经回放到 3D 场景。</strong>
                        <p>当前高亮库位 {readValue(selectedLocation, 'code') || `#${selectedLocation.id}`}，你可以继续旋转场景确认落位。</p>
                    </div>
                    <button
                        className="btn btn--ghost"
                        onClick={() => {
                            const nextParams = new URLSearchParams(searchParams)
                            nextParams.delete('fromBinding')
                            setSearchParams(nextParams, { replace: true })
                        }}
                    >
                        收起提示
                    </button>
                </section>
            )}

            {!selectedWarehouseId && !loadingWarehouses && (
                <div className="twin-empty">
                    <h3>还没有可查看的仓库</h3>
                    <p>先去 3D 设计页创建一个仓库，并补上尺寸、货架或库位数据。</p>
                    <button className="btn btn--primary" onClick={() => navigate(buildDesignerHref({ orgId: selectedOrgId }))}>
                        去创建仓库
                    </button>
                </div>
            )}

            {selectedWarehouseId && (
                <>
                    <section className="twin-summary-grid">
                        {summaryCards.map((card) => (
                            <article key={card.key} className="twin-stat-card">
                                <span className="twin-stat-card__accent" style={{ background: card.accent }} />
                                <div className="twin-stat-card__value">{card.value}</div>
                                <div className="twin-stat-card__label">{card.label}</div>
                            </article>
                        ))}
                    </section>

                    <div className="twin-layout-grid">
                        <section className="twin-panel">
                            <div className="twin-panel__header">
                                <h3>仓库快照</h3>
                                <span className="twin-badge">Scene v{scene?.version || readValue(warehouse, 'scene_version', 'sceneVersion') || 1}</span>
                            </div>
                            {loadingScene ? (
                                <p className="twin-muted">正在拉取场景载荷...</p>
                            ) : warehouse ? (
                                <div className="twin-meta-grid">
                                    <InfoItem label="仓库编码" value={readValue(warehouse, 'code') || '-'} />
                                    <InfoItem label="仓库名称" value={readValue(warehouse, 'name') || '-'} />
                                    <InfoItem label="3D 尺寸" value={formatDimensions(dimensions)} />
                                    <InfoItem label="楼层数" value={String(readValue(warehouse, 'floor_count', 'floorCount') || 1)} />
                                    <InfoItem label="地址" value={readValue(warehouse, 'address') || '-'} />
                                    <InfoItem label="联系人" value={readValue(warehouse, 'contact') || '-'} />
                                </div>
                            ) : (
                                <p className="twin-muted">当前仓库还没有 scene 数据。</p>
                            )}

                            <div className="twin-scene-shell">
                                <div className="twin-scene-shell__header twin-scene-shell__header--canvas">
                                    <div>
                                        <strong>参数化 3D 场景</strong>
                                        <div>{filteredLocations.length}/{locations.length} 个库位 · {filteredScene?.objects?.length || 0} 个货物对象</div>
                                    </div>
                                    <div className="twin-view-switch">
                                        <button className={`twin-view-switch__btn ${viewMode === 'iso' ? 'twin-view-switch__btn--active' : ''}`} onClick={() => setViewMode('iso')}>透视</button>
                                        <button className={`twin-view-switch__btn ${viewMode === 'top' ? 'twin-view-switch__btn--active' : ''}`} onClick={() => setViewMode('top')}>顶视</button>
                                        <button className={`twin-view-switch__btn ${viewMode === 'side' ? 'twin-view-switch__btn--active' : ''}`} onClick={() => setViewMode('side')}>侧视</button>
                                    </div>
                                </div>
                                <div className="twin-scene-toolbar">
                                    <label className="twin-scene-field">
                                        <span>库位筛选</span>
                                        <input
                                            className="input"
                                            placeholder="按库位编码或二维码搜索"
                                            value={locationQuery}
                                            onChange={(event) => setLocationQuery(event.target.value)}
                                        />
                                    </label>
                                    <label className="twin-scene-field twin-scene-field--compact">
                                        <span>状态</span>
                                        <select
                                            className="input"
                                            value={statusFilter}
                                            onChange={(event) => setStatusFilter(event.target.value)}
                                        >
                                            <option value="all">全部状态</option>
                                            {Object.entries(LOCATION_STATUS_META).map(([value, meta]) => (
                                                <option key={value} value={value}>{meta.label}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <button
                                        className="btn btn--ghost btn--sm"
                                        onClick={() => {
                                            setLocationQuery('')
                                            setStatusFilter('all')
                                            setSelectedLocationId(null)
                                        }}
                                    >
                                        清空筛选
                                    </button>
                                </div>
                                <div className="twin-scene-legend">
                                    {Object.entries(LOCATION_STATUS_META).map(([key, meta]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            className={`twin-legend-chip ${statusFilter === key ? 'twin-legend-chip--active' : ''}`}
                                            onClick={() => setStatusFilter(current => current === key ? 'all' : key)}
                                        >
                                            <span className="twin-legend-chip__dot" style={{ background: meta.color }} />
                                            {meta.label}
                                            <strong>{locationStatusCounts[key] || 0}</strong>
                                        </button>
                                    ))}
                                </div>
                                <div className="twin-canvas-stage">
                                    {locations.length === 0 ? (
                                        <p className="twin-muted">该仓库还没有库位。</p>
                                    ) : filteredLocations.length === 0 ? (
                                        <div className="twin-canvas-stage__loading">当前筛选条件下没有匹配的库位。</div>
                                    ) : (
                                        <Suspense fallback={<div className="twin-canvas-stage__loading">正在加载 3D 引擎...</div>}>
                                            <TwinSceneCanvas
                                                scene={filteredScene}
                                                viewMode={viewMode}
                                                selectedLocationId={selectedLocationId}
                                                onSelectLocation={setSelectedLocation}
                                            />
                                        </Suspense>
                                    )}
                                </div>
                                <div className="twin-scene-inspector">
                                    <div className="twin-scene-inspector__label">当前选中</div>
                                    {selectedLocation ? (
                                        <div className="twin-scene-inspector__body">
                                            <strong>{readValue(selectedLocation, 'code')}</strong>
                                            <span>{LOCATION_STATUS_META[getLocationState(selectedLocation)]?.label || '未知状态'}</span>
                                            <span>
                                                已用 {Number(readValue(selectedLocation, 'used_capacity', 'usedCapacity') || 0)}/
                                                {Number(readValue(selectedLocation, 'capacity') || 1)}
                                            </span>
                                            <span>{formatDimensions(readValue(selectedLocation, 'dimensions_mm', 'dimensionsMm'))}</span>
                                            <span>{readValue(selectedLocation, 'qr_code', 'qrCode') || '无二维码'}</span>
                                        </div>
                                    ) : (
                                        <div className="twin-scene-inspector__body">
                                            <span>点击 3D 场景中的库位块查看详情。</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>

                        <section className="twin-panel">
                            <div className="twin-panel__header">
                                <h3>库位列表与事件</h3>
                                <button
                                    className="btn btn--primary btn--sm"
                                    style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--text-on-accent)' }}
                                    onClick={() => navigate(`/asset-designer?warehouseId=${selectedWarehouseId}`)}
                                >
                                    ✨ 进入 3D 资产管理器
                                </button>
                            </div>
                            <div className="twin-list">
                                <div className="twin-list__title">筛选结果</div>
                                {filteredLocations.length ? filteredLocations.slice(0, 8).map((location) => {
                                    const state = getLocationState(location)
                                    const meta = LOCATION_STATUS_META[state] || { label: state, color: '#94a3b8' }
                                    return (
                                        <button
                                            key={location.id}
                                            type="button"
                                            className={`twin-location-item ${selectedLocationId === location.id ? 'twin-location-item--active' : ''}`}
                                            onClick={() => setSelectedLocation(location.id)}
                                        >
                                            <div className="twin-location-item__main">
                                                <strong>{readValue(location, 'code') || `location-${location.id}`}</strong>
                                                <span>{formatDimensions(readValue(location, 'dimensions_mm', 'dimensionsMm'))}</span>
                                            </div>
                                            <div className="twin-location-item__meta">
                                                <span className="twin-badge twin-badge--subtle" style={{ color: meta.color }}>{meta.label}</span>
                                                <span>{Number(readValue(location, 'used_capacity', 'usedCapacity') || 0)}/{Number(readValue(location, 'capacity') || 1)}</span>
                                            </div>
                                        </button>
                                    )
                                }) : <p className="twin-muted">当前筛选下没有库位。</p>}
                            </div>
                            <div className="twin-layout-box">
                                <div className="twin-layout-box__title">layout_json</div>
                                <pre>{JSON.stringify(readValue(warehouse, 'layout_json', 'layoutJson') || {}, null, 2)}</pre>
                            </div>

                            <div className="twin-list">
                                <div className="twin-list__title">最新事件</div>
                                {scene?.events?.length ? scene.events.slice(0, 8).map((event) => (
                                    <article key={event.id} className="twin-event-item">
                                        <div>
                                            <strong>{event.eventType}</strong>
                                            <div className="twin-muted">object #{event.objectId || '-'} · location #{event.locationId || '-'}</div>
                                        </div>
                                        <div className="twin-event-item__meta">
                                            <span className="twin-badge twin-badge--subtle">{event.eventStatus}</span>
                                            <time>{formatDateTime(event.createdAt)}</time>
                                        </div>
                                    </article>
                                )) : <p className="twin-muted">还没有事件。</p>}
                            </div>
                        </section>
                    </div>
                </>
            )}

            <style>{`
                .twin-page-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 16px;
                    margin-bottom: 24px;
                }
                .twin-page-header__eyebrow {
                    display: inline-flex;
                    align-items: center;
                    padding: 4px 10px;
                    border-radius: var(--radius-sm);
                    background: var(--accent-soft);
                    color: var(--accent);
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                    margin-bottom: 10px;
                }
                .twin-page-header__actions {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                }
                .twin-toolbar {
                    display: flex;
                    align-items: end;
                    gap: 12px;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                }
                .twin-arrival-banner {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 16px;
                    margin-bottom: 20px;
                    padding: 16px 18px;
                    border-radius: var(--radius-lg);
                    background: linear-gradient(135deg, var(--panel-strong), color-mix(in srgb, var(--accent) 42%, var(--panel) 58%));
                    color: rgba(255, 255, 255, 0.92);
                }
                .twin-arrival-banner__eyebrow {
                    display: inline-flex;
                    padding: 4px 10px;
                    border-radius: var(--radius-sm);
                    background: color-mix(in srgb, var(--accent-soft) 60%, transparent);
                    color: var(--text-on-dark);
                    font-size: 12px;
                    font-weight: 700;
                    margin-bottom: 8px;
                }
                .twin-arrival-banner p {
                    margin: 6px 0 0;
                    color: rgba(255, 255, 255, 0.72);
                    font-size: 13px;
                }
                .twin-field {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    min-width: 260px;
                }
                .twin-field span {
                    font-size: 12px;
                    color: var(--text-secondary);
                    font-weight: 600;
                }
                .twin-summary-grid {
                    display: grid;
                    grid-template-columns: repeat(6, minmax(0, 1fr));
                    gap: 12px;
                    margin-bottom: 20px;
                }
                .twin-stat-card {
                    position: relative;
                    background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 97%, transparent), var(--surface)), var(--grid-pattern);
                    background-size: auto, 18px 18px;
                    border: 1px solid var(--border);
                    border-radius: var(--radius-lg);
                    padding: 18px 18px 16px;
                    box-shadow: var(--shadow-sm);
                    overflow: hidden;
                }
                .twin-stat-card__accent {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 4px;
                }
                .twin-stat-card__value {
                    font-size: 32px;
                    font-weight: 800;
                    line-height: 1;
                    margin-bottom: 8px;
                }
                .twin-stat-card__label {
                    font-size: 13px;
                    color: var(--text-secondary);
                }
                .twin-layout-grid {
                    display: grid;
                    grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
                    gap: 20px;
                }
                .twin-panel {
                    background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 97%, transparent), var(--surface));
                    border: 1px solid var(--border);
                    border-radius: var(--radius-lg);
                    padding: 20px;
                    box-shadow: var(--shadow-sm);
                }
                .twin-panel__header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    margin-bottom: 16px;
                }
                .twin-panel__header h3 {
                    margin: 0;
                    font-size: 18px;
                }
                .twin-badge {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 6px 10px;
                    border-radius: var(--radius-sm);
                    background: var(--accent-soft);
                    color: var(--accent);
                    font-size: 12px;
                    font-weight: 700;
                }
                .twin-badge--subtle {
                    background: var(--bg-secondary);
                    color: var(--text-primary);
                }
                .twin-meta-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 14px;
                    margin-bottom: 20px;
                }
                .twin-info-item {
                    padding: 14px;
                    border-radius: var(--radius-lg);
                    background: var(--bg-secondary);
                    border: 1px solid var(--border);
                }
                .twin-info-item__label {
                    font-size: 12px;
                    color: var(--text-secondary);
                    margin-bottom: 6px;
                }
                .twin-info-item__value {
                    font-size: 14px;
                    font-weight: 700;
                    color: var(--text-primary);
                    word-break: break-word;
                }
                .twin-scene-shell {
                    border-radius: var(--radius-lg);
                    background:
                        radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 18%, transparent), transparent 34%),
                        linear-gradient(180deg, var(--panel), var(--panel-strong));
                    padding: 18px;
                    color: rgba(255, 255, 255, 0.92);
                }
                .twin-scene-shell__header {
                    display: flex;
                    justify-content: space-between;
                    font-size: 13px;
                    margin-bottom: 14px;
                    color: rgba(255, 255, 255, 0.7);
                }
                .twin-scene-shell__header--canvas {
                    align-items: center;
                    gap: 16px;
                }
                .twin-scene-toolbar {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) 180px auto;
                    gap: 10px;
                    margin-bottom: 14px;
                }
                .twin-scene-field {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .twin-scene-field span {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    color: rgba(255, 255, 255, 0.58);
                }
                .twin-scene-field--compact {
                    max-width: 180px;
                }
                .twin-scene-legend {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    margin-bottom: 14px;
                }
                .twin-legend-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    background: rgba(255, 255, 255, 0.06);
                    color: rgba(255, 255, 255, 0.88);
                    border-radius: var(--radius-md);
                    padding: 8px 12px;
                    cursor: pointer;
                    font-size: 12px;
                }
                .twin-legend-chip strong {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.98);
                }
                .twin-legend-chip--active {
                    border-color: rgba(56, 189, 248, 0.42);
                    background: rgba(56, 189, 248, 0.15);
                }
                .twin-legend-chip__dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.08);
                }
                .twin-view-switch {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                .twin-view-switch__btn {
                    border: 1px solid rgba(255, 255, 255, 0.18);
                    background: rgba(255, 255, 255, 0.08);
                    color: rgba(255, 255, 255, 0.88);
                    border-radius: var(--radius-md);
                    padding: 8px 12px;
                    font-size: 12px;
                    cursor: pointer;
                }
                .twin-view-switch__btn--active {
                    background: rgba(56, 189, 248, 0.2);
                    border-color: rgba(56, 189, 248, 0.45);
                }
                .twin-canvas-stage {
                    height: 460px;
                    border-radius: var(--radius-lg);
                    overflow: hidden;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    background:
                        radial-gradient(circle at top right, rgba(56, 189, 248, 0.16), transparent 30%),
                        linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
                }
                .twin-canvas-stage__loading {
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: rgba(255, 255, 255, 0.74);
                    font-size: 14px;
                    letter-spacing: 0.04em;
                }
                .twin-scene-inspector {
                    margin-top: 14px;
                    display: flex;
                    gap: 12px;
                    align-items: start;
                    justify-content: space-between;
                    color: rgba(255, 255, 255, 0.76);
                }
                .twin-scene-inspector__label {
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                }
                .twin-scene-inspector__body {
                    display: flex;
                    flex-direction: column;
                    align-items: end;
                    gap: 4px;
                    font-size: 12px;
                    text-align: right;
                }
                .twin-layout-box {
                    border-radius: var(--radius-lg);
                    background: linear-gradient(180deg, var(--panel), var(--panel-strong));
                    color: var(--text-on-dark);
                    padding: 16px;
                    margin-bottom: 18px;
                }
                .twin-layout-box__title {
                    font-size: 12px;
                    color: var(--accent-light);
                    margin-bottom: 10px;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                }
                .twin-layout-box pre {
                    margin: 0;
                    white-space: pre-wrap;
                    word-break: break-word;
                    font-size: 12px;
                    line-height: 1.6;
                }
                .twin-list__title {
                    font-size: 13px;
                    font-weight: 700;
                    margin-bottom: 10px;
                }
                .twin-location-item {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 12px 14px;
                    border-radius: var(--radius-lg);
                    border: 1px solid var(--border);
                    background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 97%, transparent), var(--surface));
                    margin-bottom: 10px;
                    text-align: left;
                    cursor: pointer;
                }
                .twin-location-item--active {
                    border-color: var(--accent);
                    box-shadow: inset 0 0 0 1px var(--border-accent);
                }
                .twin-location-item__main,
                .twin-location-item__meta {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .twin-location-item__main span,
                .twin-location-item__meta span {
                    font-size: 12px;
                    color: var(--text-secondary);
                }
                .twin-event-item {
                    display: flex;
                    align-items: start;
                    justify-content: space-between;
                    gap: 14px;
                    padding: 14px 0;
                    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
                }
                .twin-event-item:last-child {
                    border-bottom: none;
                    padding-bottom: 0;
                }
                .twin-event-item__meta {
                    display: flex;
                    flex-direction: column;
                    align-items: end;
                    gap: 6px;
                    font-size: 12px;
                    color: var(--text-secondary);
                    white-space: nowrap;
                }
                .twin-empty {
                    background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, transparent), var(--surface));
                    border: 1px dashed var(--border-accent);
                    border-radius: var(--radius-lg);
                    padding: 40px 32px;
                    text-align: center;
                }
                .twin-empty h3 {
                    margin-top: 0;
                    margin-bottom: 10px;
                }
                .twin-empty p,
                .twin-muted {
                    color: var(--text-secondary);
                }
                @media (max-width: 1200px) {
                    .twin-summary-grid {
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                    }
                }
                @media (max-width: 960px) {
                    .twin-layout-grid {
                        grid-template-columns: 1fr;
                    }
                    .twin-page-header {
                        flex-direction: column;
                    }
                    .twin-arrival-banner {
                        flex-direction: column;
                        align-items: stretch;
                    }
                    .twin-scene-toolbar {
                        grid-template-columns: 1fr;
                    }
                    .twin-canvas-stage {
                        height: 360px;
                    }
                }
                @media (max-width: 640px) {
                    .twin-summary-grid,
                    .twin-meta-grid {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </div>
    )
}

function InfoItem({ label, value }) {
    return (
        <div className="twin-info-item">
            <div className="twin-info-item__label">{label}</div>
            <div className="twin-info-item__value">{value}</div>
        </div>
    )
}

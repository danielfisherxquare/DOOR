import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { warehouseApi, locationApi } from '../../services/inventoryApi'
import { showSuccess, showError } from '../../utils/toast'
import StatusPill from '../../components/inventory/StatusPill'
import { useInventorySurface } from './useInventorySurface'

function WarehouseManager() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const selectedOrgId = searchParams.get('orgId')
    const { buildHref } = useInventorySurface()
    const [warehouses, setWarehouses] = useState([])
    const [selectedWarehouse, setSelectedWarehouse] = useState(null)
    const [locations, setLocations] = useState([])
    const [loading, setLoading] = useState(true)
    const [showCreateWarehouse, setShowCreateWarehouse] = useState(false)
    const [showCreateLocation, setShowCreateLocation] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState(null)
    const [newWarehouse, setNewWarehouse] = useState({ code: '', name: '', address: '', contact: '' })
    const [newLocation, setNewLocation] = useState({ code: '', zone: '', aisle: '', shelf: '', position: '', capacity: 100 })
    const [locationSearch, setLocationSearch] = useState('')

    const loadWarehouses = async () => {
        try {
            const result = await warehouseApi.getWarehouses(selectedOrgId)
            setWarehouses(result.data || [])
        } catch (_err) {
            showError('加载仓库失败')
        } finally {
            setLoading(false)
        }
    }

    const loadLocations = async (warehouseId) => {
        try {
            const result = await locationApi.getLocations(warehouseId, selectedOrgId)
            setLocations(result.data || [])
        } catch (_err) {
            showError('加载库位失败')
        }
    }

    useEffect(() => {
        loadWarehouses()
    }, [selectedOrgId])

    const handleSelectWarehouse = (warehouse) => {
        setSelectedWarehouse(warehouse)
        setLocationSearch('')
        loadLocations(warehouse.id)
    }

    const handleCreateWarehouse = async () => {
        if (!newWarehouse.code || !newWarehouse.name) {
            showError('请输入仓库编码和名称')
            return
        }

        try {
            const result = await warehouseApi.createWarehouse(newWarehouse, selectedOrgId)
            setWarehouses([result.data, ...warehouses])
            setShowCreateWarehouse(false)
            setNewWarehouse({ code: '', name: '', address: '', contact: '' })
            showSuccess('仓库创建成功')
        } catch (err) {
            showError('创建失败: ' + err.message)
        }
    }

    const handleDeleteWarehouse = async (id) => {
        try {
            await warehouseApi.deleteWarehouse(id, selectedOrgId)
            setWarehouses(warehouses.filter(w => w.id !== id))
            if (selectedWarehouse?.id === id) {
                setSelectedWarehouse(null)
                setLocations([])
            }
            setDeleteConfirm(null)
            showSuccess('仓库删除成功')
        } catch (err) {
            showError('删除失败: ' + err.message)
        }
    }

    const handleCreateLocation = async () => {
        if (!newLocation.code) {
            showError('请输入库位编码')
            return
        }

        try {
            const result = await locationApi.createLocation({
                ...newLocation,
                warehouseId: selectedWarehouse.id
            }, selectedOrgId)
            setLocations([result.data, ...locations])
            setShowCreateLocation(false)
            setNewLocation({ code: '', zone: '', aisle: '', shelf: '', position: '', capacity: 100 })
            showSuccess('库位创建成功')
        } catch (err) {
            showError('创建失败: ' + err.message)
        }
    }

    const filteredLocations = locations.filter(loc =>
        loc.code.toLowerCase().includes(locationSearch.toLowerCase()) ||
        loc.zone?.toLowerCase().includes(locationSearch.toLowerCase())
    )

    const goTwin = (tab, warehouseId) => {
        navigate(buildHref('/inventory/space', {
            orgId: selectedOrgId,
            params: {
                tab,
                warehouseId,
            },
        }))
    }

    if (loading) {
        return (
            <div className="warehouse-nested-page warehouse-nested-page--loading">
                <div className="loading-state">
                    <div className="loading-state__spinner" />
                    <p>加载中...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="warehouse-nested-page wm-page">
            <header className="wm-header">
                <div>
                    <h1 className="page-title">仓库管理</h1>
                    <p className="page-subtitle">管理仓库和库位信息，并将仓库快速切换到 3D 设计、3D 查看和库位绑定流程。</p>
                </div>
                <div className="wm-header__actions">
                    <button className="btn btn--ghost" onClick={() => goTwin('designer')}>
                        新建 3D 仓库
                    </button>
                    <button className="btn btn--primary" onClick={() => goTwin('viewer', selectedWarehouse?.id)}>
                        打开 3D 查看
                    </button>
                </div>
            </header>

            <div className="wm-grid">
                <section className="wm-panel">
                    <div className="wm-panel__header">
                        <h3 className="wm-panel__title">仓库列表</h3>
                        <button className="btn btn--primary btn--sm" onClick={() => setShowCreateWarehouse(true)}>
                            + 新建
                        </button>
                    </div>

                    {showCreateWarehouse && (
                        <div className="wm-form">
                            <div className="wm-form__fields">
                                <input
                                    className="input"
                                    placeholder="仓库编码（如：WH001）"
                                    value={newWarehouse.code}
                                    onChange={e => setNewWarehouse({ ...newWarehouse, code: e.target.value })}
                                />
                                <input
                                    className="input"
                                    placeholder="仓库名称"
                                    value={newWarehouse.name}
                                    onChange={e => setNewWarehouse({ ...newWarehouse, name: e.target.value })}
                                />
                                <input
                                    className="input"
                                    placeholder="地址（可选）"
                                    value={newWarehouse.address}
                                    onChange={e => setNewWarehouse({ ...newWarehouse, address: e.target.value })}
                                />
                                <input
                                    className="input"
                                    placeholder="联系人（可选）"
                                    value={newWarehouse.contact}
                                    onChange={e => setNewWarehouse({ ...newWarehouse, contact: e.target.value })}
                                />
                            </div>
                            <div className="wm-form__actions">
                                <button className="btn btn--primary btn--sm" onClick={handleCreateWarehouse}>创建</button>
                                <button className="btn btn--ghost btn--sm" onClick={() => setShowCreateWarehouse(false)}>取消</button>
                            </div>
                        </div>
                    )}

                    <div className="wm-list">
                        {warehouses.length === 0 ? (
                            <div className="wm-empty">
                                <p>暂无仓库</p>
                                <button className="btn btn--primary btn--sm" onClick={() => setShowCreateWarehouse(true)}>
                                    创建第一个仓库
                                </button>
                            </div>
                        ) : (
                            warehouses.map(warehouse => (
                                <div
                                    key={warehouse.id}
                                    className={`wm-item ${selectedWarehouse?.id === warehouse.id ? 'wm-item--active' : ''}`}
                                    onClick={() => handleSelectWarehouse(warehouse)}
                                >
                                    <div className="wm-item__info">
                                        <div className="wm-item__name">{warehouse.name}</div>
                                        <div className="wm-item__code">{warehouse.code}</div>
                                    </div>
                                    <div className="wm-item__actions">
                                        <StatusPill status={warehouse.status} />
                                        <button
                                            className="btn btn--ghost btn--sm"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                goTwin('designer', warehouse.id)
                                            }}
                                        >
                                            3D设计
                                        </button>
                                        <button
                                            className="btn btn--ghost btn--sm"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                goTwin('viewer', warehouse.id)
                                            }}
                                        >
                                            3D查看
                                        </button>
                                        <button
                                            className="btn btn--ghost btn--sm"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setDeleteConfirm({ type: 'warehouse', id: warehouse.id })
                                            }}
                                        >
                                            删除
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>

                <section className="wm-panel">
                    <div className="wm-panel__header">
                        <h3 className="wm-panel__title">库位列表</h3>
                        <div className="wm-panel__actions">
                            {selectedWarehouse && (
                                <>
                                    <button className="btn btn--ghost btn--sm" onClick={() => goTwin('bind', selectedWarehouse.id)}>
                                        去绑定
                                    </button>
                                    <button className="btn btn--ghost btn--sm" onClick={() => goTwin('viewer', selectedWarehouse.id)}>
                                        3D查看
                                    </button>
                                    <button className="btn btn--primary btn--sm" onClick={() => setShowCreateLocation(true)}>
                                        + 新建
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {!selectedWarehouse ? (
                        <div className="wm-empty">
                            <Icon name="warehouse" size={48} />
                            <p>请先选择仓库</p>
                        </div>
                    ) : (
                        <>
                            {showCreateLocation && (
                                <div className="wm-form">
                                    <div className="wm-form__fields wm-form__fields--grid">
                                        <input
                                            className="input"
                                            placeholder="库位编码"
                                            value={newLocation.code}
                                            onChange={e => setNewLocation({ ...newLocation, code: e.target.value })}
                                        />
                                        <input
                                            className="input"
                                            placeholder="区域"
                                            value={newLocation.zone}
                                            onChange={e => setNewLocation({ ...newLocation, zone: e.target.value })}
                                        />
                                        <input
                                            className="input"
                                            placeholder="货架"
                                            value={newLocation.aisle}
                                            onChange={e => setNewLocation({ ...newLocation, aisle: e.target.value })}
                                        />
                                        <input
                                            className="input"
                                            placeholder="层"
                                            value={newLocation.shelf}
                                            onChange={e => setNewLocation({ ...newLocation, shelf: e.target.value })}
                                        />
                                        <input
                                            className="input"
                                            placeholder="位"
                                            value={newLocation.position}
                                            onChange={e => setNewLocation({ ...newLocation, position: e.target.value })}
                                        />
                                        <input
                                            className="input"
                                            type="number"
                                            placeholder="容量"
                                            value={newLocation.capacity}
                                            onChange={e => setNewLocation({ ...newLocation, capacity: parseInt(e.target.value) || 100 })}
                                        />
                                    </div>
                                    <div className="wm-form__actions">
                                        <button className="btn btn--primary btn--sm" onClick={handleCreateLocation}>创建</button>
                                        <button className="btn btn--ghost btn--sm" onClick={() => setShowCreateLocation(false)}>取消</button>
                                    </div>
                                </div>
                            )}

                            <div className="wm-search">
                                <input
                                    className="input"
                                    placeholder="搜索库位..."
                                    value={locationSearch}
                                    onChange={e => setLocationSearch(e.target.value)}
                                />
                            </div>

                            <div className="wm-list">
                                {filteredLocations.length === 0 ? (
                                    <div className="wm-empty">
                                        <p>{locationSearch ? '未找到匹配的库位' : '暂无库位'}</p>
                                    </div>
                                ) : (
                                    filteredLocations.map(location => (
                                        <div key={location.id} className="wm-item wm-item--location">
                                            <div className="wm-item__info">
                                                <div className="wm-item__name wm-item__name--mono">{location.code}</div>
                                                <div className="wm-item__meta">
                                                    {[location.zone, location.aisle, location.shelf, location.position].filter(Boolean).join(' · ')}
                                                </div>
                                            </div>
                                            <div className="wm-item__capacity">
                                                <div className="capacity-bar">
                                                    <div
                                                        className="capacity-bar__fill"
                                                        style={{ width: `${Math.min((location.used_capacity || 0) / location.capacity * 100, 100)}%` }}
                                                    />
                                                </div>
                                                <span className="capacity-text">
                                                    {location.used_capacity || 0}/{location.capacity}
                                                </span>
                                            </div>
                                            <StatusPill status={location.status} />
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </section>
            </div>

            {deleteConfirm && (
                <div className="confirm-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
                        <div className="confirm-dialog__icon">
                            <Icon name="alert" size={32} />
                        </div>
                        <h4 className="confirm-dialog__title">确认删除</h4>
                        <p className="confirm-dialog__desc">删除后无法恢复，确定要删除吗？</p>
                        <div className="confirm-dialog__actions">
                            <button className="btn btn--ghost" onClick={() => setDeleteConfirm(null)}>取消</button>
                            <button
                                className="btn btn--primary"
                                style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
                                onClick={() => handleDeleteWarehouse(deleteConfirm.id)}
                            >
                                确认删除
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .wm-header {
                    margin-bottom: var(--spacing-xl);
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: var(--spacing-md);
                }
                .wm-header__actions,
                .wm-panel__actions {
                    display: flex;
                    gap: var(--spacing-sm);
                    flex-wrap: wrap;
                }
                .wm-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: var(--spacing-xl);
                }
                .wm-panel {
                    background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, transparent), var(--surface));
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-lg);
                    box-shadow: var(--shadow-sm);
                    border: 1px solid var(--border);
                }
                .wm-panel__header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--spacing-md);
                }
                .wm-panel__title {
                    margin: 0;
                    font-size: var(--font-size-lg);
                }
                .wm-form {
                    background: var(--bg-secondary);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-md);
                }
                .wm-form__fields {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-md);
                }
                .wm-form__fields--grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: var(--spacing-sm);
                }
                .wm-form__actions {
                    display: flex;
                    gap: var(--spacing-sm);
                }
                .wm-search {
                    margin-bottom: var(--spacing-md);
                }
                .wm-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                }
                .wm-item {
                    padding: var(--spacing-md);
                    border: 1px solid var(--border);
                    border-radius: var(--radius-md);
                    cursor: pointer;
                    transition: all 0.15s ease;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, transparent), var(--surface));
                }
                .wm-item:hover {
                    border-color: var(--accent);
                }
                .wm-item--active {
                    border-color: var(--accent);
                    background: var(--accent-soft);
                }
                .wm-item--location {
                    flex-wrap: wrap;
                    gap: var(--spacing-sm);
                }
                .wm-item__info {
                    flex: 1;
                    min-width: 0;
                }
                .wm-item__name {
                    font-weight: 600;
                }
                .wm-item__name--mono {
                    font-family: 'SF Mono', Monaco, monospace;
                }
                .wm-item__code {
                    font-size: var(--font-size-sm);
                    color: var(--text-secondary);
                }
                .wm-item__meta {
                    font-size: var(--font-size-xs);
                    color: var(--text-muted);
                }
                .wm-item__actions {
                    display: flex;
                    gap: var(--spacing-sm);
                    align-items: center;
                }
                .wm-item__capacity {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                }
                .capacity-bar {
                    width: 60px;
                    height: 6px;
                    background: var(--bg-secondary);
                    border-radius: var(--radius-sm);
                    overflow: hidden;
                }
                .capacity-bar__fill {
                    height: 100%;
                    background: var(--accent);
                    transition: width 0.3s ease;
                }
                .capacity-text {
                    font-size: var(--font-size-xs);
                    color: var(--text-secondary);
                    white-space: nowrap;
                }
                .wm-empty {
                    text-align: center;
                    padding: var(--spacing-xl);
                    color: var(--text-secondary);
                }
                .confirm-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }
                .confirm-dialog {
                    background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, transparent), var(--surface));
                    border: 1px solid var(--border);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-xl);
                    max-width: 360px;
                    text-align: center;
                }
                .confirm-dialog__icon {
                    color: var(--danger);
                    margin-bottom: var(--spacing-md);
                }
                .confirm-dialog__title {
                    margin: 0 0 var(--spacing-sm);
                }
                .confirm-dialog__desc {
                    color: var(--text-secondary);
                    font-size: var(--font-size-sm);
                    margin-bottom: var(--spacing-lg);
                }
                .confirm-dialog__actions {
                    display: flex;
                    gap: var(--spacing-sm);
                    justify-content: center;
                }
                @media (max-width: 768px) {
                    .wm-header {
                        flex-direction: column;
                    }
                    .wm-grid {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </div>
    )
}

function Icon({ name, size = 20 }) {
    const icons = {
        warehouse: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/>
                <path d="M6 18h12"/><path d="M6 14h12"/><path d="M6 10h12"/>
            </svg>
        ),
        alert: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
        ),
    }
    return icons[name] || null
}

export default WarehouseManager

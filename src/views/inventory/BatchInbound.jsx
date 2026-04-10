import { useMemo, useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { batchApi, unitApi, warehouseApi } from '../../services/inventoryApi'
import { showSuccess, showError } from '../../utils/toast'
import { useInventorySurface } from './useInventorySurface'

function buildInitialItems(searchParams) {
    return [
        {
            itemType: searchParams.get('itemType') || 'clothing',
            itemCategory: searchParams.get('itemCategory') || '',
            itemSpec: { size: 'L', gender: 'M' },
            quantity: Math.max(parseInt(searchParams.get('quantity') || '1', 10) || 1, 1)
        }
    ]
}

function BatchInbound() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const selectedOrgId = searchParams.get('orgId')
    const prefilledBatchId = searchParams.get('batchId')
    const { buildHref } = useInventorySurface()
    const [batches, setBatches] = useState([])
    const [warehouses, setWarehouses] = useState([])
    const [selectedBatch, setSelectedBatch] = useState(null)
    const [selectedWarehouseId, setSelectedWarehouseId] = useState(searchParams.get('warehouseId') || '')
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [showCreateBatch, setShowCreateBatch] = useState(false)
    const [newBatch, setNewBatch] = useState({ batchName: '', batchType: 'clothing', supplier: '' })
    const [inboundItems, setInboundItems] = useState(() => buildInitialItems(searchParams))
    const [lastInboundResult, setLastInboundResult] = useState(null)

    useEffect(() => {
        const params = selectedOrgId ? { orgId: selectedOrgId } : {}
        Promise.all([
            batchApi.getBatches(params).then(res => setBatches(res.data || [])),
            warehouseApi.getWarehouses(selectedOrgId).then(res => setWarehouses(res.data || []))
        ]).finally(() => setLoading(false))
    }, [selectedOrgId])

    useEffect(() => {
        if (!prefilledBatchId || batches.length === 0) return
        const matched = batches.find(batch => String(batch.id) === String(prefilledBatchId))
        if (matched) {
            setSelectedBatch(matched)
        }
    }, [prefilledBatchId, batches])

    const handleCreateBatch = async () => {
        if (!newBatch.batchName) {
            showError('请输入批次名称')
            return
        }

        try {
            const result = await batchApi.createBatch(newBatch, selectedOrgId)
            setBatches([result.data, ...batches])
            setSelectedBatch(result.data)
            setShowCreateBatch(false)
            setNewBatch({ batchName: '', batchType: 'clothing', supplier: '' })
            showSuccess('批次创建成功')
        } catch (err) {
            showError('创建失败: ' + err.message)
        }
    }

    const addItemRow = () => {
        setInboundItems([
            ...inboundItems,
            { itemType: 'clothing', itemCategory: '', itemSpec: { size: 'L', gender: 'M' }, quantity: 1 }
        ])
    }

    const removeItemRow = (index) => {
        if (inboundItems.length > 1) {
            setInboundItems(inboundItems.filter((_, i) => i !== index))
        }
    }

    const updateItem = (index, field, value) => {
        const newItems = [...inboundItems]
        if (field === 'itemSpec.size' || field === 'itemSpec.gender') {
            const [obj, key] = field.split('.')
            newItems[index][obj][key] = value
        } else {
            newItems[index][field] = value
        }
        setInboundItems(newItems)
    }

    const handleBatchInbound = async () => {
        if (!selectedBatch) {
            showError('请先选择批次')
            return
        }

        setSubmitting(true)
        try {
            const result = await unitApi.batchInbound({
                batchId: selectedBatch.id,
                warehouseId: selectedWarehouseId || undefined,
                items: inboundItems.map((item) => ({
                    ...item,
                    warehouseId: item.warehouseId || selectedWarehouseId || undefined,
                })),
            }, selectedOrgId)

            setLastInboundResult({
                count: result.count || 0,
                twinObjectsCreated: result.twinObjectsCreated || 0,
                twinObjectsUpdated: result.twinObjectsUpdated || 0,
                warehouseName: selectedWarehouse?.name || null,
                batchId: selectedBatch.id,
                firstObjectQr: result.units?.[0]?.qr_code || result.units?.[0]?.qrCode || '',
            })
            showSuccess(`入库成功！共创建 ${result.count} 个物资，Twin 同步 ${result.twinObjectsCreated || 0} 个对象`)

            const batchesRes = await batchApi.getBatches(selectedOrgId ? { orgId: selectedOrgId } : {})
            setBatches(batchesRes.data || [])

            setInboundItems(buildInitialItems(searchParams))
        } catch (err) {
            showError('入库失败: ' + err.message)
        } finally {
            setSubmitting(false)
        }
    }

    const totalQuantity = inboundItems.reduce((sum, item) => sum + (item.quantity || 0), 0)
    const selectedWarehouse = useMemo(
        () => warehouses.find((warehouse) => String(warehouse.id) === String(selectedWarehouseId)) || null,
        [warehouses, selectedWarehouseId]
    )

    const goTwinBinding = (overrides = {}) => {
        navigate(buildHref('/inventory/space', {
            orgId: selectedOrgId,
            params: {
                tab: 'bind',
                warehouseId: selectedWarehouseId,
                batchId: overrides.batchId || selectedBatch?.id,
                objectQr: overrides.objectQr,
                locationQr: overrides.locationQr,
            },
        }))
    }

    const batchTypeLabels = {
        clothing: '服装',
        medal: '奖牌',
        bag: '背包',
        other: '其他'
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
        <div className="warehouse-nested-page bi-page">
            <header className="bi-header">
                <div>
                    <h1 className="page-title">批量入库</h1>
                    <p className="page-subtitle">创建批次并批量入库物资，入库完成后直接进入库位绑定。</p>
                </div>
                <div className="bi-header__actions">
                    <button className="btn btn--ghost" onClick={goTwinBinding}>
                        去库位绑定
                    </button>
                </div>
            </header>

            <section className="bi-warehouse-banner">
                <div>
                    <div className="bi-warehouse-banner__eyebrow">Twin Flow</div>
                    <strong>{selectedWarehouse ? `当前绑定仓库：${selectedWarehouse.name}` : '建议先选择一个仓库'}</strong>
                    <p>阶段一会把“入库”和“绑定库位”拆成两个动作，这里先选仓库，入库完成后直接跳去扫码绑定页。</p>
                </div>
                <div className="bi-warehouse-banner__actions">
                    <select
                        className="input"
                        value={selectedWarehouseId}
                        onChange={(event) => setSelectedWarehouseId(event.target.value)}
                    >
                        <option value="">请选择仓库</option>
                        {warehouses.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.name} · {warehouse.code}
                            </option>
                        ))}
                    </select>
                    <button className="btn btn--primary" onClick={goTwinBinding}>
                        打开绑定页
                    </button>
                </div>
            </section>

            {lastInboundResult && (
                <section className="bi-result-banner">
                    <div>
                        <div className="bi-result-banner__eyebrow">Inbound Synced</div>
                        <strong>本次已创建 {lastInboundResult.count} 个旧库存单元，并同步 {lastInboundResult.twinObjectsCreated} 个 twin 对象。</strong>
                        <p>
                            {lastInboundResult.warehouseName
                                ? `这些对象已挂到 ${lastInboundResult.warehouseName}，下一步可以直接去扫码绑定库位。`
                                : '如果你已经选了仓库，下一步可以直接去扫码绑定库位。'}
                        </p>
                    </div>
                    <div className="bi-result-banner__meta">
                        {lastInboundResult.twinObjectsUpdated > 0 && (
                            <span className="bi-result-badge">已更新 {lastInboundResult.twinObjectsUpdated}</span>
                        )}
                        <button
                            className="btn btn--primary"
                            onClick={() => goTwinBinding({
                                batchId: lastInboundResult.batchId,
                                objectQr: lastInboundResult.firstObjectQr,
                            })}
                        >
                            去做库位绑定
                        </button>
                    </div>
                </section>
            )}

            <section className="bi-batch-section">
                <div className="bi-section-header">
                    <h3 className="bi-section-title">选择批次</h3>
                    <button className="btn btn--secondary btn--sm" onClick={() => setShowCreateBatch(true)}>
                        + 新建批次
                    </button>
                </div>

                {showCreateBatch && (
                    <div className="bi-create-form">
                        <div className="bi-create-form__fields">
                            <input
                                className="input"
                                placeholder="批次名称（如：2024春季物资）"
                                value={newBatch.batchName}
                                onChange={(e) => setNewBatch({ ...newBatch, batchName: e.target.value })}
                            />
                            <select
                                className="input"
                                value={newBatch.batchType}
                                onChange={(e) => setNewBatch({ ...newBatch, batchType: e.target.value })}
                            >
                                <option value="clothing">服装</option>
                                <option value="medal">奖牌</option>
                                <option value="bag">背包</option>
                                <option value="other">其他</option>
                            </select>
                            <input
                                className="input"
                                placeholder="供应商（可选）"
                                value={newBatch.supplier}
                                onChange={(e) => setNewBatch({ ...newBatch, supplier: e.target.value })}
                            />
                        </div>
                        <div className="bi-create-form__actions">
                            <button className="btn btn--primary btn--sm" onClick={handleCreateBatch}>创建</button>
                            <button className="btn btn--ghost btn--sm" onClick={() => setShowCreateBatch(false)}>取消</button>
                        </div>
                    </div>
                )}

                <div className="bi-batch-grid">
                    {batches.length === 0 ? (
                        <div className="bi-empty-batch">
                            <p>暂无批次</p>
                            <button className="btn btn--primary btn--sm" onClick={() => setShowCreateBatch(true)}>
                                创建第一个批次
                            </button>
                        </div>
                    ) : (
                        batches.map(batch => (
                            <div
                                key={batch.id}
                                className={`bi-batch-card ${selectedBatch?.id === batch.id ? 'bi-batch-card--active' : ''}`}
                                onClick={() => setSelectedBatch(batch)}
                            >
                                <div className="bi-batch-card__header">
                                    <span className="bi-batch-card__name">{batch.batch_name}</span>
                                    <span className="bi-batch-card__type">{batchTypeLabels[batch.batch_type] || batch.batch_type}</span>
                                </div>
                                <div className="bi-batch-card__count">
                                    {batch.total_quantity} 件
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </section>

            {selectedBatch && (
                <section className="bi-inbound-section">
                    <div className="bi-section-header">
                        <h3 className="bi-section-title">入库物资</h3>
                        <div className="bi-total-badge">
                            共 <strong>{totalQuantity}</strong> 件
                        </div>
                    </div>

                    <div className="bi-items-list">
                        <div className="bi-items-header">
                            <span className="bi-items-header__col" style={{ width: '15%' }}>物资类型</span>
                            <span className="bi-items-header__col" style={{ width: '20%' }}>类别</span>
                            <span className="bi-items-header__col" style={{ width: '12%' }}>尺码</span>
                            <span className="bi-items-header__col" style={{ width: '10%' }}>数量</span>
                            <span className="bi-items-header__col" style={{ width: '8%' }}></span>
                        </div>

                        {inboundItems.map((item, index) => (
                            <div key={index} className="bi-item-row">
                                <span className="bi-item-row__num">{index + 1}</span>
                                <div className="bi-item-row__fields">
                                    <select
                                        className="input bi-item-row__select"
                                        value={item.itemType}
                                        onChange={(e) => updateItem(index, 'itemType', e.target.value)}
                                    >
                                        <option value="clothing">服装</option>
                                        <option value="medal">奖牌</option>
                                        <option value="bag">背包</option>
                                    </select>
                                    <input
                                        className="input"
                                        placeholder="如：T恤、夹克"
                                        value={item.itemCategory}
                                        onChange={(e) => updateItem(index, 'itemCategory', e.target.value)}
                                    />
                                    <select
                                        className="input bi-item-row__select"
                                        value={item.itemSpec.size}
                                        onChange={(e) => updateItem(index, 'itemSpec.size', e.target.value)}
                                    >
                                        {['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'].map(size => (
                                            <option key={size} value={size}>{size}</option>
                                        ))}
                                    </select>
                                    <input
                                        className="input bi-item-row__num-input"
                                        type="number"
                                        min="1"
                                        value={item.quantity}
                                        onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                                    />
                                    <button
                                        className="btn btn--ghost btn--sm"
                                        onClick={() => removeItemRow(index)}
                                        disabled={inboundItems.length === 1}
                                    >
                                        <Icon name="trash" size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="bi-actions">
                        <button className="btn btn--secondary" onClick={addItemRow}>
                            <Icon name="plus" size={16} /> 添加一行
                        </button>
                        <div className="bi-actions__primary">
                            {selectedWarehouseId && (
                                <button className="btn btn--ghost" onClick={goTwinBinding}>
                                    入库后去 {selectedWarehouse?.name || '该仓库'} 绑定
                                </button>
                            )}
                            <button
                                className="btn btn--primary btn--large"
                                onClick={handleBatchInbound}
                                disabled={submitting}
                            >
                                {submitting ? '入库中...' : '确认入库'}
                            </button>
                        </div>
                    </div>
                </section>
            )}

            <style>{`
                .bi-header {
                    margin-bottom: var(--spacing-xl);
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: var(--spacing-md);
                }
                .bi-header__actions,
                .bi-warehouse-banner__actions,
                .bi-actions__primary {
                    display: flex;
                    gap: var(--spacing-sm);
                    flex-wrap: wrap;
                    align-items: center;
                }
                .bi-warehouse-banner {
                    background:
                        linear-gradient(rgba(216, 38, 44, 0.04) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(216, 38, 44, 0.04) 1px, transparent 1px),
                        linear-gradient(180deg, color-mix(in srgb, var(--surface) 95%, transparent), var(--surface));
                    background-size: 18px 18px, 18px 18px, auto;
                    border: 1px solid var(--border);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-lg);
                    display: flex;
                    justify-content: space-between;
                    gap: var(--spacing-lg);
                    margin-bottom: var(--spacing-xl);
                    align-items: center;
                }
                .bi-warehouse-banner__eyebrow {
                    display: inline-flex;
                    padding: 4px 10px;
                    border-radius: var(--radius-sm);
                    background: var(--accent-soft);
                    color: var(--accent);
                    border: 1px solid var(--border-accent);
                    font-size: var(--font-size-xs);
                    font-weight: 700;
                    margin-bottom: var(--spacing-xs);
                }
                .bi-warehouse-banner p {
                    margin: var(--spacing-xs) 0 0;
                    color: var(--text-secondary);
                    font-size: var(--font-size-sm);
                }
                .bi-batch-section, .bi-inbound-section {
                    background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, transparent), var(--surface));
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-lg);
                    box-shadow: var(--shadow-sm);
                    margin-bottom: var(--spacing-xl);
                    border: 1px solid var(--border);
                }
                .bi-result-banner {
                    background:
                        linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
                        linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(28, 25, 23, 0.96));
                    background-size: 18px 18px, 18px 18px, auto;
                    color: rgba(255, 255, 255, 0.92);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-lg);
                    display: flex;
                    justify-content: space-between;
                    gap: var(--spacing-lg);
                    align-items: center;
                    margin-bottom: var(--spacing-xl);
                }
                .bi-result-banner__eyebrow {
                    display: inline-flex;
                    padding: 4px 10px;
                    border-radius: var(--radius-sm);
                    background: rgba(255, 255, 255, 0.08);
                    color: rgba(255, 255, 255, 0.92);
                    font-size: var(--font-size-xs);
                    font-weight: 700;
                    margin-bottom: var(--spacing-xs);
                }
                .bi-result-banner p {
                    margin: var(--spacing-xs) 0 0;
                    color: rgba(255, 255, 255, 0.68);
                    font-size: var(--font-size-sm);
                }
                .bi-result-banner__meta {
                    display: flex;
                    gap: var(--spacing-sm);
                    align-items: center;
                    flex-wrap: wrap;
                }
                .bi-result-badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 6px 12px;
                    border-radius: var(--radius-sm);
                    background: rgba(255, 255, 255, 0.12);
                    color: rgba(255, 255, 255, 0.9);
                    font-size: var(--font-size-xs);
                    font-weight: 700;
                }
                .bi-section-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--spacing-md);
                }
                .bi-section-title {
                    margin: 0;
                    font-size: var(--font-size-lg);
                }
                .bi-total-badge {
                    background: var(--bg-secondary);
                    padding: var(--spacing-xs) var(--spacing-md);
                    border-radius: var(--radius-sm);
                    font-size: var(--font-size-sm);
                }
                .bi-create-form {
                    background: var(--bg-secondary);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-md);
                }
                .bi-create-form__fields {
                    display: grid;
                    grid-template-columns: 2fr 1fr 1fr;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-md);
                }
                .bi-create-form__actions {
                    display: flex;
                    gap: var(--spacing-sm);
                }
                .bi-batch-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: var(--spacing-md);
                }
                .bi-batch-card {
                    border: 1px solid var(--border);
                    border-radius: var(--radius-md);
                    padding: var(--spacing-md);
                    cursor: pointer;
                    transition: all 0.15s ease;
                    background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 96%, transparent), var(--surface));
                }
                .bi-batch-card:hover {
                    border-color: var(--accent);
                }
                .bi-batch-card--active {
                    border-color: var(--accent);
                    background: var(--accent-soft);
                }
                .bi-batch-card__header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: var(--spacing-xs);
                }
                .bi-batch-card__name {
                    font-weight: 600;
                }
                .bi-batch-card__type {
                    font-size: var(--font-size-xs);
                    color: var(--text-secondary);
                    background: var(--bg-secondary);
                    padding: 2px 8px;
                    border-radius: var(--radius-sm);
                }
                .bi-batch-card__count {
                    font-size: var(--font-size-sm);
                    color: var(--text-secondary);
                }
                .bi-empty-batch {
                    grid-column: 1 / -1;
                    text-align: center;
                    padding: var(--spacing-xl);
                    color: var(--text-secondary);
                }
                .bi-items-list {
                    margin-bottom: var(--spacing-md);
                }
                .bi-items-header {
                    display: flex;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) var(--spacing-md);
                    font-size: var(--font-size-xs);
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .bi-item-row {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) 0;
                    border-bottom: 1px solid var(--border);
                }
                .bi-item-row:last-child {
                    border-bottom: none;
                }
                .bi-item-row__num {
                    width: 24px;
                    height: 24px;
                    background: var(--bg-secondary);
                    border-radius: var(--radius-sm);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: var(--font-size-xs);
                    font-weight: 600;
                    color: var(--text-secondary);
                    flex-shrink: 0;
                }
                .bi-item-row__fields {
                    flex: 1;
                    display: flex;
                    gap: var(--spacing-sm);
                    align-items: center;
                }
                .bi-item-row__select {
                    min-width: 100px;
                }
                .bi-item-row__num-input {
                    width: 80px;
                }
                .bi-actions {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-top: var(--spacing-md);
                    border-top: 1px solid var(--border);
                }
                .bi-actions .btn {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                }
                @media (max-width: 768px) {
                    .bi-header,
                    .bi-warehouse-banner,
                    .bi-result-banner,
                    .bi-actions {
                        flex-direction: column;
                        align-items: stretch;
                    }
                    .bi-create-form__fields {
                        grid-template-columns: 1fr;
                    }
                    .bi-items-header {
                        display: none;
                    }
                    .bi-item-row__fields {
                        flex-wrap: wrap;
                    }
                    .bi-item-row__fields .input {
                        flex: 1;
                        min-width: 120px;
                    }
                }
            `}</style>
        </div>
    )
}

function Icon({ name, size = 20 }) {
    const icons = {
        plus: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
        ),
        trash: (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
        ),
    }
    return icons[name] || null
}

export default BatchInbound

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { appInventoryApi } from '../../services/inventoryApi'
import { showError, showSuccess, showWarning } from '../../utils/toast'
import { useInventorySurface } from './useInventorySurface'

function printQrItems(items) {
    const closeScriptTag = '</scr' + 'ipt>'
    const blocks = items.map((item) => `
        <div class="qr-item">
            <div class="qr-code" id="qr-${item.id}"></div>
            <div class="qr-label">${item.qrCode}</div>
            <div class="qr-meta">${item.meta || ''}</div>
        </div>
    `).join('')

    const script = items.map((item) => `
        (function() {
            var qr = qrcode(0, 'M');
            qr.addData('${item.href}');
            qr.make();
            document.getElementById('qr-${item.id}').innerHTML = qr.createImgTag(3);
        })();
    `).join('')

    const printWindow = window.open('', '_blank')
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>二维码打印</title>
            <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js">${closeScriptTag}
            <style>
                @page { size: A4; margin: 10mm; }
                body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; }
                .qr-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
                .qr-item { text-align: center; page-break-inside: avoid; padding: 8px; border: 1px solid #eee; border-radius: 10px; }
                .qr-code { width: 80px; height: 80px; margin: 0 auto 4px; }
                .qr-label { font-size: 10px; font-family: monospace; word-break: break-all; }
                .qr-meta { font-size: 9px; color: #666; margin-top: 2px; min-height: 24px; }
            </style>
        </head>
        <body>
            <div class="qr-grid">${blocks}</div>
            <script>${script}${closeScriptTag}
        </body>
        </html>
    `)
    printWindow.document.close()

    return new Promise((resolve) => {
        printWindow.onload = () => {
            printWindow.print()
            resolve()
        }
    })
}

function buildLegacyMeta(unit) {
    const spec = unit.item_spec ? (typeof unit.item_spec === 'string' ? JSON.parse(unit.item_spec) : unit.item_spec) : {}
    return `${spec.size || ''} ${spec.gender === 'M' ? '男' : spec.gender === 'F' ? '女' : ''}`.trim()
}

export default function QRCodePrinter({ inventoryApi = appInventoryApi }) {
    const { batch: batchApi, twin: twinApi, unit: unitApi } = inventoryApi
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const selectedOrgId = searchParams.get('orgId')
    const { buildHref } = useInventorySurface()

    const [mode, setMode] = useState('units')
    const [batches, setBatches] = useState([])
    const [units, setUnits] = useState([])
    const [twinWarehouses, setTwinWarehouses] = useState([])
    const [twinLocations, setTwinLocations] = useState([])
    const [selectedBatch, setSelectedBatch] = useState(null)
    const [selectedTwinWarehouseId, setSelectedTwinWarehouseId] = useState('')
    const [selectedUnits, setSelectedUnits] = useState([])
    const [selectedLocations, setSelectedLocations] = useState([])
    const [loading, setLoading] = useState(true)
    const [printing, setPrinting] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')

    useEffect(() => {
        Promise.all([
            batchApi.getBatches(selectedOrgId ? { orgId: selectedOrgId } : {}),
            twinApi.getWarehouses(selectedOrgId),
        ])
            .then(([batchRes, warehouseRes]) => {
                setBatches(batchRes.data || [])
                const warehouses = warehouseRes.data || []
                setTwinWarehouses(warehouses)
                if (warehouses[0]) setSelectedTwinWarehouseId(String(warehouses[0].id))
            })
            .catch((err) => showError(`加载打印数据失败：${err.message}`))
            .finally(() => setLoading(false))
    }, [batchApi, selectedOrgId, twinApi])

    useEffect(() => {
        if (!selectedTwinWarehouseId) {
            setTwinLocations([])
            return
        }
        twinApi.getLocations({ warehouseId: selectedTwinWarehouseId }, selectedOrgId)
            .then((res) => setTwinLocations(res.data || []))
            .catch((err) => showError(`加载库位二维码失败：${err.message}`))
    }, [selectedTwinWarehouseId, selectedOrgId, twinApi])

    const loadUnits = async (batchId) => {
        try {
            const params = selectedOrgId ? { orgId: selectedOrgId, batchId, limit: 500 } : { batchId, limit: 500 }
            const result = await unitApi.getUnits(params)
            setUnits(result.data || [])
            setSelectedUnits([])
            setSearchQuery('')
        } catch {
            showError('加载物资失败')
        }
    }

    const filteredUnits = useMemo(() => units.filter((unit) => {
        if (!searchQuery) return true
        const query = searchQuery.toLowerCase()
        return unit.qr_code.toLowerCase().includes(query) || unit.item_type?.toLowerCase().includes(query) || buildLegacyMeta(unit).toLowerCase().includes(query)
    }), [units, searchQuery])

    const filteredLocations = useMemo(() => twinLocations.filter((location) => {
        if (!searchQuery) return true
        const query = searchQuery.toLowerCase()
        return String(location.code || '').toLowerCase().includes(query) || String(location.qr_code || '').toLowerCase().includes(query)
    }), [twinLocations, searchQuery])

    const selectedWarehouse = twinWarehouses.find((item) => String(item.id) === String(selectedTwinWarehouseId))

    const toggleSelection = (collection, setter, id) => {
        setter(collection.includes(id) ? collection.filter((item) => item !== id) : [...collection, id])
    }

    const toggleSelectAll = () => {
        if (mode === 'units') {
            setSelectedUnits(selectedUnits.length === filteredUnits.length ? [] : filteredUnits.map((unit) => unit.id))
            return
        }
        setSelectedLocations(selectedLocations.length === filteredLocations.length ? [] : filteredLocations.map((location) => location.id))
    }

    const handlePrint = async () => {
        const printItems = mode === 'units'
            ? units.filter((unit) => selectedUnits.includes(unit.id)).map((unit) => ({
                id: unit.id,
                qrCode: unit.qr_code,
                meta: buildLegacyMeta(unit),
                href: `${window.location.origin}/ops/scan?t=${btoa(unit.qr_code)}`,
            }))
            : twinLocations.filter((location) => selectedLocations.includes(location.id)).map((location) => ({
                id: location.id,
                qrCode: location.qr_code,
                meta: `${location.code}${selectedWarehouse ? ` · ${selectedWarehouse.name}` : ''}`,
                href: `${window.location.origin}${buildHref('/inventory/space', {
                    orgId: selectedOrgId,
                    params: {
                        tab: 'bind',
                        warehouseId: selectedTwinWarehouseId,
                        locationQr: location.qr_code,
                    },
                })}`,
            }))

        if (printItems.length === 0) {
            showWarning(mode === 'units' ? '请选择要打印的物资' : '请选择要打印的库位')
            return
        }

        try {
            setPrinting(true)
            await printQrItems(printItems)
            showSuccess(`已发送 ${printItems.length} 个二维码到打印`)
        } finally {
            setPrinting(false)
        }
    }

    const selectionCount = mode === 'units' ? selectedUnits.length : selectedLocations.length
    const filteredCount = mode === 'units' ? filteredUnits.length : filteredLocations.length

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
        <div className="warehouse-nested-page qp-page">
            <header className="qp-header">
                <div>
                    <h1 className="page-title">二维码打印</h1>
                    <p className="page-subtitle">现在既能打印旧物资二维码，也能打印数字孪生库位二维码，方便阶段一的扫码绑定落地。</p>
                </div>
                <div className="qp-header__actions">
                    <button
                        className="btn btn--ghost"
                        onClick={() => navigate(buildHref('/inventory/space', { orgId: selectedOrgId, params: { tab: 'bind' } }))}
                    >
                        去库位绑定
                    </button>
                </div>
            </header>

            <section className="qp-mode-switch">
                <button className={`qp-mode-switch__item ${mode === 'units' ? 'qp-mode-switch__item--active' : ''}`} onClick={() => setMode('units')}>
                    物资二维码
                </button>
                <button className={`qp-mode-switch__item ${mode === 'locations' ? 'qp-mode-switch__item--active' : ''}`} onClick={() => setMode('locations')}>
                    库位二维码
                </button>
            </section>

            {mode === 'units' ? (
                <section className="qp-panel">
                    <h3 className="qp-section-title">选择批次</h3>
                    <div className="qp-batch-grid">
                        {batches.length === 0 ? (
                            <div className="qp-empty">暂无批次</div>
                        ) : (
                            batches.map((batch) => (
                                <button key={batch.id} className={`qp-card ${selectedBatch?.id === batch.id ? 'qp-card--active' : ''}`} onClick={() => {
                                    setSelectedBatch(batch)
                                    loadUnits(batch.id)
                                }}>
                                    <strong>{batch.batch_name}</strong>
                                    <span>{batch.total_quantity} 件</span>
                                </button>
                            ))
                        )}
                    </div>
                </section>
            ) : (
                <section className="qp-panel">
                    <div className="qp-panel__header">
                        <h3 className="qp-section-title">选择仓库与库位</h3>
                        <button
                            className="btn btn--ghost btn--sm"
                            onClick={() => navigate(buildHref('/inventory/space', { orgId: selectedOrgId, params: { warehouseId: selectedTwinWarehouseId, tab: 'viewer' } }))}
                        >
                            打开 3D 查看
                        </button>
                    </div>
                    <select className="input qp-warehouse-select" value={selectedTwinWarehouseId} onChange={(event) => {
                        setSelectedTwinWarehouseId(event.target.value)
                        setSelectedLocations([])
                    }}>
                        <option value="">请选择仓库</option>
                        {twinWarehouses.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.name} · {warehouse.code}
                            </option>
                        ))}
                    </select>
                </section>
            )}

            {(mode === 'units' ? selectedBatch : selectedTwinWarehouseId) && (
                <section className="qp-panel">
                    <div className="qp-toolbar">
                        <input
                            className="input qp-search"
                            placeholder={mode === 'units' ? '搜索物资二维码...' : '搜索库位编码或二维码...'}
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                        />
                        <label className="qp-select-all">
                            <input
                                type="checkbox"
                                checked={selectionCount === filteredCount && filteredCount > 0}
                                onChange={toggleSelectAll}
                            />
                            <span>全选</span>
                        </label>
                        <button className="btn btn--primary" onClick={handlePrint} disabled={printing || selectionCount === 0}>
                            {printing ? '打印中...' : `打印 (${selectionCount})`}
                        </button>
                    </div>

                    <div className="qp-grid">
                        {(mode === 'units' ? filteredUnits : filteredLocations).map((item) => {
                            const isUnit = mode === 'units'
                            const id = item.id
                            const isSelected = isUnit ? selectedUnits.includes(id) : selectedLocations.includes(id)
                            const title = isUnit ? item.qr_code : item.code
                            const meta = isUnit ? buildLegacyMeta(item) : item.qr_code
                            return (
                                <button
                                    key={id}
                                    className={`qp-card qp-card--selectable ${isSelected ? 'qp-card--active' : ''}`}
                                    onClick={() => toggleSelection(isUnit ? selectedUnits : selectedLocations, isUnit ? setSelectedUnits : setSelectedLocations, id)}
                                >
                                    <strong>{title}</strong>
                                    <span>{meta}</span>
                                </button>
                            )
                        })}
                    </div>

                    {filteredCount === 0 && <div className="qp-empty">{searchQuery ? '未找到匹配项' : mode === 'units' ? '该批次暂无物资' : '该仓库暂无库位'}</div>}
                </section>
            )}

            <style>{`
                .qp-header,.qp-header__actions,.qp-toolbar,.qp-mode-switch{display:flex;gap:12px;flex-wrap:wrap}
                .qp-header{justify-content:space-between;align-items:flex-start;margin-bottom:24px}
                .qp-mode-switch{margin-bottom:18px}
                .qp-mode-switch__item{border:1px solid var(--border);background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 96%,transparent),var(--surface));padding:10px 14px;border-radius:var(--radius-md);cursor:pointer;font-weight:700}
                .qp-mode-switch__item--active{background:linear-gradient(180deg,color-mix(in srgb,var(--accent-soft) 86%,var(--surface) 14%),var(--surface));border-color:var(--accent);color:var(--accent);box-shadow:inset 0 0 0 1px var(--border-accent)}
                .qp-panel{background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 97%,transparent),var(--surface)),var(--grid-pattern);background-size:auto,20px 20px;border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--spacing-lg);box-shadow:var(--shadow-sm);margin-bottom:var(--spacing-xl)}
                .qp-panel__header{display:flex;justify-content:space-between;gap:var(--spacing-md);align-items:center;margin-bottom:var(--spacing-md)}
                .qp-section-title{margin:0 0 var(--spacing-md);font-size:var(--font-size-lg);font-family:var(--font-headline);letter-spacing:.04em;text-transform:uppercase}
                .qp-batch-grid,.qp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
                .qp-card{border:1px solid var(--border);border-radius:var(--radius-md);padding:14px;background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 96%,transparent),var(--surface));text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:6px;box-shadow:var(--shadow-xs)}
                .qp-card span{font-size:12px;color:var(--text-secondary);word-break:break-all}
                .qp-card--active{border-color:var(--accent);background:linear-gradient(180deg,color-mix(in srgb,var(--accent-soft) 72%,var(--surface) 28%),var(--surface));box-shadow:inset 0 0 0 1px var(--border-accent)}
                .qp-card--selectable{min-height:88px}
                .qp-toolbar{justify-content:space-between;align-items:center;margin-bottom:var(--spacing-md)}
                .qp-search{min-width:260px}
                .qp-warehouse-select{max-width:360px}
                .qp-select-all{display:flex;align-items:center;gap:6px;font-size:13px}
                .qp-empty{text-align:center;padding:var(--spacing-xl);color:var(--text-secondary)}
                @media (max-width:768px){.qp-header,.qp-toolbar,.qp-panel__header{flex-direction:column;align-items:stretch}.qp-search,.qp-warehouse-select{max-width:none;min-width:0;width:100%}}
            `}</style>
        </div>
    )
}

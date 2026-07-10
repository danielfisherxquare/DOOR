import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { appInventoryApi } from '../../services/inventoryApi'
import { showError, showSuccess } from '../../utils/toast'
import './PreInboundManager.css'
import { useInventorySurface } from './useInventorySurface'

const STAGES = [
    { key: 'pending', label: '待定', short: '待' },
    { key: 'confirmed', label: '确定', short: '定' },
    { key: 'communication', label: '沟通', short: '沟' },
    { key: 'ordered', label: '下单', short: '单' },
    { key: 'sampling', label: '打样', short: '样' },
    { key: 'production', label: '制作', short: '制' },
    { key: 'shipped', label: '发货', short: '发' },
    { key: 'logistics', label: '物流', short: '流' },
    { key: 'arrived', label: '到货', short: '到' },
    { key: 'inbound', label: '入库', short: '入' },
]

const PRIORITIES = [
    { value: '', label: '全部优先级' },
    { value: 'normal', label: '常规' },
    { value: 'high', label: '加急' },
    { value: 'urgent', label: '特急' },
]

const ITEM_TYPES = [
    { value: 'clothing', label: '服装' },
    { value: 'medal', label: '奖牌' },
    { value: 'bag', label: '背包' },
    { value: 'bib', label: '号码布' },
    { value: 'other', label: '其他' },
]

const PRIORITY_LABELS = { normal: '常规', high: '加急', urgent: '特急' }
const STAGE_LABELS = Object.fromEntries(STAGES.map((stage) => [stage.key, stage.label]))
const EMPTY_FORM = { itemName: '', itemType: 'clothing', itemCategory: '', plannedQuantity: 100, confirmedQuantity: 100, supplier: '', ownerName: '', contactName: '', contactPhone: '', expectedArrivalDate: '', priority: 'normal', remarks: '' }

function getStageIndex(stage) { return STAGES.findIndex((item) => item.key === stage) }
function getNextStage(stage) { const index = getStageIndex(stage); return index < 0 || index >= STAGES.length - 1 ? null : STAGES[index + 1] }
function getItemTypeLabel(type) { return ITEM_TYPES.find((item) => item.value === type)?.label || type || '未分类' }
function formatDate(value) { if (!value) return '未设置'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) }
function formatDateTime(value) { if (!value) return '刚刚'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
function isOverdue(item) { if (!item?.expected_arrival_date || ['arrived', 'inbound'].includes(item.current_stage)) return false; const deadline = new Date(item.expected_arrival_date); const today = new Date(); today.setHours(0, 0, 0, 0); return deadline < today }
function buildFormData(item) { if (!item) return EMPTY_FORM; return { itemName: item.item_name || '', itemType: item.item_type || 'clothing', itemCategory: item.item_category || '', plannedQuantity: item.planned_quantity || 0, confirmedQuantity: item.confirmed_quantity || item.planned_quantity || 0, supplier: item.supplier || '', ownerName: item.owner_name || '', contactName: item.contact_name || '', contactPhone: item.contact_phone || '', expectedArrivalDate: item.expected_arrival_date ? String(item.expected_arrival_date).slice(0, 10) : '', priority: item.priority || 'normal', remarks: item.remarks || '' } }
function formatAction(log) { if (log.action_type === 'created') return `创建流程单 · ${STAGE_LABELS[log.to_stage] || '待定'}`; if (log.action_type === 'updated') return '更新基础信息'; if (log.action_type === 'note_added') return `记录备注 · ${STAGE_LABELS[log.to_stage] || '当前阶段'}`; if (log.action_type === 'stage_changed') return `${STAGE_LABELS[log.from_stage] || '未开始'} -> ${STAGE_LABELS[log.to_stage] || '下一步'}`; return log.action_type }

function StageRail({ currentStage }) {
    return (
        <section className="pi-rail">
            <div className="pi-rail__line" />
            {STAGES.map((stage) => {
                const currentIndex = getStageIndex(currentStage)
                const targetIndex = getStageIndex(stage.key)
                const state = currentStage ? (targetIndex < currentIndex ? 'done' : targetIndex === currentIndex ? 'current' : 'todo') : 'idle'
                const text = state === 'done' ? '已完成' : state === 'current' ? '当前' : state === 'idle' ? '待选择' : '待推进'
                return (
                    <article key={stage.key} className={`pi-stage ${state}`}>
                        <div className="pi-stage__dot">{stage.short}</div>
                        <div className="pi-stage__copy">
                            <span>{stage.label}</span>
                            <strong>{text}</strong>
                        </div>
                    </article>
                )
            })}
        </section>
    )
}

function EditModal({ editingItem, formData, saving, setFormData, onClose, onSubmit }) {
    return (
        <div className="pi-modal" onClick={() => !saving && onClose()}>
            <form className="pi-modal__dialog" onClick={(event) => event.stopPropagation()} onSubmit={onSubmit}>
                <div className="pi-modal__header">
                    <div>
                        <h3>{editingItem ? '编辑流程单' : '新建流程单'}</h3>
                        <p>录入一条待维护的物资链路，后续在主看板里持续手工推进。</p>
                    </div>
                    <button type="button" className="pi-modal__close" onClick={() => !saving && onClose()}>×</button>
                </div>
                <div className="pi-modal__body pi-form-grid">
                    <label className="pi-field"><span>物资名称</span><input className="input" value={formData.itemName} onChange={(event) => setFormData((prev) => ({ ...prev, itemName: event.target.value }))} /></label>
                    <label className="pi-field"><span>物资类型</span><select className="input" value={formData.itemType} onChange={(event) => setFormData((prev) => ({ ...prev, itemType: event.target.value }))}>{ITEM_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
                    <label className="pi-field"><span>类别 / 款式</span><input className="input" value={formData.itemCategory} onChange={(event) => setFormData((prev) => ({ ...prev, itemCategory: event.target.value }))} /></label>
                    <label className="pi-field"><span>计划数量</span><input className="input" type="number" min="0" value={formData.plannedQuantity} onChange={(event) => setFormData((prev) => ({ ...prev, plannedQuantity: event.target.value }))} /></label>
                    <label className="pi-field"><span>确认数量</span><input className="input" type="number" min="0" value={formData.confirmedQuantity} onChange={(event) => setFormData((prev) => ({ ...prev, confirmedQuantity: event.target.value }))} /></label>
                    <label className="pi-field"><span>优先级</span><select className="input" value={formData.priority} onChange={(event) => setFormData((prev) => ({ ...prev, priority: event.target.value }))}>{PRIORITIES.filter((item) => item.value).map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}</select></label>
                    <label className="pi-field"><span>供应商</span><input className="input" value={formData.supplier} onChange={(event) => setFormData((prev) => ({ ...prev, supplier: event.target.value }))} /></label>
                    <label className="pi-field"><span>负责人</span><input className="input" value={formData.ownerName} onChange={(event) => setFormData((prev) => ({ ...prev, ownerName: event.target.value }))} /></label>
                    <label className="pi-field"><span>联系人</span><input className="input" value={formData.contactName} onChange={(event) => setFormData((prev) => ({ ...prev, contactName: event.target.value }))} /></label>
                    <label className="pi-field"><span>联系电话</span><input className="input" value={formData.contactPhone} onChange={(event) => setFormData((prev) => ({ ...prev, contactPhone: event.target.value }))} /></label>
                    <label className="pi-field"><span>预计到货</span><input className="input" type="date" value={formData.expectedArrivalDate} onChange={(event) => setFormData((prev) => ({ ...prev, expectedArrivalDate: event.target.value }))} /></label>
                    <label className="pi-field pi-field--full"><span>补充说明</span><textarea className="input pi-field__textarea" value={formData.remarks} onChange={(event) => setFormData((prev) => ({ ...prev, remarks: event.target.value }))} /></label>
                </div>
                <div className="pi-modal__footer">
                    <button type="button" className="btn btn--ghost" disabled={saving} onClick={onClose}>取消</button>
                    <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? '保存中...' : editingItem ? '保存修改' : '创建流程单'}</button>
                </div>
            </form>
        </div>
    )
}

export default function PreInboundManager({ inventoryApi = appInventoryApi }) {
    const preInboundApi = inventoryApi.preInbound
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const selectedOrgId = searchParams.get('orgId')
    const { buildHref } = useInventorySurface()
    const [filters, setFilters] = useState({ search: '', stage: '', priority: '' })
    const [summary, setSummary] = useState(null)
    const [items, setItems] = useState([])
    const [selectedId, setSelectedId] = useState(null)
    const [detail, setDetail] = useState(null)
    const [logs, setLogs] = useState([])
    const [loading, setLoading] = useState(true)
    const [detailLoading, setDetailLoading] = useState(false)
    const [showForm, setShowForm] = useState(false)
    const [editingItem, setEditingItem] = useState(null)
    const [formData, setFormData] = useState(EMPTY_FORM)
    const [saving, setSaving] = useState(false)
    const [noteDraft, setNoteDraft] = useState('')
    const [submittingAction, setSubmittingAction] = useState(false)

    const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId])
    const nextStage = getNextStage(detail?.current_stage)
    const metrics = useMemo(() => [{ label: '流程单', value: summary?.total || 0 }, { label: '7日内到货', value: summary?.arrivingThisWeek || 0 }, { label: '延期风险', value: summary?.overdue || 0 }, { label: '待手工入库', value: summary?.readyForInbound || 0 }], [summary])

    useEffect(() => { loadBoard() }, [selectedOrgId, filters.search, filters.stage, filters.priority])
    useEffect(() => {
        if (!items.length) {
            setSelectedId(null)
            setDetail(null)
            setLogs([])
            return
        }
        if (selectedId && !items.some((item) => item.id === selectedId)) {
            setSelectedId(null)
            setDetail(null)
            setLogs([])
        }
    }, [items, selectedId])
    useEffect(() => { if (selectedId) loadDetail(selectedId) }, [selectedId, selectedOrgId])

    async function loadBoard() {
        setLoading(true)
        try {
            const [summaryRes, itemsRes] = await Promise.all([preInboundApi.getSummary(selectedOrgId), preInboundApi.getItems({ ...(selectedOrgId ? { orgId: selectedOrgId } : {}), ...(filters.search ? { search: filters.search } : {}), ...(filters.stage ? { stage: filters.stage } : {}), ...(filters.priority ? { priority: filters.priority } : {}) })])
            setSummary(summaryRes.data)
            setItems(itemsRes.data || [])
        } catch (err) {
            showError(`加载入库前流程失败：${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    async function loadDetail(id) {
        if (!id) return
        setDetailLoading(true)
        try {
            const result = await preInboundApi.getItem(id, selectedOrgId)
            setDetail(result.data.item)
            setLogs(result.data.logs || [])
        } catch (err) {
            showError(`加载流程详情失败：${err.message}`)
        } finally {
            setDetailLoading(false)
        }
    }

    function openCreateForm() { setEditingItem(null); setFormData(EMPTY_FORM); setShowForm(true) }
    function openEditForm() { if (!detail) return; setEditingItem(detail); setFormData(buildFormData(detail)); setShowForm(true) }

    async function handleFormSubmit(event) {
        event.preventDefault()
        if (!formData.itemName.trim()) return showError('请先填写物资名称')
        setSaving(true)
        try {
            const payload = { ...formData, plannedQuantity: Number(formData.plannedQuantity) || 0, confirmedQuantity: Number(formData.confirmedQuantity) || 0 }
            const result = editingItem ? await preInboundApi.updateItem(editingItem.id, payload, selectedOrgId) : await preInboundApi.createItem(payload, selectedOrgId)
            showSuccess(editingItem ? '流程单已更新' : '流程单已创建')
            setShowForm(false)
            await loadBoard()
            const nextId = editingItem?.id || result.data.id
            if (nextId) { setSelectedId(nextId); await loadDetail(nextId) }
        } catch (err) {
            showError(`保存失败：${err.message}`)
        } finally {
            setSaving(false)
        }
    }

    async function handleAdvanceStage() {
        if (!detail || !nextStage) return
        setSubmittingAction(true)
        try {
            await preInboundApi.advanceStage(detail.id, nextStage.key, noteDraft, selectedOrgId)
            showSuccess(`已手工更新为“${nextStage.label}”`)
            setNoteDraft('')
            await loadBoard()
            await loadDetail(detail.id)
        } catch (err) {
            showError(`更新状态失败：${err.message}`)
        } finally {
            setSubmittingAction(false)
        }
    }

    async function handleAddNote() {
        if (!detail || !noteDraft.trim()) return showError('请先输入一条备注或沟通记录')
        setSubmittingAction(true)
        try {
            await preInboundApi.addNote(detail.id, noteDraft.trim(), selectedOrgId)
            showSuccess('备注已记录')
            setNoteDraft('')
            await loadBoard()
            await loadDetail(detail.id)
        } catch (err) {
            showError(`记录备注失败：${err.message}`)
        } finally {
            setSubmittingAction(false)
        }
    }

    if (loading) return <div className="warehouse-nested-page warehouse-nested-page--loading"><div className="loading-state"><div className="loading-state__spinner" /><p>加载入库前流程中...</p></div></div>

    return (
        <div className="warehouse-nested-page pi-page">
            <header className="pi-hero">
                <div className="pi-hero__copy">
                    <span className="pi-hero__eyebrow">Pre-Inbound Manual Flow</span>
                    <h1 className="page-title">先选物资，再看整条入库前链路</h1>
                    <p className="page-subtitle">流程链路会一直显示。未点选物资前保持灰白状态，点选后再按完成度上色。</p>
                </div>
                <div className="pi-hero__metrics">{metrics.map((metric) => <div key={metric.label} className="pi-metric"><span>{metric.label}</span><strong>{metric.value}</strong></div>)}</div>
                <div className="pi-hero__actions"><button className="btn btn--ghost" onClick={() => navigate(buildHref('/inventory', { orgId: selectedOrgId }))}>返回总览</button><button className="btn btn--primary" onClick={openCreateForm}>新建流程单</button></div>
            </header>
            <section className="pi-layout">
                <aside className="pi-list">
                    <div className="pi-list__filters">
                        <input className="input" placeholder="搜索物资 / 单号 / 供应商" value={filters.search} onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))} />
                        <div className="pi-list__selects">
                            <select className="input" value={filters.stage} onChange={(event) => setFilters((prev) => ({ ...prev, stage: event.target.value }))}><option value="">全部阶段</option>{STAGES.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select>
                            <select className="input" value={filters.priority} onChange={(event) => setFilters((prev) => ({ ...prev, priority: event.target.value }))}>{PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}</select>
                        </div>
                    </div>
                    <div className="pi-list__count"><strong>{items.length}</strong><span>个物资</span></div>
                    <div className="pi-list__items">
                        {items.length === 0 ? <div className="pi-empty">当前筛选下没有流程单。</div> : items.map((item) => <button key={item.id} className={`pi-item${selectedId === item.id ? ' active' : ''}${isOverdue(item) ? ' risk' : ''}`} onClick={() => setSelectedId(item.id)}><div className="pi-item__top"><span className="pi-item__ref">{item.reference_no}</span><span className={`pi-priority pi-priority--${item.priority || 'normal'}`}>{PRIORITY_LABELS[item.priority] || '常规'}</span></div><strong>{item.item_name}</strong><div className="pi-item__meta"><span>{getItemTypeLabel(item.item_type)}</span><span>{item.confirmed_quantity || item.planned_quantity || 0} 件</span></div><div className="pi-item__meta"><span>{item.supplier || '未填供应商'}</span><span>{formatDate(item.expected_arrival_date)}</span></div><div className="pi-item__stage"><span>当前阶段</span><strong>{STAGE_LABELS[item.current_stage] || item.current_stage}</strong></div></button>)}
                    </div>
                </aside>
                <section className="pi-detail">
                    <StageRail currentStage={detail?.current_stage} />
                    {detailLoading ? <div className="pi-empty">加载当前物资链路中...</div> : !detail || !selectedItem ? <>
                        <div className="pi-empty pi-empty--soft">先从左侧点选一个物资。点选后，这条灰白链路会按照该物资的完成进度变成彩色。</div>
                        <section className="pi-panels pi-panels--disabled">
                            <article className="pi-panel"><div className="pi-panel__header"><h3>物资卡片</h3><span>待选择</span></div><div className="pi-empty pi-empty--soft">点选一个物资后，这里会显示供应商、数量、联系人和补充说明。</div></article>
                            <article className="pi-panel"><div className="pi-panel__header"><h3>手工推进</h3><span>待选择</span></div><div className="pi-empty pi-empty--soft">选中物资后，可以记录备注并把流程推进到下一阶段。</div></article>
                        </section>
                    </> : <>
                        <div className="pi-focus">
                            <div><div className="pi-focus__ref">{detail.reference_no}</div><h2>{detail.item_name}</h2><p>当前物资正在走一条人工维护的入库前流程。你可以在这里更新状态、记录沟通节点，并在确认到货后手工标记入库完成。</p></div>
                            <div className="pi-focus__stats"><div><span>当前阶段</span><strong>{STAGE_LABELS[detail.current_stage] || detail.current_stage}</strong></div><div><span>预计到货</span><strong>{formatDate(detail.expected_arrival_date)}</strong></div><div><span>负责人</span><strong>{detail.owner_name || '未填写'}</strong></div></div>
                            <button className="btn btn--ghost btn--sm" onClick={openEditForm}>编辑资料</button>
                        </div>
                        <section className="pi-panels">
                            <article className="pi-panel"><div className="pi-panel__header"><h3>物资卡片</h3><span>{getItemTypeLabel(detail.item_type)}</span></div><div className="pi-facts"><div><span>计划数量</span><strong>{detail.planned_quantity || 0} 件</strong></div><div><span>确认数量</span><strong>{detail.confirmed_quantity || 0} 件</strong></div><div><span>供应商</span><strong>{detail.supplier || '未填写'}</strong></div><div><span>联系人</span><strong>{detail.contact_name || '未填写'}</strong></div><div><span>联系电话</span><strong>{detail.contact_phone || '未填写'}</strong></div><div><span>优先级</span><strong>{PRIORITY_LABELS[detail.priority] || '常规'}</strong></div></div>{detail.remarks ? <div className="pi-panel__note"><span>补充说明</span><p>{detail.remarks}</p></div> : null}</article>
                            <article className="pi-panel"><div className="pi-panel__header"><h3>手工推进</h3><span>{nextStage ? `下一步：${nextStage.label}` : '已到最终阶段'}</span></div><textarea className="input pi-panel__textarea" placeholder="补充沟通结论、供应商确认、物流节点或到货说明。" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} /><div className="pi-actions"><button className="btn btn--ghost" disabled={submittingAction} onClick={handleAddNote}>仅记录备注</button><button className="btn btn--primary" disabled={submittingAction || !nextStage} onClick={handleAdvanceStage}>{nextStage ? `更新为 ${nextStage.label}` : '无需再推进'}</button></div><p className="pi-actions__hint">入库前流程只做人工状态维护。二维码扫码、批次入库和库位分配仍在正式入库流程中完成。</p></article>
                        </section>
                        <section className="pi-panel"><div className="pi-panel__header"><h3>全链路记录</h3><span>{logs.length} 条动态</span></div>{logs.length === 0 ? <div className="pi-empty pi-empty--soft">还没有动态，先记录第一条沟通或推进状态。</div> : <div className="pi-log">{logs.map((log) => <article key={log.id} className="pi-log__item"><div className="pi-log__line" /><div className="pi-log__content"><div className="pi-log__top"><strong>{formatAction(log)}</strong><span>{formatDateTime(log.created_at)}</span></div>{log.note ? <p>{log.note}</p> : null}</div></article>)}</div>}</section>
                    </>}
                </section>
            </section>
            {showForm ? <EditModal editingItem={editingItem} formData={formData} saving={saving} setFormData={setFormData} onClose={() => setShowForm(false)} onSubmit={handleFormSubmit} /> : null}
        </div>
    )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { appInventoryApi } from '../../services/inventoryApi'
import { showError, showSuccess } from '../../utils/toast'
import StatusPill from '../../components/inventory/StatusPill'
import { useInventorySurface } from './useInventorySurface'

const INITIAL_PLAN = {
    planName: '',
    planType: 'full',
    warehouseId: '',
}

export default function StocktakingManager({ onChange, inventoryApi = appInventoryApi }) {
    const { stocktaking: stocktakingApi, warehouse: warehouseApi } = inventoryApi
    const [searchParams, setSearchParams] = useSearchParams()
    const selectedOrgId = searchParams.get('orgId')
    const selectedPlanId = searchParams.get('planId') || ''
    const { buildHref } = useInventorySurface()
    const [plans, setPlans] = useState([])
    const [warehouses, setWarehouses] = useState([])
    const [records, setRecords] = useState([])
    const [loading, setLoading] = useState(true)
    const [recordsLoading, setRecordsLoading] = useState(false)
    const [showCreatePlan, setShowCreatePlan] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [newPlan, setNewPlan] = useState(INITIAL_PLAN)

    const loadBaseData = useCallback(async () => {
        setLoading(true)
        try {
            const params = selectedOrgId ? { orgId: selectedOrgId } : {}
            const [planResult, warehouseResult] = await Promise.all([
                stocktakingApi.getPlans(params),
                warehouseApi.getWarehouses(selectedOrgId),
            ])
            setPlans(planResult.data || [])
            setWarehouses(warehouseResult.data || [])
        } catch (error) {
            showError(`加载盘点计划失败：${error.message}`)
        } finally {
            setLoading(false)
        }
    }, [selectedOrgId, stocktakingApi, warehouseApi])

    useEffect(() => {
        loadBaseData()
    }, [loadBaseData])

    useEffect(() => {
        if (loading || selectedPlanId || !plans.length) return

        const nextParams = new URLSearchParams(searchParams)
        nextParams.set('planId', String(plans[0].id))
        setSearchParams(nextParams, { replace: true })
    }, [loading, plans, searchParams, selectedPlanId, setSearchParams])

    useEffect(() => {
        if (!selectedPlanId) {
            setRecords([])
            return
        }

        setRecordsLoading(true)
        stocktakingApi.getRecords(selectedPlanId, selectedOrgId)
            .then((result) => setRecords(result.data || []))
            .catch((error) => showError(`加载盘点记录失败：${error.message}`))
            .finally(() => setRecordsLoading(false))
    }, [selectedOrgId, selectedPlanId, stocktakingApi])

    const selectedPlan = useMemo(
        () => plans.find((plan) => String(plan.id) === String(selectedPlanId)) || plans[0] || null,
        [plans, selectedPlanId]
    )

    const warehouseMap = useMemo(
        () => new Map(warehouses.map((warehouse) => [String(warehouse.id), warehouse])),
        [warehouses]
    )

    const inProgressCount = plans.filter((plan) => plan.status === 'in_progress').length
    const completedCount = plans.filter((plan) => plan.status === 'completed').length
    const totalDiff = plans.reduce((sum, plan) => sum + Number(plan.diff_items || 0), 0)

    const handleCreatePlan = async () => {
        if (!newPlan.planName.trim()) {
            showError('请输入计划名称')
            return
        }

        setSubmitting(true)
        try {
            await stocktakingApi.createPlan({
                planName: newPlan.planName.trim(),
                planType: newPlan.planType,
                warehouseId: newPlan.warehouseId || null,
            }, selectedOrgId)
            showSuccess('盘点计划创建成功')
            setShowCreatePlan(false)
            setNewPlan(INITIAL_PLAN)
            await loadBaseData()
            onChange?.()
        } catch (error) {
            showError(`创建计划失败：${error.message}`)
        } finally {
            setSubmitting(false)
        }
    }

    const handlePlanAction = async (action, planId) => {
        setSubmitting(true)
        try {
            if (action === 'start') {
                await stocktakingApi.startPlan(planId, selectedOrgId)
                showSuccess('盘点已开始')
            } else {
                await stocktakingApi.completePlan(planId, selectedOrgId)
                showSuccess('盘点已完成')
            }
            await loadBaseData()
            onChange?.()
        } catch (error) {
            showError(`${action === 'start' ? '开始' : '完成'}盘点失败：${error.message}`)
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <section className="warehouse-panel">
                <div className="loading-state">
                    <div className="loading-state__spinner" />
                    <p>正在同步盘点中心...</p>
                </div>
            </section>
        )
    }

    return (
        <div className="warehouse-inline-stack">
            <section className="warehouse-panel">
                <div className="warehouse-panel__header">
                    <div>
                        <h3>盘点计划池</h3>
                        <div className="warehouse-panel__subtitle">先选计划，再处理差异，不再依赖本地假进度。</div>
                    </div>
                    <button type="button" className="btn btn--primary" onClick={() => setShowCreatePlan((value) => !value)}>
                        {showCreatePlan ? '收起表单' : '新建盘点计划'}
                    </button>
                </div>

                <div className="warehouse-card-grid warehouse-card-grid--triple">
                    <div className="warehouse-stat-tile">
                        <span className="warehouse-stat-tile__label">进行中</span>
                        <strong className="warehouse-stat-tile__value">{inProgressCount}</strong>
                        <span className="warehouse-stat-tile__meta">优先处理已开盘但未完成的任务</span>
                    </div>
                    <div className="warehouse-stat-tile">
                        <span className="warehouse-stat-tile__label">已完成</span>
                        <strong className="warehouse-stat-tile__value">{completedCount}</strong>
                        <span className="warehouse-stat-tile__meta">可回到报表页做复盘</span>
                    </div>
                    <div className="warehouse-stat-tile">
                        <span className="warehouse-stat-tile__label">差异总数</span>
                        <strong className="warehouse-stat-tile__value">{totalDiff}</strong>
                        <span className="warehouse-stat-tile__meta">来自真实盘点记录</span>
                    </div>
                </div>

                {showCreatePlan ? (
                    <div className="warehouse-form-card">
                        <div className="warehouse-form-grid">
                            <label className="warehouse-form-field">
                                <span>计划名称</span>
                                <input
                                    className="input"
                                    placeholder="例如：春季补给仓全面盘点"
                                    value={newPlan.planName}
                                    onChange={(event) => setNewPlan((current) => ({ ...current, planName: event.target.value }))}
                                />
                            </label>
                            <label className="warehouse-form-field">
                                <span>盘点类型</span>
                                <select
                                    className="input"
                                    value={newPlan.planType}
                                    onChange={(event) => setNewPlan((current) => ({ ...current, planType: event.target.value }))}
                                >
                                    <option value="full">全盘</option>
                                    <option value="partial">抽盘</option>
                                    <option value="dynamic">动态盘点</option>
                                </select>
                            </label>
                            <label className="warehouse-form-field">
                                <span>仓库范围</span>
                                <select
                                    className="input"
                                    value={newPlan.warehouseId}
                                    onChange={(event) => setNewPlan((current) => ({ ...current, warehouseId: event.target.value }))}
                                >
                                    <option value="">全部仓库</option>
                                    {warehouses.map((warehouse) => (
                                        <option key={warehouse.id} value={warehouse.id}>
                                            {warehouse.name} · {warehouse.code}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <div className="warehouse-inline-actions">
                            <button type="button" className="btn btn--primary" onClick={handleCreatePlan} disabled={submitting}>
                                创建计划
                            </button>
                            <button type="button" className="btn btn--ghost" onClick={() => setShowCreatePlan(false)}>
                                取消
                            </button>
                        </div>
                    </div>
                ) : null}
            </section>

            <section className="warehouse-split-grid">
                <div className="warehouse-panel">
                    <div className="warehouse-panel__header">
                        <h3>计划列表</h3>
                        <span className="warehouse-panel__subtitle">{plans.length} 个计划</span>
                    </div>

                    {plans.length ? (
                        <div className="warehouse-task-list">
                            {plans.map((plan) => {
                                const progress = plan.total_items > 0
                                    ? Math.round((Number(plan.counted_items || 0) / Number(plan.total_items || 1)) * 100)
                                    : 0

                                return (
                                    <button
                                        key={plan.id}
                                        type="button"
                                        className={`warehouse-task-item ${String(selectedPlan?.id) === String(plan.id) ? 'warehouse-task-item--selected' : ''}`}
                                        onClick={() => {
                                            const nextParams = new URLSearchParams(searchParams)
                                            nextParams.set('planId', String(plan.id))
                                            setSearchParams(nextParams)
                                        }}
                                    >
                                        <div className="warehouse-task-item__top">
                                            <div className="warehouse-task-item__title">{plan.plan_name}</div>
                                            <StatusPill status={plan.status} />
                                        </div>
                                        <div className="warehouse-task-item__meta">
                                            <span>{getPlanTypeLabel(plan.plan_type)}</span>
                                            <span>{warehouseMap.get(String(plan.warehouse_id))?.name || '全部仓库'}</span>
                                            <span>{formatDate(plan.created_at)}</span>
                                        </div>
                                        <div className="warehouse-progress">
                                            <div className="warehouse-progress__label">
                                                <span>进度</span>
                                                <span>{plan.counted_items || 0}/{plan.total_items || 0} · {progress}%</span>
                                            </div>
                                            <div className="warehouse-progress__bar">
                                                <div className="warehouse-progress__fill" style={{ width: `${progress}%` }} />
                                            </div>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="warehouse-empty-state">
                            <strong>还没有盘点计划</strong>
                            <span>先建立一个真实计划，后续差异和异常才能自动串到控制页里。</span>
                        </div>
                    )}
                </div>

                <div className="warehouse-inline-stack">
                    <section className="warehouse-panel">
                        <div className="warehouse-panel__header">
                            <div>
                                <h3>{selectedPlan?.plan_name || '选择一个计划'}</h3>
                                <div className="warehouse-panel__subtitle">
                                    {selectedPlan
                                        ? `${warehouseMap.get(String(selectedPlan.warehouse_id))?.name || '全部仓库'} · ${getPlanTypeLabel(selectedPlan.plan_type)}`
                                        : '从左侧选中一个计划后，查看差异和完成动作。'}
                                </div>
                            </div>
                            {selectedPlan ? <StatusPill status={selectedPlan.status} /> : null}
                        </div>

                        {selectedPlan ? (
                            <>
                                <div className="warehouse-card-grid warehouse-card-grid--triple">
                                    <div className="warehouse-stat-tile">
                                        <span className="warehouse-stat-tile__label">总件数</span>
                                        <strong className="warehouse-stat-tile__value">{selectedPlan.total_items || 0}</strong>
                                        <span className="warehouse-stat-tile__meta">计划启动后自动生成</span>
                                    </div>
                                    <div className="warehouse-stat-tile">
                                        <span className="warehouse-stat-tile__label">已盘件数</span>
                                        <strong className="warehouse-stat-tile__value">{selectedPlan.counted_items || 0}</strong>
                                        <span className="warehouse-stat-tile__meta">来自扫码盘点记录</span>
                                    </div>
                                    <div className="warehouse-stat-tile">
                                        <span className="warehouse-stat-tile__label">差异件数</span>
                                        <strong className="warehouse-stat-tile__value">{selectedPlan.diff_items || 0}</strong>
                                        <span className="warehouse-stat-tile__meta">不匹配记录会累计到这里</span>
                                    </div>
                                </div>

                                <div className="warehouse-inline-actions">
                                    {selectedPlan.status === 'draft' ? (
                                        <button
                                            type="button"
                                            className="btn btn--primary"
                                            onClick={() => handlePlanAction('start', selectedPlan.id)}
                                            disabled={submitting}
                                        >
                                            开始盘点
                                        </button>
                                    ) : null}
                                    {selectedPlan.status === 'in_progress' ? (
                                        <button
                                            type="button"
                                            className="btn btn--primary"
                                            onClick={() => handlePlanAction('complete', selectedPlan.id)}
                                            disabled={submitting}
                                        >
                                            完成盘点
                                        </button>
                                    ) : null}
                                    <Link className="btn btn--ghost" to={buildHref('/inventory/analytics', { orgId: selectedOrgId })}>
                                        去复盘报表
                                    </Link>
                                </div>
                            </>
                        ) : (
                            <div className="warehouse-empty-state">
                                <strong>暂无计划详情</strong>
                                <span>当前机构下还没有可展示的盘点任务。</span>
                            </div>
                        )}
                    </section>

                    <section className="warehouse-panel">
                        <div className="warehouse-panel__header">
                            <h3>盘点记录</h3>
                            <span className="warehouse-panel__subtitle">
                                {recordsLoading ? '加载中...' : `${records.length} 条记录`}
                            </span>
                        </div>

                        {recordsLoading ? (
                            <div className="loading-state">
                                <div className="loading-state__spinner" />
                                <p>正在同步盘点记录...</p>
                            </div>
                        ) : records.length ? (
                            <div className="warehouse-record-table">
                                <div className="warehouse-record-table__head">
                                    <span>二维码</span>
                                    <span>位置</span>
                                    <span>状态</span>
                                    <span>结果</span>
                                </div>
                                {records.slice(0, 12).map((record) => (
                                    <div key={record.id} className="warehouse-record-table__row">
                                        <span>{record.qr_code}</span>
                                        <span>{record.actual_location || record.expected_location || '-'}</span>
                                        <span>{record.actual_status || record.expected_status || '-'}</span>
                                        <span className={record.is_matched === false ? 'warehouse-text-danger' : ''}>
                                            {record.actual_quantity === null ? '待盘' : record.is_matched === false ? '差异' : '一致'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="warehouse-empty-state">
                                <strong>暂无盘点记录</strong>
                                <span>计划开始后系统会自动生成记录，扫码后这里会出现真实进度。</span>
                            </div>
                        )}
                    </section>
                </div>
            </section>
        </div>
    )
}

function getPlanTypeLabel(type) {
    const labelMap = {
        full: '全盘',
        partial: '抽盘',
        dynamic: '动态盘点',
    }
    return labelMap[type] || type || '盘点'
}

function formatDate(value) {
    if (!value) return '-'
    return new Date(value).toLocaleDateString('zh-CN')
}

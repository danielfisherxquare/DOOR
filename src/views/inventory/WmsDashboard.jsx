import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { workbenchApi } from '../../services/inventoryApi'
import { showError } from '../../utils/toast'
import { CommandEmptyState, CommandNotice, ContextRequirementState } from '../../components/command/CommandPrimitives'
import WarehouseWorkbenchShell from '../../components/inventory/workbench/WarehouseWorkbenchShell'
import WarehouseMetricStrip from '../../components/inventory/workbench/WarehouseMetricStrip'
import WarehouseTaskQueue from '../../components/inventory/workbench/WarehouseTaskQueue'
import WarehouseExceptionPanel from '../../components/inventory/workbench/WarehouseExceptionPanel'
import WarehouseDetailDrawer from '../../components/inventory/workbench/WarehouseDetailDrawer'
import { useInventorySurface } from './useInventorySurface'

function formatTrendLabel(point) {
    return point?.date || '-'
}

export default function WmsDashboard() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const selectedOrgId = searchParams.get('orgId')
    const { buildHref } = useInventorySurface()
    const [overview, setOverview] = useState(null)
    const [selectedItem, setSelectedItem] = useState(null)
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] = useState('')

    useEffect(() => {
        if (!selectedOrgId) {
            setOverview(null)
            setSelectedItem(null)
            setLoadError('')
            return
        }

        setLoading(true)
        setLoadError('')
        workbenchApi.getOverview(selectedOrgId)
            .then((result) => setOverview(result.data))
            .catch((err) => {
                setLoadError(err.message)
                showError(`加载仓储作业台失败：${err.message}`)
            })
            .finally(() => setLoading(false))
    }, [selectedOrgId])

    const metricItems = useMemo(() => ([
        { key: 'pendingInbound', label: '待入库', value: overview?.metrics?.pendingInbound || 0, meta: '预入库已到货但还没进入正式入库' },
        { key: 'pendingPutaway', label: '待上架', value: overview?.metrics?.pendingPutaway || 0, meta: '已生成对象但还没落到库位' },
        { key: 'pendingPickup', label: '待领取', value: overview?.metrics?.pendingPickup || 0, meta: '已分配，等待扫码领取' },
        { key: 'stocktakingInProgress', label: '进行中盘点', value: overview?.metrics?.stocktakingInProgress || 0, meta: '先处理正在执行中的盘点任务' },
        { key: 'openAlerts', label: '未处理异常', value: overview?.metrics?.openAlerts || 0, meta: '来自预警与控制链的阻塞项' },
    ]), [overview])

    if (!selectedOrgId) {
        return (
            <ContextRequirementState
                title="先锁定机构，再进入仓储总览"
                description="仓储概览依赖机构上下文。请先在顶部上下文条里选择目标机构，再加载当前机构的仓储负载、异常和作业队列。"
                action={<button className="btn btn--primary" onClick={() => navigate('/app')}>返回应用层</button>}
            />
        )
    }

    return (
        <WarehouseWorkbenchShell
            eyebrow="仓储总览"
            title="仓储作业台"
            summary="今天的待办、异常、流转和未来负载都在这里统一查看，先定位任务，再进入对应作业面。"
            actions={(
                <>
                    <button className="btn btn--ghost" onClick={() => navigate(buildHref('/inventory/inbound', { orgId: selectedOrgId }))}>
                        打开入库中心
                    </button>
                    <button className="btn btn--primary" onClick={() => navigate(buildHref('/inventory/space', { orgId: selectedOrgId, params: { tab: 'bind' } }))}>
                        去库位绑定
                    </button>
                </>
            )}
            metrics={<WarehouseMetricStrip items={metricItems} />}
            main={(
                <>
                    {loading ? <CommandNotice tone="info">正在加载当前机构的仓储概览...</CommandNotice> : null}
                    {loadError ? <CommandNotice tone="danger">仓储概览加载失败：{loadError}</CommandNotice> : null}
                    {!loading && !loadError && !overview ? (
                        <CommandEmptyState
                            title="当前机构暂未生成仓储概览"
                            description="可以先进入入库中心或库位绑定，完成基础配置后再回到总览查看任务负载。"
                            action={<button className="btn btn--primary" onClick={() => navigate(buildHref('/inventory/space', { orgId: selectedOrgId, params: { tab: 'bind' } }))}>去库位绑定</button>}
                            icon="WH"
                        />
                    ) : null}
                    <WarehouseTaskQueue groups={overview?.taskQueues || []} onSelect={setSelectedItem} selectedId={selectedItem?.id} />
                    <section className="warehouse-panel">
                        <div className="warehouse-panel__header">
                            <h3>未来 7 天负载</h3>
                            <span className="warehouse-panel__subtitle">用趋势看入库和出库节奏，而不是只盯总库存</span>
                        </div>
                        <div className="warehouse-task-list">
                            {(overview?.forecast7d || []).map((point) => (
                                <div key={point.date} className="warehouse-task-item" style={{ cursor: 'default' }}>
                                    <div className="warehouse-task-item__top">
                                        <div className="warehouse-task-item__title">{formatTrendLabel(point)}</div>
                                        <span className="warehouse-pill">趋势</span>
                                    </div>
                                    <div className="warehouse-task-item__meta">
                                        <span>入库 {point.inbound || 0}</span>
                                        <span>出库 {point.outbound || 0}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </>
            )}
            side={(
                <>
                    <WarehouseExceptionPanel items={overview?.exceptions || []} onSelect={setSelectedItem} selectedId={selectedItem?.id} />
                    <section className="warehouse-panel">
                        <div className="warehouse-panel__header">
                            <h3>最近流转</h3>
                            <span className="warehouse-panel__subtitle">最近 10 条动作</span>
                        </div>
                        <div className="warehouse-task-list">
                            {(overview?.activityFeed || []).map((item) => (
                                <button key={item.id} type="button" className="warehouse-task-item" onClick={() => setSelectedItem(item)}>
                                    <div className="warehouse-task-item__top">
                                        <div className="warehouse-task-item__title">{item.title}</div>
                                        <span className="warehouse-pill">{item.type}</span>
                                    </div>
                                    <div className="warehouse-task-item__meta">
                                        <span>{item.meta}</span>
                                        <span>{item.updatedAt ? new Date(item.updatedAt).toLocaleString('zh-CN') : '-'}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </section>
                    <section className="warehouse-panel">
                        <div className="warehouse-panel__header">
                            <h3>库容摘要</h3>
                            <span className="warehouse-panel__subtitle">按仓库聚合位置容量</span>
                        </div>
                        <div className="warehouse-task-list">
                            {(overview?.capacitySummary || []).map((item) => (
                                <div key={item.warehouseId} className="warehouse-task-item" style={{ cursor: 'default' }}>
                                    <div className="warehouse-task-item__top">
                                        <div className="warehouse-task-item__title">{item.warehouseName}</div>
                                        <span className="warehouse-pill">{item.locationCount} 位</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                    <WarehouseDetailDrawer item={selectedItem} fallbackTitle="作业提示" fallbackSummary="点选待办或异常后，这里会给出下一步动作入口。" />
                </>
            )}
        />
    )
}

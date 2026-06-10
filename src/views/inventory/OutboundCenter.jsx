import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { workbenchApi } from '../../services/inventoryApi'
import { showError } from '../../utils/toast'
import WarehouseWorkbenchShell from '../../components/inventory/workbench/WarehouseWorkbenchShell'
import WarehouseMetricStrip from '../../components/inventory/workbench/WarehouseMetricStrip'
import WarehouseTaskQueue from '../../components/inventory/workbench/WarehouseTaskQueue'
import WarehouseDetailDrawer from '../../components/inventory/workbench/WarehouseDetailDrawer'
import WarehouseExceptionPanel from '../../components/inventory/workbench/WarehouseExceptionPanel'
import ScanPickup from './ScanPickup'

const TABS = [
    { key: 'pickup', label: '扫码领取' },
    { key: 'transfer', label: '调拨占位' },
]

/**
 * 纯内容组件：只负责内层 tab 切换和内容渲染
 * 供 OPS WarehouseWorkbench 的子模块直接使用，不带任何 Shell
 */
export function OutboundContent({ activeTab = 'pickup', onTabChange }) {
    const tabs = TABS.map((tab) => (
        <button
            key={tab.key}
            type="button"
            className={`warehouse-workbench__tab ${activeTab === tab.key ? 'warehouse-workbench__tab--active' : ''}`}
            onClick={() => onTabChange?.(tab.key)}
        >
            {tab.label}
        </button>
    ))

    let mainContent = <ScanPickup />
    if (activeTab === 'transfer') {
        mainContent = (
            <section className="warehouse-panel">
                <div className="warehouse-panel__header">
                    <h3>库内调拨</h3>
                    <span className="warehouse-panel__subtitle">当前版本先保留占位，避免把未完成能力伪装成可用功能。</span>
                </div>
                <div className="warehouse-panel__subtitle">调拨后端能力暂未开放，本轮先收敛作业路径，后续在这里补上系统指引与扫描流。</div>
            </section>
        )
    }

    return (
        <div className="warehouse-outbound-content">
            <div className="warehouse-workbench__tabs">{tabs}</div>
            {mainContent}
        </div>
    )
}

export default function OutboundCenter() {
    const [searchParams, setSearchParams] = useSearchParams()
    const selectedOrgId = searchParams.get('orgId')
    const activeTab = searchParams.get('tab') || 'pickup'
    const [overview, setOverview] = useState(null)
    const [selectedItem, setSelectedItem] = useState(null)

    useEffect(() => {
        workbenchApi.getOverview(selectedOrgId)
            .then((result) => setOverview(result.data))
            .catch((err) => showError(`加载出库中心失败：${err.message}`))
    }, [selectedOrgId])

    const pickupGroup = overview?.taskQueues?.find((group) => group.key === 'pickup') || { items: [] }
    const metricItems = useMemo(() => ([
        { key: 'pendingPickup', label: '待领取', value: overview?.metrics?.pendingPickup || 0 },
        { key: 'unreadAlerts', label: '未读异常', value: overview?.metrics?.unreadAlerts || 0 },
        { key: 'activityFeed', label: '最近流转', value: overview?.activityFeed?.length || 0 },
    ]), [overview])

    const tabs = TABS.map((tab) => ({
        key: tab.key,
        label: tab.label,
        active: activeTab === tab.key,
        onClick: () => {
                const nextParams = new URLSearchParams(searchParams)
                nextParams.set('tab', tab.key)
                setSearchParams(nextParams)
        },
    }))

    return (
        <WarehouseWorkbenchShell
            eyebrow="出库中心"
            title="出库中心"
            summary="把扫码领取、待领取队列和出库异常放到同一个作业台里，减少扫码员在多个页面之间反复切换。"
            tabs={tabs}
            metrics={<WarehouseMetricStrip items={metricItems} />}
            main={activeTab === 'pickup' ? <ScanPickup /> : (
                <section className="warehouse-panel">
                    <div className="warehouse-panel__header">
                        <h3>库内调拨</h3>
                        <span className="warehouse-panel__subtitle">当前版本先保留占位，避免把未完成能力伪装成可用功能。</span>
                    </div>
                    <div className="warehouse-panel__subtitle">调拨后端能力暂未开放，本轮先收敛作业路径，后续在这里补上系统指引与扫描流。</div>
                </section>
            )}
            side={(
                <>
                    <WarehouseTaskQueue groups={[pickupGroup]} onSelect={setSelectedItem} selectedId={selectedItem?.id} />
                    <WarehouseExceptionPanel items={(overview?.exceptions || []).slice(0, 6)} onSelect={setSelectedItem} selectedId={selectedItem?.id} title="出库相关异常" subtitle="优先看会阻塞领取动作的异常" />
                    <WarehouseDetailDrawer item={selectedItem} fallbackTitle="出库动作提示" fallbackSummary="选中待领取项后，可以直接跳去扫码领取并完成本次出库。" />
                </>
            )}
        />
    )
}

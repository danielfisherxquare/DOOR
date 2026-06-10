import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { workbenchApi } from '../../services/inventoryApi'
import { showError } from '../../utils/toast'
import WarehouseWorkbenchShell from '../../components/inventory/workbench/WarehouseWorkbenchShell'
import WarehouseMetricStrip from '../../components/inventory/workbench/WarehouseMetricStrip'
import WarehouseTaskQueue from '../../components/inventory/workbench/WarehouseTaskQueue'
import WarehouseDetailDrawer from '../../components/inventory/workbench/WarehouseDetailDrawer'
import PreInboundManager from './PreInboundManager'
import BatchInbound from './BatchInbound'
import QRCodePrinter from './QRCodePrinter'
import { useInventorySurface } from './useInventorySurface'

const TABS = [
    { key: 'pre', label: '入库前流程' },
    { key: 'batch', label: '批量入库' },
    { key: 'labels', label: '标签打印' },
]

/**
 * 纯内容组件：只负责内层 tab 切换和内容渲染
 * 供 OPS WarehouseWorkbench 的子模块直接使用，不带任何 Shell
 */
export function InboundContent({ activeTab = 'batch', onTabChange }) {
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

    let mainContent = <BatchInbound />
    if (activeTab === 'pre') mainContent = <PreInboundManager />
    if (activeTab === 'labels') mainContent = <QRCodePrinter />

    return (
        <div className="warehouse-inbound-content">
            <div className="warehouse-workbench__tabs">{tabs}</div>
            {mainContent}
        </div>
    )
}

export default function InboundCenter() {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const selectedOrgId = searchParams.get('orgId')
    const activeTab = searchParams.get('tab') || 'batch'
    const { buildHref } = useInventorySurface()
    const [overview, setOverview] = useState(null)
    const [selectedItem, setSelectedItem] = useState(null)

    useEffect(() => {
        workbenchApi.getOverview(selectedOrgId)
            .then((result) => setOverview(result.data))
            .catch((err) => showError(`加载入库中心摘要失败：${err.message}`))
    }, [selectedOrgId])

    const inboundGroup = overview?.taskQueues?.find((group) => group.key === 'inbound') || { items: [] }
    const metricItems = useMemo(() => ([
        { key: 'pendingInbound', label: '待入库', value: overview?.metrics?.pendingInbound || 0 },
        { key: 'pendingPutaway', label: '待上架', value: overview?.metrics?.pendingPutaway || 0 },
        { key: 'openAlerts', label: '未处理异常', value: overview?.metrics?.openAlerts || 0 },
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

    let mainContent = <BatchInbound />
    if (activeTab === 'pre') mainContent = <PreInboundManager />
    if (activeTab === 'labels') mainContent = <QRCodePrinter />

    return (
        <WarehouseWorkbenchShell
            eyebrow="入库中心"
            title="入库中心"
            summary="把预入库、正式入库和标签打印收回到同一条链路，避免做完一步后回侧栏重新找下一页。"
            actions={(
                <>
                    <button className="btn btn--ghost" onClick={() => navigate(buildHref('/inventory/space', { orgId: selectedOrgId, params: { tab: 'bind' } }))}>
                        去库位绑定
                    </button>
                    <button className="btn btn--primary" onClick={() => navigate(buildHref('/inventory/outbound', { orgId: selectedOrgId }))}>
                        转到出库中心
                    </button>
                </>
            )}
            tabs={tabs}
            metrics={<WarehouseMetricStrip items={metricItems} />}
            main={mainContent}
            side={(
                <>
                    <WarehouseTaskQueue groups={[inboundGroup]} onSelect={setSelectedItem} selectedId={selectedItem?.id} />
                    <WarehouseDetailDrawer item={selectedItem} fallbackTitle="入库动作提示" fallbackSummary="选中待入库项后，可以直接跳到预入库流程或正式入库页继续处理。" />
                </>
            )}
        />
    )
}

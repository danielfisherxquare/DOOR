import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { workbenchApi } from '../../services/inventoryApi'
import { showError } from '../../utils/toast'
import WarehouseWorkbenchShell from '../../components/inventory/workbench/WarehouseWorkbenchShell'
import WarehouseMetricStrip from '../../components/inventory/workbench/WarehouseMetricStrip'
import WarehouseExceptionPanel from '../../components/inventory/workbench/WarehouseExceptionPanel'
import WarehouseDetailDrawer from '../../components/inventory/workbench/WarehouseDetailDrawer'
import StocktakingManager from './StocktakingManager'
import AlertCenter from './AlertCenter'

const TABS = [
    { key: 'count', label: '盘点管理' },
    { key: 'alerts', label: '异常中心' },
]

export default function ControlCenter() {
    const [searchParams, setSearchParams] = useSearchParams()
    const selectedOrgId = searchParams.get('orgId')
    const activeTab = searchParams.get('tab') || 'count'
    const [controlData, setControlData] = useState(null)
    const [selectedItem, setSelectedItem] = useState(null)

    const loadControlData = () => {
        workbenchApi.getControl(selectedOrgId)
            .then((result) => setControlData(result.data))
            .catch((err) => showError(`加载盘点与异常失败：${err.message}`))
    }

    useEffect(() => {
        loadControlData()
    }, [selectedOrgId])

    const metricItems = useMemo(() => ([
        { key: 'inProgress', label: '进行中盘点', value: controlData?.stocktakingSummary?.inProgress || 0 },
        { key: 'diffItems', label: '差异项', value: controlData?.stocktakingSummary?.diffItems || 0 },
        { key: 'unresolved', label: '未解决异常', value: controlData?.alertSummary?.unresolved || 0 },
        { key: 'rules', label: '预警规则', value: controlData?.alertSummary?.rules || 0 },
    ]), [controlData])

    const tabs = TABS.map((tab) => (
        <button
            key={tab.key}
            type="button"
            className={`warehouse-workbench__tab ${activeTab === tab.key ? 'warehouse-workbench__tab--active' : ''}`}
            onClick={() => {
                const nextParams = new URLSearchParams(searchParams)
                nextParams.set('tab', tab.key)
                setSearchParams(nextParams)
            }}
        >
            {tab.label}
        </button>
    ))

    return (
        <WarehouseWorkbenchShell
        eyebrow="仓储作业台"
            title="盘点与异常"
            summary="盘点计划、差异项和预警统一收在控制页里，处理异常时可以直接回到对应作业。"
            tabs={tabs}
            metrics={<WarehouseMetricStrip items={metricItems} />}
            main={activeTab === 'count' ? <StocktakingManager onChange={loadControlData} /> : <AlertCenter onChange={loadControlData} />}
            side={(
                <>
                    <WarehouseExceptionPanel items={controlData?.exceptionList || []} onSelect={setSelectedItem} selectedId={selectedItem?.id} title="异常与差异" subtitle="把预警和盘点差异放进同一个处理池" />
                    <WarehouseDetailDrawer item={selectedItem} fallbackTitle="控制提示" fallbackSummary="选中异常或差异项后，可以直接跳回盘点或异常处理页完成闭环。" />
                </>
            )}
        />
    )
}

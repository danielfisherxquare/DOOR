import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { opsInventoryApi } from '../../services/inventoryApi'
import { showError } from '../../utils/toast'
import WarehouseTaskQueue from '../../components/inventory/workbench/WarehouseTaskQueue'
import WarehouseExceptionPanel from '../../components/inventory/workbench/WarehouseExceptionPanel'
import WarehouseDetailDrawer from '../../components/inventory/workbench/WarehouseDetailDrawer'
import InboundWorkspace from './warehouse/InboundWorkspace'
import OutboundWorkspace from './warehouse/OutboundWorkspace'
import BindingWorkspace from './warehouse/BindingWorkspace'
import CountWorkspace from './warehouse/CountWorkspace'

const AREA_TABS = [
    { key: 'inbound', label: '入库作业' },
    { key: 'outbound', label: '出库作业' },
    { key: 'binding', label: '库位绑定' },
    { key: 'count', label: '盘点作业' },
]

const workbenchApi = opsInventoryApi.workbench

export default function WarehouseWorkbench() {
    const location = useLocation()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const selectedOrgId = searchParams.get('orgId')
    const pathSegments = location.pathname.split('/').filter(Boolean)
    const routeArea = pathSegments[pathSegments.length - 1]
    const activeArea = AREA_TABS.some((item) => item.key === routeArea) ? routeArea : 'inbound'
    const [overview, setOverview] = useState(null)
    const [controlData, setControlData] = useState(null)
    const [selectedItem, setSelectedItem] = useState(null)

    // 统一数据加载：overview 始终加载，control 仅在 count area 时加载
    useEffect(() => {
        let active = true
        workbenchApi.getOverview(selectedOrgId)
            .then((res) => { if (active) setOverview(res.data) })
            .catch((err) => showError(`加载仓储概览失败：${err.message}`))
        return () => { active = false }
    }, [selectedOrgId])

    useEffect(() => {
        if (activeArea !== 'count') {
            setControlData(null)
            return
        }
        let active = true
        workbenchApi.getControl(selectedOrgId)
            .then((res) => { if (active) setControlData(res.data) })
            .catch((err) => showError(`加载盘点数据失败：${err.message}`))
        return () => { active = false }
    }, [selectedOrgId, activeArea])

    const reloadControl = useCallback(() => {
        workbenchApi.getControl(selectedOrgId)
            .then((res) => setControlData(res.data))
            .catch((err) => showError(`刷新盘点数据失败：${err.message}`))
    }, [selectedOrgId])

    const handleAreaChange = useCallback((key) => {
        const nextParams = new URLSearchParams(searchParams)
        // 切换 area 时清除内层 tab 状态，避免参数冲突
        nextParams.delete('tab')
        navigate({
            pathname: `/ops/warehouse/${key}`,
            search: nextParams.toString() ? `?${nextParams.toString()}` : '',
        })
    }, [navigate, searchParams])

    const areaTabs = useMemo(() => AREA_TABS.map((tab) => (
        <button
            key={tab.key}
            type="button"
            className={`warehouse-workbench__tab ${activeArea === tab.key ? 'warehouse-workbench__tab--active' : ''}`}
            onClick={() => handleAreaChange(tab.key)}
        >
            {tab.label}
        </button>
    )), [activeArea, handleAreaChange])

    // 根据当前 area 构建对应的 task queue
    const taskGroups = useMemo(() => {
        const groups = []
        const inboundGroup = overview?.taskQueues?.find((g) => g.key === 'inbound')
        if (inboundGroup?.items?.length) groups.push(inboundGroup)
        const pickupGroup = overview?.taskQueues?.find((g) => g.key === 'pickup')
        if (pickupGroup?.items?.length) groups.push(pickupGroup)
        return groups
    }, [overview])

    // 异常列表
    const exceptionItems = useMemo(() => {
        if (controlData?.exceptionList?.length) return controlData.exceptionList
        const fromOverview = overview?.exceptions || []
        return fromOverview.slice(0, 6)
    }, [controlData, overview])

    return (
        <div className="warehouse-workbench-ops">
            {/* 顶级 tab 栏 */}
            <div className="warehouse-workbench__tabs">{areaTabs}</div>

            {/* 子路由内容 */}
            <div className="warehouse-workbench__layout">
                <div className="warehouse-workbench__main">
                    <Routes>
                        <Route path="inbound" element={<InboundWorkspace />} />
                        <Route path="outbound" element={<OutboundWorkspace />} />
                        <Route path="binding" element={<BindingWorkspace />} />
                        <Route path="count" element={<CountWorkspace controlData={controlData} onReload={reloadControl} />} />
                        <Route index element={<Navigate to="inbound" replace />} />
                        <Route path="*" element={<Navigate to="inbound" replace />} />
                    </Routes>
                </div>
                <aside className="warehouse-workbench__side">
                    <WarehouseTaskQueue groups={taskGroups} onSelect={setSelectedItem} selectedId={selectedItem?.id} />
                    <WarehouseExceptionPanel items={exceptionItems} onSelect={setSelectedItem} selectedId={selectedItem?.id} title="仓储相关异常" subtitle="优先看会阻塞作业动作的异常" />
                    <WarehouseDetailDrawer item={selectedItem} fallbackTitle="仓储作业提示" fallbackSummary="选中任务或异常项后，可以查看详细信息并执行后续动作。" />
                </aside>
            </div>
        </div>
    )
}

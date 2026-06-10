import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { buildAppHref } from '../../components/app/appConfig'
import { workbenchApi } from '../../services/inventoryApi'
import { showError } from '../../utils/toast'
import WarehouseWorkbenchShell from '../../components/inventory/workbench/WarehouseWorkbenchShell'
import WarehouseContextBar from '../../components/inventory/workbench/WarehouseContextBar'
import WarehouseMetricStrip from '../../components/inventory/workbench/WarehouseMetricStrip'
import WarehouseExceptionPanel from '../../components/inventory/workbench/WarehouseExceptionPanel'
import WarehouseDetailDrawer from '../../components/inventory/workbench/WarehouseDetailDrawer'
import WarehouseManager from './WarehouseManager'
import TwinWarehouseViewer from './TwinWarehouseViewer'
import TwinScanBindingPanel from './TwinScanBindingPanel'

const TABS = [
    { key: 'master', label: '仓库主数据' },
    { key: 'viewer', label: '3D 查看' },
    { key: 'bind', label: '库位绑定' },
]

export default function SpaceCenter() {
    const [searchParams, setSearchParams] = useSearchParams()
    const selectedOrgId = searchParams.get('orgId')
    const selectedWarehouseId = searchParams.get('warehouseId') || ''
    const activeTab = searchParams.get('tab') || 'master'
    const [spaceData, setSpaceData] = useState(null)
    const [selectedItem, setSelectedItem] = useState(null)
    const [search, setSearch] = useState('')
    const [sceneType, setSceneType] = useState('warehouse')

    useEffect(() => {
        workbenchApi.getSpace({ warehouseId: selectedWarehouseId || undefined }, selectedOrgId)
            .then((result) => setSpaceData(result.data))
            .catch((err) => showError(`加载空间中心失败：${err.message}`))
    }, [selectedOrgId, selectedWarehouseId])

    const metricItems = useMemo(() => ([
        { key: 'locations', label: '库位总数', value: spaceData?.locationStats?.total || 0 },
        { key: 'occupied', label: '占用库位', value: spaceData?.locationStats?.occupied || 0 },
        { key: 'objects', label: '在场货物', value: spaceData?.twinSummary?.objectCount || 0 },
        { key: 'unbound', label: '待绑定对象', value: spaceData?.unboundObjects?.length || 0 },
    ]), [spaceData])
    const selectedWarehouse = useMemo(
        () => (spaceData?.warehouses || []).find((item) => String(item.id) === String(selectedWarehouseId)) || null,
        [selectedWarehouseId, spaceData?.warehouses]
    )

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

    const filteredUnboundObjects = useMemo(() => {
        if (!search) return spaceData?.unboundObjects || []
        const keyword = search.toLowerCase()
        return (spaceData?.unboundObjects || []).filter((item) =>
            item.title.toLowerCase().includes(keyword) ||
            item.warehouseName.toLowerCase().includes(keyword)
        )
    }, [search, spaceData])

    let main = <WarehouseManager />
    if (activeTab === 'viewer') {
        const queryArgs = new URLSearchParams()
        if (selectedOrgId) queryArgs.set('orgId', selectedOrgId)
        if (selectedWarehouseId) queryArgs.set('warehouseId', selectedWarehouseId)
        queryArgs.set('sceneType', sceneType)
        queryArgs.set('projectType', 'warehouse')
        if (selectedWarehouse?.name) {
            queryArgs.set('name', selectedWarehouse.name)
            queryArgs.set('warehouseName', selectedWarehouse.name)
        }
        const queryString = queryArgs.toString()
        const designerLink = buildAppHref(`/3d-studio/new${queryString ? `?${queryString}` : ''}`)

        main = (
            <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                    <select
                        className="input"
                        value={sceneType}
                        onChange={(e) => setSceneType(e.target.value)}
                        style={{ width: 160, fontSize: 13 }}
                    >
                        <option value="warehouse">🏭 仓库模式</option>
                        <option value="outdoor-event">🏕️ 户外赛事</option>
                    </select>
                    <Link to={designerLink} className="btn btn--primary" style={{ fontSize: 13 }}>
                        🏗️ 进入空间工作台
                    </Link>
                </div>
                <TwinWarehouseViewer />
            </div>
        )
    }
    if (activeTab === 'bind') main = <TwinScanBindingPanel />

    return (
        <WarehouseWorkbenchShell
            eyebrow="空间中心"
            title="空间中心"
            summary="把仓库主数据、3D 视图和库位绑定挂到同一个仓库上下文下，避免空间流和作业流割裂。"
            tabs={tabs}
            contextBar={(
                <WarehouseContextBar
                    warehouseOptions={spaceData?.warehouses || []}
                    warehouseId={selectedWarehouseId}
                    onWarehouseChange={(value) => {
                        const nextParams = new URLSearchParams(searchParams)
                        if (value) nextParams.set('warehouseId', value)
                        else nextParams.delete('warehouseId')
                        setSearchParams(nextParams)
                    }}
                    search={search}
                    onSearchChange={setSearch}
                />
            )}
            metrics={<WarehouseMetricStrip items={metricItems} />}
            main={main}
            side={(
                <>
                    <WarehouseExceptionPanel items={filteredUnboundObjects} onSelect={setSelectedItem} selectedId={selectedItem?.id} title="待绑定对象" subtitle="先处理刚入库但还没落位的对象" />
                    <WarehouseDetailDrawer item={selectedItem} fallbackTitle="空间动作提示" fallbackSummary="选中待绑定对象后，可以直接跳去库位绑定或 3D 查看页确认落位。" />
                </>
            )}
        />
    )
}

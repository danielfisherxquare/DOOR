import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ControlContent } from '../../../features/inventory/execute/ControlContent'
import { opsInventoryApi } from '../../../services/inventoryApi'

/**
 * OPS 盘点作业子模块
 * 负责内层 tab 切换（盘点管理 / 异常中心）
 */
export default function CountWorkspace({ onReload }) {
    const [searchParams, setSearchParams] = useSearchParams()
    const activeTab = searchParams.get('tab') || 'count'

    const handleTabChange = useCallback((key) => {
        const nextParams = new URLSearchParams(searchParams)
        nextParams.set('tab', key)
        setSearchParams(nextParams)
    }, [searchParams, setSearchParams])

    return <ControlContent activeTab={activeTab} onTabChange={handleTabChange} onReload={onReload} inventoryApi={opsInventoryApi} />
}

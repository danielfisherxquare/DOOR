import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { OutboundContent } from '../../../features/inventory/execute/OutboundContent'

/**
 * OPS 出库作业子模块
 * 负责内层 tab 切换（扫码领取 / 调拨占位）
 */
export default function OutboundWorkspace() {
    const [searchParams, setSearchParams] = useSearchParams()
    const activeTab = searchParams.get('tab') || 'pickup'

    const handleTabChange = useCallback((key) => {
        const nextParams = new URLSearchParams(searchParams)
        nextParams.set('tab', key)
        setSearchParams(nextParams)
    }, [searchParams, setSearchParams])

    return <OutboundContent activeTab={activeTab} onTabChange={handleTabChange} />
}

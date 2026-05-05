import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { InboundContent } from '../../inventory/InboundCenter'

/**
 * OPS 入库作业子模块
 * 负责内层 tab 切换（预入库 / 批量入库 / 标签打印）
 */
export default function InboundWorkspace() {
    const [searchParams, setSearchParams] = useSearchParams()
    const activeTab = searchParams.get('tab') || 'batch'

    const handleTabChange = useCallback((key) => {
        const nextParams = new URLSearchParams(searchParams)
        nextParams.set('tab', key)
        setSearchParams(nextParams)
    }, [searchParams, setSearchParams])

    return <InboundContent activeTab={activeTab} onTabChange={handleTabChange} />
}

import TwinScanBindingPanel from '../../../features/inventory/execute/TwinScanBindingPanel'
import { opsInventoryApi } from '../../../services/inventoryApi'

/**
 * OPS 库位绑定子模块
 * 直接包装 TwinScanBindingPanel，传入 mode="ops" 隐藏 Space Center 特有导航
 */
export default function BindingWorkspace() {
    return <TwinScanBindingPanel mode="ops" inventoryApi={opsInventoryApi} />
}

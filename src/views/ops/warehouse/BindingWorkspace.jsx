import TwinScanBindingPanel from '../../inventory/TwinScanBindingPanel'

/**
 * OPS 库位绑定子模块
 * 直接包装 TwinScanBindingPanel，传入 mode="ops" 隐藏 Space Center 特有导航
 */
export default function BindingWorkspace() {
    return <TwinScanBindingPanel mode="ops" />
}

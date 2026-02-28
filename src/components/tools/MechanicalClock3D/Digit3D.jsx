import { memo } from 'react'
import SevenSegment3D from './SevenSegment3D'

/**
 * 3D 单个数字组件
 * 
 * @param {number} props.value - 要显示的数字 (0-9)
 * @param {number} props.prevValue - 上一次的数字
 * @param {number} props.digitDelay - 该数字在时钟中的级联延迟（ms）
 */
const Digit3D = memo(({ value, prevValue, digitDelay = 0 }) => {
    // 从 digitDelay 推算 speedMult（如果 digitDelay 包含了倍率）
    return (
        <div className="digit-3d">
            <SevenSegment3D value={value} prevValue={prevValue} digitDelay={digitDelay} />
        </div>
    )
})

Digit3D.displayName = 'Digit3D'

export default Digit3D

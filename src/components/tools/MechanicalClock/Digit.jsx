import { memo } from 'react'
import SevenSegment from './SevenSegment'

/**
 * 单个数字组件
 * 使用机械式七段显示器 (Mechanical 7-Segment Display)
 * 
 * @param {Object} props
 * @param {number} props.value - 要显示的数字 (0-9)
 * @param {number} props.prevValue - 上一次的数字（用于触发动画）
 */
const Digit = memo(({ value, prevValue }) => {
  return (
    <div className="digit">
      <SevenSegment value={value} prevValue={prevValue} />
    </div>
  )
})

Digit.displayName = 'Digit'

export default Digit
import { memo } from 'react'

/**
 * 冒号分隔符组件
 * 
 * 采用工业机械风格，与翻页显示器整体设计协调
 * 
 * @param {Object} props
 * @param {boolean} props.isRunning - 计时器是否正在运行（影响闪烁效果）
 */
const Colon = memo(({ isRunning = true }) => {
  const colonClasses = [
    'colon',
    !isRunning ? 'colon--paused' : ''
  ].filter(Boolean).join(' ')

  return (
    <div className={colonClasses}>
      <div className="colon__dot colon__dot--top" />
      <div className="colon__dot colon__dot--bottom" />
    </div>
  )
})

Colon.displayName = 'Colon'

export default Colon
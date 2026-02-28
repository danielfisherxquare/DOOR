import { memo, useEffect, useRef, useState, useMemo } from 'react'
import useMechanicalSound from '../../../hooks/useMechanicalSound'
import useClockStore from '../../../stores/clockStore'

// 七段数码管映射：数字 0-9 对应哪些笔画亮起
const DIGIT_SEGMENTS = {
  0: ['a', 'b', 'c', 'd', 'e', 'f'],
  1: ['b', 'c'],
  2: ['a', 'b', 'g', 'e', 'd'],
  3: ['a', 'b', 'g', 'c', 'd'],
  4: ['f', 'g', 'b', 'c'],
  5: ['a', 'f', 'g', 'c', 'd'],
  6: ['a', 'f', 'g', 'c', 'd', 'e'],
  7: ['a', 'b', 'c'],
  8: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  9: ['a', 'b', 'c', 'd', 'f', 'g'],
}

// 横向笔画（绕 X 轴翻转）
const HORIZONTAL_SEGMENTS = ['a', 'g', 'd']
// 纵向笔画（绕 Y 轴翻转）
const VERTICAL_SEGMENTS = ['b', 'c', 'e', 'f']

/**
 * 生成 20-120ms 的随机延迟
 * 模拟机械齿轮咬合的时间差
 */
const generateRandomDelay = () => {
  const minDelay = 20
  const maxDelay = 120
  return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay
}

/**
 * 单个笔画组件
 * 
 * 设计理念：
 * - JS 仅作为触发器，比对状态变化
 * - 添加 .flipping 类名 + 随机 animation-delay
 * - 所有动画时序由 CSS @keyframes 完全接管
 */
const Segment = memo(({ segmentId, isOn, prevOn }) => {
  const isHorizontal = HORIZONTAL_SEGMENTS.includes(segmentId)
  const [isFlipping, setIsFlipping] = useState(false)
  const [flipDirection, setFlipDirection] = useState(null)

  // 为每个笔画生成稳定的随机延迟（仅在组件挂载时生成一次）
  const randomDelay = useMemo(() => generateRandomDelay(), [])

  const { playSegmentFlipSound, getAudioContext } = useMechanicalSound()
  const isMuted = useClockStore(state => state.isMuted)

  // 动画完成后的清理定时器
  const animationEndRef = useRef(null)

  useEffect(() => {
    // 检测状态变化
    if (prevOn !== isOn && prevOn !== undefined) {
      // 设置翻转方向
      const direction = isOn ? 'to-on' : 'to-off'
      setFlipDirection(direction)
      setIsFlipping(true)

      // 播放音效（带随机延迟同步）
      if (!isMuted) {
        setTimeout(() => {
          playSegmentFlipSound(getAudioContext())
        }, randomDelay)
      }

      // 动画完成后清理状态（动画时长 100ms + 随机延迟）
      if (animationEndRef.current) {
        clearTimeout(animationEndRef.current)
      }

      const totalDuration = 100 + randomDelay + 50 // 额外 50ms 缓冲
      animationEndRef.current = setTimeout(() => {
        setIsFlipping(false)
        setFlipDirection(null)
      }, totalDuration)
    }
  }, [isOn, prevOn, isMuted, playSegmentFlipSound, randomDelay])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (animationEndRef.current) {
        clearTimeout(animationEndRef.current)
      }
    }
  }, [])

  // 构建类名
  const segmentClasses = [
    'segment',
    `segment--${segmentId}`,
    isHorizontal ? 'segment--horizontal' : 'segment--vertical',
    isOn ? 'is-on' : 'is-off',
    isFlipping ? 'is-flipping' : '',
    flipDirection ? `is-${flipDirection}` : '',
  ].filter(Boolean).join(' ')

  // 内联样式：随机动画延迟
  const segmentStyle = isFlipping ? {
    '--animation-delay': `${randomDelay}ms`,
  } : {}

  return (
    <div
      className={segmentClasses}
      style={segmentStyle}
    >
      <div
        className="segment__rotor"
        style={isFlipping ? { animationDelay: `${randomDelay}ms` } : {}}
      >
        <div className="segment__face segment__face--front" />
        <div className="segment__face segment__face--back" />
      </div>
    </div>
  )
})

Segment.displayName = 'Segment'

/**
 * 七段数码管组件
 * 
 * @param {Object} props
 * @param {number} props.value - 当前显示的数字 (0-9)
 * @param {number} props.prevValue - 上一次显示的数字（用于触发翻转动画）
 */
const SevenSegment = memo(({ value, prevValue }) => {
  // null = 前导零被抑制，不显示任何笔画
  // 0 = 实际数字零，正常显示 a,b,c,d,e,f 六段
  const activeSegments = (value !== null && value !== undefined)
    ? (DIGIT_SEGMENTS[value] ?? [])
    : []
  const prevActiveSegments = (prevValue !== null && prevValue !== undefined)
    ? (DIGIT_SEGMENTS[prevValue] ?? [])
    : []

  return (
    <div className="seven-segment">
      {/* 顶部横向笔画 */}
      <Segment
        segmentId="a"
        isOn={activeSegments.includes('a')}
        prevOn={prevActiveSegments.includes('a')}
      />
      {/* 右上纵向笔画 */}
      <Segment
        segmentId="b"
        isOn={activeSegments.includes('b')}
        prevOn={prevActiveSegments.includes('b')}
      />
      {/* 右下纵向笔画 */}
      <Segment
        segmentId="c"
        isOn={activeSegments.includes('c')}
        prevOn={prevActiveSegments.includes('c')}
      />
      {/* 底部横向笔画 */}
      <Segment
        segmentId="d"
        isOn={activeSegments.includes('d')}
        prevOn={prevActiveSegments.includes('d')}
      />
      {/* 左下纵向笔画 */}
      <Segment
        segmentId="e"
        isOn={activeSegments.includes('e')}
        prevOn={prevActiveSegments.includes('e')}
      />
      {/* 左上纵向笔画 */}
      <Segment
        segmentId="f"
        isOn={activeSegments.includes('f')}
        prevOn={prevActiveSegments.includes('f')}
      />
      {/* 中间横向笔画 */}
      <Segment
        segmentId="g"
        isOn={activeSegments.includes('g')}
        prevOn={prevActiveSegments.includes('g')}
      />
    </div>
  )
})

SevenSegment.displayName = 'SevenSegment'

export { DIGIT_SEGMENTS, HORIZONTAL_SEGMENTS, VERTICAL_SEGMENTS }
export default SevenSegment
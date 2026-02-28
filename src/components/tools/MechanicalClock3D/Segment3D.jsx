import { memo, useEffect, useRef, useState } from 'react'
import useMechanicalSound from '../../../hooks/useMechanicalSound'
import useClockStore from '../../../stores/clockStore'

// 横向笔画（绕 X 轴翻转）
const HORIZONTAL_SEGMENTS = ['a', 'g', 'd']

/**
 * Segment 级联延迟映射
 * 按照从右下角到左上角的距离排序
 * 
 *      aaa       a: 100ms (最后)
 *     f   b      f: 120ms | b: 40ms
 *      ggg       g: 60ms
 *     e   c      e: 80ms  | c: 0ms (最先)
 *      ddd       d: 20ms
 */
const SEGMENT_CASCADE_DELAY = {
    c: 0,     // 右下 — 最先
    d: 20,    // 底部
    b: 40,    // 右上
    g: 60,    // 中间
    e: 80,    // 左下
    a: 100,   // 顶部
    f: 120,   // 左上 — 最后
}

/**
 * 3D 三棱柱笔画组件
 * 
 * 每个笔画渲染为三棱柱（横截面等边三角形，3个面）：
 *   - 白色面 (OFF 态，与白色背景融合)
 *   - 黑色面 (翻转过渡态，短暂闪现)
 *   - 荧光面 (ON 态，荧光黄发光)
 * 
 * 翻转 240° 经过黑色面作为过渡（方案B：反方向退回也经过黑色面）
 * 
 * @param {number} props.digitDelay - 该数字在整体时钟中的级联延迟（ms），已含速度倍率
 */
const Segment3D = memo(({ segmentId, isOn, prevOn, digitDelay = 0 }) => {
    const isHorizontal = HORIZONTAL_SEGMENTS.includes(segmentId)
    const [isFlipping, setIsFlipping] = useState(false)
    const [flipDirection, setFlipDirection] = useState(null)

    const isSlowMotion = useClockStore(state => state.isSlowMotion)
    const speedMult = isSlowMotion ? 8 : 1

    // 基础动画时长（CSS --flip-dur 的 JS 镜像）
    const baseDuration = 150

    // segment 内部级联延迟（也需要乘以速度倍率）
    const segDelay = (SEGMENT_CASCADE_DELAY[segmentId] || 0) * speedMult

    // 总延迟 = 数字级联延迟（已含倍率） + segment级联延迟（含倍率）
    const totalDelay = digitDelay + segDelay

    // 总动画时长（也乘以倍率）
    const animDuration = baseDuration * speedMult

    const { playSegmentFlipSound, getAudioContext } = useMechanicalSound()
    const isMuted = useClockStore(state => state.isMuted)

    const animationEndRef = useRef(null)

    useEffect(() => {
        if (prevOn !== isOn && prevOn !== undefined) {
            const direction = isOn ? 'to-on' : 'to-off'
            setFlipDirection(direction)
            setIsFlipping(true)

            if (!isMuted) {
                setTimeout(() => {
                    playSegmentFlipSound(getAudioContext())
                }, totalDelay)
            }

            if (animationEndRef.current) {
                clearTimeout(animationEndRef.current)
            }

            const cleanupDelay = animDuration + totalDelay + 50
            animationEndRef.current = setTimeout(() => {
                setIsFlipping(false)
                setFlipDirection(null)
            }, cleanupDelay)
        }
    }, [isOn, prevOn, isMuted, playSegmentFlipSound, totalDelay, animDuration])

    useEffect(() => {
        return () => {
            if (animationEndRef.current) {
                clearTimeout(animationEndRef.current)
            }
        }
    }, [])

    // 构建类名
    const segmentClasses = [
        'seg3d',
        `seg3d--${segmentId}`,
        isHorizontal ? 'seg3d--h' : 'seg3d--v',
        isOn ? 'is-on' : 'is-off',
        isFlipping ? 'is-flipping' : '',
        flipDirection ? `is-${flipDirection}` : '',
    ].filter(Boolean).join(' ')

    const animStyle = isFlipping ? {
        animationDelay: `${totalDelay}ms`,
        animationDuration: `${animDuration}ms`,
    } : {}

    return (
        <div className={segmentClasses}>
            {/* 三棱柱旋转体：白色(OFF)→黑色(过渡)→荧光(ON) */}
            <div className="seg3d__body" style={animStyle}>
                <div className="seg3d__face seg3d__face--white" />
                <div className="seg3d__face seg3d__face--black" />
                <div className="seg3d__face seg3d__face--glow" />
            </div>
        </div>
    )
})

Segment3D.displayName = 'Segment3D'

export { HORIZONTAL_SEGMENTS }
export default Segment3D

import { memo } from 'react'
import Segment3D from './Segment3D'
import { DIGIT_SEGMENTS } from '../MechanicalClock/SevenSegment'

/**
 * 3D 七段数码管组件
 * 
 * @param {number} props.value - 当前显示的数字 (0-9)
 * @param {number} props.prevValue - 上一次显示的数字
 * @param {number} props.digitDelay - 该数字在整体时钟中的级联延迟（ms）
 */
const SevenSegment3D = memo(({ value, prevValue, digitDelay = 0 }) => {
    const activeSegments = (value !== null && value !== undefined)
        ? (DIGIT_SEGMENTS[value] ?? [])
        : []
    const prevActiveSegments = (prevValue !== null && prevValue !== undefined)
        ? (DIGIT_SEGMENTS[prevValue] ?? [])
        : []

    return (
        <div className="seven-segment-3d">
            <Segment3D segmentId="a" isOn={activeSegments.includes('a')} prevOn={prevActiveSegments.includes('a')} digitDelay={digitDelay} />
            <Segment3D segmentId="b" isOn={activeSegments.includes('b')} prevOn={prevActiveSegments.includes('b')} digitDelay={digitDelay} />
            <Segment3D segmentId="c" isOn={activeSegments.includes('c')} prevOn={prevActiveSegments.includes('c')} digitDelay={digitDelay} />
            <Segment3D segmentId="d" isOn={activeSegments.includes('d')} prevOn={prevActiveSegments.includes('d')} digitDelay={digitDelay} />
            <Segment3D segmentId="e" isOn={activeSegments.includes('e')} prevOn={prevActiveSegments.includes('e')} digitDelay={digitDelay} />
            <Segment3D segmentId="f" isOn={activeSegments.includes('f')} prevOn={prevActiveSegments.includes('f')} digitDelay={digitDelay} />
            <Segment3D segmentId="g" isOn={activeSegments.includes('g')} prevOn={prevActiveSegments.includes('g')} digitDelay={digitDelay} />
        </div>
    )
})

SevenSegment3D.displayName = 'SevenSegment3D'

export default SevenSegment3D

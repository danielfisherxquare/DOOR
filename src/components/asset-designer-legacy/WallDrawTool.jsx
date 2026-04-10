/**
 * WallDrawTool — 墙面绘制交互组件
 * 处理鼠标交互和绘制逻辑
 */
import { useState, useCallback, useEffect } from 'react'
import { computeSnap, distance } from '../../utils/snapEngine'

export default function WallDrawTool({
    walls = [],
    onCommit,
    onCancel,
    onPreview,
    snapEnabled = true,
    angleSnapEnabled = true,
    gridSnapEnabled = true
}) {
    const [startPoint, setStartPoint] = useState(null)
    const [previewEnd, setPreviewEnd] = useState(null)
    const [shiftPressed, setShiftPressed] = useState(false)

    // 监听 Shift 键
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Shift') setShiftPressed(true)
            if (e.key === 'Escape') {
                setStartPoint(null)
                setPreviewEnd(null)
                onPreview?.(null, null)
                onCancel?.()
            }
        }
        const handleKeyUp = (e) => {
            if (e.key === 'Shift') setShiftPressed(false)
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [onCancel])

    // 计算吸附点
    const getSnappedPoint = useCallback((point) => {
        return computeSnap(point, {
            walls,
            startPoint,
            snapEnabled,
            angleSnapEnabled,
            gridSnapEnabled,
            shiftKey: shiftPressed,
        })
    }, [walls, startPoint, snapEnabled, angleSnapEnabled, gridSnapEnabled, shiftPressed])

    const handlePointerMove = useCallback((e) => {
        e.stopPropagation()
        const rawPoint = { x: e.point.x, z: e.point.z }
        const snapped = getSnappedPoint(rawPoint)
        setPreviewEnd(snapped)
        onPreview?.(startPoint, snapped)
    }, [startPoint, getSnappedPoint, onPreview])

    const handleClick = useCallback((e) => {
        e.stopPropagation()

        const rawPoint = { x: e.point.x, z: e.point.z }
        const point = getSnappedPoint(rawPoint)

        if (!startPoint) {
            // 开始绘制
            setStartPoint(point)
            setPreviewEnd(point)
        } else {
            // 完成绘制
            const length = distance(startPoint, point)
            if (length > 0.1) {  // 最小长度 10cm
                onCommit?.({ start: startPoint, end: point })
            }
            // 链式绘制：新墙的起点是上一墙的终点
            setStartPoint(point)
            setPreviewEnd(null)
        }
    }, [startPoint, getSnappedPoint, onCommit])

    const handleDoubleClick = useCallback((e) => {
        e.stopPropagation()
        // 双击退出绘制
        setStartPoint(null)
        setPreviewEnd(null)
        onPreview?.(null, null)
        onCancel?.()
    }, [onCancel, onPreview])

    return (
        <group>
            {/* 地板交互平面 */}
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0.001, 0]}
                onPointerMove={handlePointerMove}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                visible={false}
            >
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial transparent opacity={0} />
            </mesh>

            {/* 起点标记 */}
            {startPoint && (
                <mesh position={[startPoint.x, 0.05, startPoint.z]}>
                    <sphereGeometry args={[0.1, 16, 16]} />
                    <meshStandardMaterial color="#818CF8" />
                </mesh>
            )}

            {/* 吸附点预览 */}
            {previewEnd && startPoint && (
                <mesh position={[previewEnd.x, 0.05, previewEnd.z]}>
                    <sphereGeometry args={[0.08, 12, 12]} />
                    <meshStandardMaterial color="#38bdf8" transparent opacity={0.7} />
                </mesh>
            )}
        </group>
    )
}

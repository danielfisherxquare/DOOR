/**
 * MeasureTool — 测量交互组件
 * 支持距离、面积、角度测量
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { Text } from '@react-three/drei'
import { computeSnap } from '../../utils/snapEngine'
import SimpleLine3D from './SimpleLine3D'
import {
    calculatePathLength,
    calculatePolygonArea,
    calculateAngle,
    formatDistance,
    formatArea,
    formatAngle,
} from '../../utils/measureUtils'

export default function MeasureTool({
    mode, // 'distance' | 'area' | 'angle'
    walls = [],
    onCommit,
    onCancel,
    warehouseOffset = { x: 0, z: 0 },
    gridSnapEnabled = true,
}) {
    const [points, setPoints] = useState([])
    const [previewPoint, setPreviewPoint] = useState(null)
    const [shiftPressed, setShiftPressed] = useState(false)

    const commitMeasurement = useCallback((finalPoints) => {
        if (finalPoints.length < 2) return

        let value = 0
        let label = ''

        if (mode === 'distance') {
            value = calculatePathLength(finalPoints)
            label = formatDistance(value)
        } else if (mode === 'area' && finalPoints.length >= 3) {
            value = calculatePolygonArea(finalPoints)
            label = formatArea(value)
        } else if (mode === 'angle' && finalPoints.length === 3) {
            value = calculateAngle(finalPoints[0], finalPoints[1], finalPoints[2])
            label = formatAngle(value)
        }

        onCommit?.({
            type: mode,
            points: finalPoints,
            value,
            label,
        })

        setPoints([])
        setPreviewPoint(null)
    }, [mode, onCommit])

    // 监听键盘
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Shift') setShiftPressed(true)
            if (e.key === 'Escape') {
                setPoints([])
                setPreviewPoint(null)
                onCancel?.()
            }
            if (e.key === 'Enter' && points.length >= 2) {
                commitMeasurement(points)
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
    }, [commitMeasurement, onCancel, points])

    // 计算吸附点
    const getSnappedPoint = useCallback((point) => {
        const lastPoint = points.length > 0 ? points[points.length - 1] : null
        return computeSnap(point, {
            walls,
            startPoint: lastPoint,
            snapEnabled: true,
            angleSnapEnabled: shiftPressed,
            gridSnapEnabled,
            shiftKey: shiftPressed,
        })
    }, [gridSnapEnabled, walls, shiftPressed, points])

    // 鼠标移动
    const handlePointerMove = useCallback((e) => {
        e.stopPropagation()
        const rawPoint = { x: e.point.x - warehouseOffset.x, z: e.point.z - warehouseOffset.z }
        const snapped = getSnappedPoint(rawPoint)
        setPreviewPoint(snapped)
    }, [warehouseOffset, getSnappedPoint])

    // 点击添加点
    const handleClick = useCallback((e) => {
        e.stopPropagation()

        const rawPoint = { x: e.point.x - warehouseOffset.x, z: e.point.z - warehouseOffset.z }
        const point = getSnappedPoint(rawPoint)

        if (mode === 'angle' && points.length >= 2) {
            // 角度测量只需3点
            const finalPoints = [...points, point]
            commitMeasurement(finalPoints)
        } else {
            setPoints(prev => [...prev, point])
        }
    }, [commitMeasurement, getSnappedPoint, mode, points, warehouseOffset.x, warehouseOffset.z])

    // 双击完成
    const handleDoubleClick = useCallback((e) => {
        e.stopPropagation()
        if (points.length >= 2) {
            commitMeasurement(points)
        }
    }, [commitMeasurement, points])

    // 计算预览值
    const previewValue = useMemo(() => {
        if (!previewPoint || points.length === 0) return null

        const allPoints = [...points, previewPoint]

        if (mode === 'distance') {
            const val = calculatePathLength(allPoints)
            return { value: val, label: formatDistance(val) }
        } else if (mode === 'area' && allPoints.length >= 3) {
            const val = calculatePolygonArea(allPoints)
            return { value: val, label: formatArea(val) }
        } else if (mode === 'angle' && allPoints.length === 3) {
            const val = calculateAngle(allPoints[0], allPoints[1], allPoints[2])
            return { value: val, label: formatAngle(val) }
        }

        return null
    }, [mode, points, previewPoint])

    // 渲染测量线点
    const linePoints = useMemo(() => {
        const allPoints = previewPoint ? [...points, previewPoint] : points
        return allPoints.map(p => [p.x + warehouseOffset.x, 0.02, p.z + warehouseOffset.z])
    }, [points, previewPoint, warehouseOffset])

    // 预览标签位置
    const labelPosition = useMemo(() => {
        if (!previewPoint) return null
        return [
            previewPoint.x + warehouseOffset.x,
            0.5,
            previewPoint.z + warehouseOffset.z
        ]
    }, [previewPoint, warehouseOffset])

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

            {/* 已选点 */}
            {points.map((p, i) => (
                <mesh key={i} position={[p.x + warehouseOffset.x, 0.05, p.z + warehouseOffset.z]}>
                    <sphereGeometry args={[0.1, 16, 16]} />
                    <meshStandardMaterial color="#F59E0B" />
                </mesh>
            ))}

            {/* 预览点 */}
            {previewPoint && (
                <mesh position={[previewPoint.x + warehouseOffset.x, 0.05, previewPoint.z + warehouseOffset.z]}>
                    <sphereGeometry args={[0.08, 12, 12]} />
                    <meshStandardMaterial color="#FBBF24" transparent opacity={0.7} />
                </mesh>
            )}

            {/* 测量线 */}
            {linePoints.length >= 2 && (
                <SimpleLine3D
                    points={linePoints}
                    color="#F59E0B"
                    opacity={0.95}
                />
            )}

            {/* 面积测量闭合线 */}
            {mode === 'area' && points.length >= 2 && previewPoint && (
                <SimpleLine3D
                    points={[
                        [points[points.length - 1].x + warehouseOffset.x, 0.02, points[points.length - 1].z + warehouseOffset.z],
                        [points[0].x + warehouseOffset.x, 0.02, points[0].z + warehouseOffset.z],
                    ]}
                    color="#F59E0B"
                    opacity={0.75}
                />
            )}

            {/* 预览值标签 */}
            {previewValue && labelPosition && (
                <Text
                    position={labelPosition}
                    fontSize={0.2}
                    color="#F59E0B"
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={0.02}
                    outlineColor="#000000"
                >
                    {previewValue.label}
                </Text>
            )}
        </group>
    )
}

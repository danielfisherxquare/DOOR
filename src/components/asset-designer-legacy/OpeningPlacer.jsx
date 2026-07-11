/**
 * OpeningPlacer — 门窗放置交互组件
 * 在选中的墙体上放置门窗开口
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { getWallLength, getWallAngle } from '../../utils/snapEngine'
import { openingsOverlap } from '../../utils/csgUtils'
import { ENTRY_OPENING_PRESETS, WINDOW_PRESETS } from '../../data/openingPresets'

export default function OpeningPlacer({
    walls = [],
    selection,
    openingType = 'door',
    activePreset,
    onPlace,
    onCancel,
    warehouseOffset = { x: 0, z: 0 }, // 墙体局部坐标到世界坐标的偏移
}) {
    const [previewPosition, setPreviewPosition] = useState(null)
    const [targetWall, setTargetWall] = useState(null)

    // 获取当前选中的预设
    const preset = activePreset || (openingType === 'door' ? ENTRY_OPENING_PRESETS[0] : WINDOW_PRESETS[0])

    // 将世界坐标点投影到局部坐标的墙体上
    const projectToWall = useCallback((worldPoint, wall) => {
        const length = getWallLength(wall)
        if (length < 0.1) return 0.5

        // 将世界坐标转换为墙体的局部坐标
        const localX = worldPoint.x - warehouseOffset.x
        const localZ = worldPoint.z - warehouseOffset.z

        const angle = getWallAngle(wall) * (Math.PI / 180)

        // 计算点到墙起点的投影距离（使用局部坐标）
        const dx = localX - wall.start.x
        const dz = localZ - wall.start.z

        // 沿墙方向的投影
        const wallDirX = Math.cos(angle)
        const wallDirZ = Math.sin(angle)
        const projection = dx * wallDirX + dz * wallDirZ

        // 转换为相对位置 (0-1)
        const relativePos = projection / length

        // 限制在有效范围内
        const halfWidth = preset.width / 2 / length
        const minPos = Math.max(0.05, halfWidth + 0.05)
        const maxPos = Math.min(0.95, 1 - halfWidth - 0.05)

        return Math.max(minPos, Math.min(maxPos, relativePos))
    }, [preset, warehouseOffset])

    const handlePointerMove = useCallback((e) => {
        e.stopPropagation()

        // 需要选中墙体才能放置
        if (selection?.type !== 'wall') {
            setPreviewPosition(null)
            setTargetWall(null)
            return
        }

        const wall = walls.find(w => w.id === selection.id)
        if (!wall) {
            setPreviewPosition(null)
            setTargetWall(null)
            return
        }

        setTargetWall(wall)

        const relativePos = projectToWall({ x: e.point.x, z: e.point.z }, wall)
        setPreviewPosition(relativePos)
    }, [selection, walls, projectToWall])

    const handleClick = useCallback((e) => {
        if (!targetWall || previewPosition === null) return
        e.stopPropagation()

        const length = getWallLength(targetWall)

        // 检查是否与现有开口重叠
        const existingOpenings = targetWall.openings || []
        const newOpening = {
            position: previewPosition,
            width: preset.width,
        }

        const hasOverlap = existingOpenings.some(op =>
            openingsOverlap(newOpening, op, length)
        )

        if (hasOverlap) {
            console.warn('开口位置重叠')
            return
        }

        const opening = {
            id: `OP${Date.now()}`,
            type: openingType,
            position: previewPosition,
            width: preset.width,
            height: preset.height,
            sillHeight: openingType === 'window' ? preset.sillHeight : 0,
            prefabId: preset.id,
        }

        onPlace?.(targetWall.id, opening)
    }, [targetWall, previewPosition, openingType, preset, onPlace])

    // 键盘事件
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onCancel?.()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onCancel])

    return (
        <group>
            {/* 预览指示器 */}
            {targetWall && previewPosition !== null && (
                <WallOpeningPreview
                    wall={targetWall}
                    position={previewPosition}
                    preset={preset}
                    type={openingType}
                    warehouseOffset={warehouseOffset}
                />
            )}

            {/* 地板交互平面 */}
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0.001, 0]}
                onPointerMove={handlePointerMove}
                onClick={handleClick}
                visible={false}
            >
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial transparent opacity={0} />
            </mesh>

            {/* 提示信息 */}
            {selection?.type !== 'wall' && (
                <mesh position={[0, 0.01, 0]}>
                    <planeGeometry args={[2, 0.3]} />
                    <meshBasicMaterial color="#1E1E24" transparent opacity={0.8} />
                </mesh>
            )}
        </group>
    )
}

// 预览组件
function WallOpeningPreview({ wall, position, preset, type, warehouseOffset }) {
    const worldPos = useMemo(() => {
        const length = getWallLength(wall)
        const angle = getWallAngle(wall) * (Math.PI / 180)
        // 计算局部坐标
        const localX = wall.start.x + position * length * Math.cos(angle)
        const localZ = wall.start.z + position * length * Math.sin(angle)

        // 转换为世界坐标
        const worldX = localX + (warehouseOffset?.x || 0)
        const worldZ = localZ + (warehouseOffset?.z || 0)

        const sillHeight = type === 'window' ? (preset.sillHeight || 0.9) : 0
        const y = sillHeight + preset.height / 2

        return [worldX, y, worldZ]
    }, [wall, position, preset, type, warehouseOffset])

    const color = type === 'door' ? '#818CF8' : '#38bdf8'

    return (
        <mesh position={worldPos}>
            <boxGeometry args={[preset.width, preset.height, 0.25]} />
            <meshStandardMaterial
                color={color}
                transparent
                opacity={0.5}
            />
        </mesh>
    )
}

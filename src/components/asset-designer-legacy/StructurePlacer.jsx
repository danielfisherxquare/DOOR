/**
 * StructurePlacer — 结构元素放置交互
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { COLUMN_PRESETS, BEAM_PRESETS, STAIR_PRESETS, RAMP_PRESETS } from '../../data/structurePresets'
import { snapToGrid, GRID_SIZE } from '../../utils/snapEngine'

export default function StructurePlacer({
    structureType = 'column',
    activePreset,
    onPlace,
    onCancel,
    warehouseOffset = { x: 0, z: 0 },
}) {
    const [previewPos, setPreviewPos] = useState(null)
    const [rotation, setRotation] = useState(0)

    const preset = activePreset || useMemo(() => {
        switch (structureType) {
            case 'column': return COLUMN_PRESETS[0]
            case 'beam': return BEAM_PRESETS[0]
            case 'stair': return STAIR_PRESETS[0]
            case 'ramp': return RAMP_PRESETS[0]
            default: return null
        }
    }, [structureType])

    const handlePointerMove = useCallback((e) => {
        e.stopPropagation()
        const localX = e.point.x - warehouseOffset.x
        const localZ = e.point.z - warehouseOffset.z
        setPreviewPos(snapToGrid({ x: localX, z: localZ }, GRID_SIZE))
    }, [warehouseOffset])

    const handleClick = useCallback((e) => {
        if (!previewPos || !preset) return
        e.stopPropagation()

        const structure = {
            id: `S${Date.now()}`,
            type: structureType,
            position: { x: previewPos.x, y: 0, z: previewPos.z },
            rotation: rotation,
            dimensions: { ...preset.dimensions },
            presetId: preset.id,
            // 复制特定属性
            ...(preset.columnType && { columnType: preset.columnType }),
            ...(preset.stairType && { stairType: preset.stairType, stairSteps: preset.stairSteps, stepHeight: preset.stepHeight, stepDepth: preset.stepDepth, stairWidth: preset.stairWidth }),
            ...(preset.rampType && { rampType: preset.rampType, rampWidth: preset.rampWidth, rampSlope: preset.rampSlope }),
        }

        onPlace?.(structure)
    }, [previewPos, preset, structureType, rotation, onPlace])

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onCancel?.()
            // R 键旋转预览
            if (e.key === 'r' || e.key === 'R') {
                setRotation(r => r + Math.PI / 4)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onCancel])

    // 预览尺寸
    const previewWidth = preset?.dimensions?.width || 0.5
    const previewHeight = preset?.dimensions?.height || 1
    const previewDepth = preset?.dimensions?.depth || 0.5

    return (
        <group>
            {/* 预览 */}
            {previewPos && preset && (
                <group
                    position={[
                        previewPos.x + warehouseOffset.x,
                        previewHeight / 2,
                        previewPos.z + warehouseOffset.z
                    ]}
                    rotation={[0, rotation, 0]}
                >
                    {structureType === 'column' && preset.columnType === 'circular' ? (
                        <mesh>
                            <cylinderGeometry args={[previewWidth / 2, previewWidth / 2, previewHeight, 24]} />
                            <meshStandardMaterial color="#818CF8" transparent opacity={0.4} />
                        </mesh>
                    ) : (
                        <mesh>
                            <boxGeometry args={[previewWidth, previewHeight, previewDepth]} />
                            <meshStandardMaterial color="#818CF8" transparent opacity={0.4} />
                        </mesh>
                    )}

                    {/* 旋转指示器 */}
                    <mesh position={[0, previewHeight / 2 + 0.1, 0]}>
                        <coneGeometry args={[0.1, 0.2, 4]} />
                        <meshStandardMaterial color="#38bdf8" transparent opacity={0.6} />
                    </mesh>
                </group>
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
        </group>
    )
}

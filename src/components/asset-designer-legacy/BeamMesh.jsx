/**
 * BeamMesh — 梁渲染组件
 */
import { useMemo } from 'react'
import { Edges } from '@react-three/drei'
import { getStructurePreset } from '../../data/structurePresets'

export default function BeamMesh({
    structure,
    isSelected,
    onClick,
    mode,
}) {
    const preset = useMemo(() => {
        if (structure?.presetId) return getStructurePreset(structure.presetId)
        return null
    }, [structure?.presetId])

    const dimensions = structure?.dimensions || preset?.dimensions || { width: 0.3, height: 0.5, depth: 4.0 }
    const color = preset?.color || '#9CA3AF'
    const position = structure?.position || { x: 0, y: 0, z: 0 }
    const rotation = structure?.rotation || 0

    const { x, y, z } = position
    const { width, height, depth } = dimensions

    // 梁通常悬挂在某个高度，Y 表示梁底高度
    return (
        <group position={[x, y, z]} rotation={[0, rotation, 0]}>
            <mesh
                onClick={(e) => {
                    e.stopPropagation()
                    if (mode === 'select' || mode === 'delete') {
                        onClick?.()
                    }
                }}
                castShadow
                receiveShadow
            >
                {/* depth 为梁长度方向，width 为梁宽度 */}
                <boxGeometry args={[depth, height, width]} />
                <meshStandardMaterial
                    color={isSelected ? '#A5B4FC' : color}
                    roughness={0.7}
                />
                {isSelected && <Edges scale={1.02} color="#818CF8" />}
            </mesh>
        </group>
    )
}
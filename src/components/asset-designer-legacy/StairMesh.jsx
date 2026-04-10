/**
 * StairMesh — 楼梯渲染组件
 */
import { useMemo } from 'react'
import { Edges } from '@react-three/drei'
import { getStructurePreset } from '../../data/structurePresets'

export default function StairMesh({
    structure,
    isSelected,
    onClick,
    mode,
}) {
    const preset = useMemo(() => {
        if (structure?.presetId) return getStructurePreset(structure.presetId)
        return null
    }, [structure?.presetId])

    const stairSteps = structure?.stairSteps || preset?.stairSteps || 12
    const stepHeight = structure?.stepHeight || preset?.stepHeight || 0.175
    const stepDepth = structure?.stepDepth || preset?.stepDepth || 0.28
    const stairWidth = structure?.stairWidth || preset?.stairWidth || 1.2
    const color = preset?.color || '#78716C'
    const position = structure?.position || { x: 0, y: 0, z: 0 }
    const rotation = structure?.rotation || 0

    const { x, y, z } = position

    // 生成踏步几何体
    const steps = useMemo(() => {
        const result = []
        for (let i = 0; i < stairSteps; i++) {
            result.push({
                stepIndex: i,
                positionY: i * stepHeight + stepHeight / 2,
                positionZ: i * stepDepth + stepDepth / 2,
            })
        }
        return result
    }, [stairSteps, stepHeight, stepDepth])

    const totalHeight = stairSteps * stepHeight
    const totalDepth = stairSteps * stepDepth

    return (
        <group position={[x, y, z]} rotation={[0, rotation, 0]}>
            {/* 踏步 */}
            {steps.map((step) => (
                <mesh
                    key={step.stepIndex}
                    position={[0, step.positionY, step.positionZ]}
                    castShadow
                    receiveShadow
                >
                    <boxGeometry args={[stairWidth, stepHeight, stepDepth]} />
                    <meshStandardMaterial
                        color={isSelected ? '#A5B4FC' : color}
                        roughness={0.8}
                    />
                </mesh>
            ))}

            {/* 侧板 */}
            <mesh
                position={[-stairWidth / 2 - 0.02, totalHeight / 2, totalDepth / 2]}
                castShadow
            >
                <boxGeometry args={[0.04, totalHeight, totalDepth]} />
                <meshStandardMaterial color={color} roughness={0.8} />
            </mesh>
            <mesh
                position={[stairWidth / 2 + 0.02, totalHeight / 2, totalDepth / 2]}
                castShadow
            >
                <boxGeometry args={[0.04, totalHeight, totalDepth]} />
                <meshStandardMaterial color={color} roughness={0.8} />
            </mesh>

            {/* 选择边框 */}
            {isSelected && (
                <mesh position={[0, totalHeight / 2, totalDepth / 2]}>
                    <boxGeometry args={[stairWidth + 0.1, totalHeight + 0.1, totalDepth + 0.1]} />
                    <meshBasicMaterial color="#818CF8" wireframe />
                </mesh>
            )}

            {/* 交互平面 */}
            <mesh
                position={[0, 0.01, totalDepth / 2]}
                onClick={(e) => {
                    e.stopPropagation()
                    if (mode === 'select' || mode === 'delete') {
                        onClick?.()
                    }
                }}
                visible={false}
            >
                <boxGeometry args={[stairWidth, 0.02, totalDepth]} />
                <meshBasicMaterial transparent opacity={0} />
            </mesh>
        </group>
    )
}